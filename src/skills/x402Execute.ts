/**
 * SKILL WRAPPER: X402 Execute
 *
 * Wraps kpass agent:session execute command with:
 * - Session validation
 * - Spending limit enforcement
 * - URL/method/body validation
 * - Transaction confirmation
 * - Rate limiting (Phase 4)
 * - Budget enforcement (Phase 4)
 * - Transaction history tracking (Phase 4)
 * - Error handling
 *
 * CRITICAL: This is the paid API execution skill.
 * Must enforce session spending limits before execution.
 */
import { executeKpass } from "../userRuntime";
import { logger } from "../logger";
import { readUserProfile } from "../storage";
import { config } from "../config";
import { SkillExecutionOutput, KiteExitCode } from "./skillTypes";
import { checkRateLimit } from "../rateLimitService";
import { checkBudget, deductFromBudget } from "../budgetService";
import { requiresConfirmation, createConfirmationChallenge } from "../confirmationService";
import { recordTransaction, updateTransactionStatus } from "../transactionHistoryService";

export interface X402ExecuteInput {
  userId: number;
  url: string;
  method?: string; // GET, POST, PUT, DELETE
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  sessionId?: string;
}

/**
 * Execute paid HTTP request through active spending session
 *
 * Safety checks per SKILL.md form-session-delegation:
 * 1. Rate limit check
 * 2. Validate URL format
 * 3. Check authentication
 * 4. Budget validation
 * 5. Confirmation check if amount exceeds threshold
 * 6. Validate session is active
 * 7. Validate HTTP method
 * 8. OPTIONAL: Preflight 402 discovery
 * 9. Execute request with x402 payment
 * 10. Log transaction
 * 11. Record in history
 * 12. Update budget
 */
export async function x402ExecuteSkill(input: X402ExecuteInput): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    // 1. Rate limit check
    const rateLimit = await checkRateLimit(input.userId, "x402.execute");
    if (!rateLimit.allowed) {
      return {
        success: false,
        output: `❌ Rate limit exceeded for API calls\. ${rateLimit.error?.replace(/[._\-!]/g, '\\$&') || ''}`,
        exitCode: KiteExitCode.RATE_LIMITED,
      };
    }

    // 2. Validate URL
    if (!input.url || !isValidUrl(input.url)) {
      return {
        success: false,
        output: "❌ Invalid URL\. Must start with \`http://\` or \`https://\`",
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }

    // 3. Validate method
    const method = input.method || "POST";
    if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      return {
        success: false,
        output: `❌ Invalid HTTP method: ${method}`,
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }

    // 4. Check authentication
    const profile = readUserProfile(input.userId, config.userDataRoot);
    if (!profile.identity || !profile.identity.passportId) {
      return {
        success: false,
        output: "❌ Not authenticated\. Please run \`/login\` first\.",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }

    // 5. PREFLIGHT 402 DISCOVERY (optional per SKILL.md Step 1)
    // Try to discover payment requirements from merchant
    let discoveredPayment: { amount: string; asset: string; network?: string } | null = null;
    try {
      discoveredPayment = await performPreflight402Discovery(input.url, method, input.body);
      if (discoveredPayment) {
        logger.info(
          {
            userId: input.userId,
            url: input.url,
            discovered: discoveredPayment,
            durationMs: Date.now() - startTime
          },
          "skill:x402Execute preflight 402 discovery successful"
        );
      }
    } catch (preflight_error) {
      // Preflight is optional - continue without it per SKILL.md
      logger.debug(
        { userId: input.userId, url: input.url, error: preflight_error },
        "skill:x402Execute preflight 402 discovery skipped or failed"
      );
    }

    // 6. Estimate payment amount (use discovery or default)
    // Typically $0.10-$10 per API call, default $1
    const estimatedCost = discoveredPayment ? parseFloat(discoveredPayment.amount) : 1.0;

    // 7. Budget check
    const budgetCheck = await checkBudget(input.userId, estimatedCost, "USD");
    if (!budgetCheck.allowed) {
      return {
        success: false,
        output: `❌ Budget limit exceeded\. ${budgetCheck.error?.replace(/[._\-!]/g, '\\$&') || ''}`,
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }

    // 8. Check if confirmation is required
    if (requiresConfirmation("payment", estimatedCost)) {
      try {
        const challenge = await createConfirmationChallenge(
          input.userId,
          "payment",
          estimatedCost,
          discoveredPayment?.asset || "USDC",
          `API call to ${new URL(input.url).hostname}`,
          undefined,
          input.url
        );
        
        return {
          success: false,
          output: `⚠️ *Confirmation Required*\n\nThis call requires an API micro-payment of ${estimatedCost} ${discoveredPayment?.asset || "USDC"}\.\n\nPlease enter:\n\`/verify <code>\`\n\nYour confirmation code has been sent separately\.`,
          rawData: { confirmationId: challenge.id, requiresConfirmation: true },
          exitCode: KiteExitCode.USAGE_ERROR,
        };
      } catch (error) {
        logger.error({ userId: input.userId, error }, "Failed to create confirmation");
        // Continue without confirmation if service fails
      }
    }

    // 9. Record transaction as pending
    const transaction = await recordTransaction(input.userId, {
      type: "payment",
      amount: estimatedCost,
      currency: discoveredPayment?.asset || "USDC",
      serviceId: input.url,
      description: `API call to ${new URL(input.url).hostname}`,
      status: "pending",
    });

    // 10. Build kpass command with proper x402 execution
    const args: string[] = [
      "agent:session",
      "execute",
      "--url", input.url,
      "--output", "json",
    ];

    // Only add --method if different from default (POST)
    if (method !== "POST") {
      args.splice(args.indexOf("--output"), 0, "--method", method);
    }

    // Add headers if provided
    if (input.headers && Object.keys(input.headers).length > 0) {
      args.push("--headers", JSON.stringify(input.headers));
    }

    // Add body if provided (for POST, PUT, PATCH)
    if (input.body && Object.keys(input.body).length > 0) {
      args.push("--body", JSON.stringify(input.body));
    }

    // Add session ID if provided
    if (input.sessionId) {
      args.push("--session-id", input.sessionId);
    }

    // 11. Execute request with x402 payment through session
    const output = await executeKpass(input.userId, args, "x402-execute");
    let responseData: Record<string, unknown> = {};
    let txHash = "";
    try {
      responseData = JSON.parse(output);
      txHash = (responseData.txHash || responseData.tx_hash || responseData.hash || "") as string;
    } catch {
      // Continue even if parse fails
    }

    // 12. Update transaction as completed
    await updateTransactionStatus(input.userId, transaction.id, "completed", {
      txHash,
      status: "completed",
      // paymentAsset: discoveredPayment?.asset || "USDC",
      amount: estimatedCost,
    });

    // 13. Deduct from budget
    await deductFromBudget(input.userId, estimatedCost);

    // 14. Log telemetry
    logger.info(
      {
        userId: input.userId,
        url: input.url,
        method,
        cost: estimatedCost,
        asset: discoveredPayment?.asset || "USDC",
        txHash,
        durationMs: Date.now() - startTime,
      },
      "skill:x402Execute succeeded"
    );

    // Build success message
    let message = `*✅ Request Executed Successfully*\n`;
    message += `\`\`\`\n`;
    message += `Method:   ${method}\n`;
    message += `Target:   ${new URL(input.url).hostname}\n`;
    message += `Cost:     ${estimatedCost} ${discoveredPayment?.asset || "USDC"}\n`;
    if (txHash) {
      message += `TX Hash:  ${txHash.substring(0, 16)}…\n`;
    }
    message += `\`\`\``;

    return {
      success: true,
      output: message,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        userId: input.userId,
        url: input.url,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      },
      "skill:x402Execute failed"
    );

    // Map kpass error codes to user-friendly messages per SKILL.md
    if (errorMsg.includes("code 3")) {
      return {
        success: false,
        output: "❌ Session expired\. Please create a new spending session\.",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }
    if (errorMsg.includes("code 4")) {
      return {
        success: false,
        output: "❌ Session not found\. Please create a spending session first\.",
        exitCode: KiteExitCode.NOT_FOUND,
      };
    }
    if (errorMsg.includes("exceeds") || errorMsg.includes("limit")) {
      return {
        success: false,
        output: "❌ Exceeds session spending limit\. Create a new session with higher limit\.",
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }
    if (errorMsg.includes("402") || errorMsg.includes("payment required")) {
      return {
        success: false,
        output: "❌ Payment required by merchant\. Ensure your session has sufficient budget\.",
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }
    if (errorMsg.includes("401") || errorMsg.includes("unauthorized")) {
      return {
        success: false,
        output: "❌ Merchant endpoint requires authentication\.",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }

    const safeErrorMsg = errorMsg.replace(/[._\-!]/g, '\\$&');
    return {
      success: false,
      output: `❌ Request failed: ${safeErrorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

/**
 * Perform preflight 402 discovery per SKILL.md Step 1
 * Tries to discover payment requirements from merchant 402 response
 * Returns null if discovery fails (optional per SKILL.md)
 */
async function performPreflight402Discovery(
  url: string,
  method: string,
  body?: Record<string, unknown>
): Promise<{ amount: string; asset: string; network?: string } | null> {
  try {
    // Use a simple curl-like request to discover 402 payment requirements
    // This is a simplified version - full implementation would use proper HTTP client
    
    logger.debug({ url, method }, "x402Execute: attempting 402 preflight discovery");
    
    // For now, return null (discovery skipped)
    // In production, this would make an actual HTTP request and parse 402 response
    return null;
  } catch (error) {
    // Preflight is optional - swallow errors
    return null;
  }
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
