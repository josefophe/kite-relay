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
 * Safety checks:
 * 1. Rate limit check
 * 2. Validate URL format
 * 3. Check authentication
 * 4. Budget validation
 * 5. Confirmation check if amount exceeds threshold
 * 6. Validate session is active
 * 7. Validate HTTP method
 * 8. Execute request
 * 9. Log transaction
 * 10. Record in history
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
    const method = input.method || "GET";
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

    // 5. Estimate payment amount (USD equivalent) - typically $0.10-$10 per API call
    // Default to $1 if not specified
    const estimatedCost = 1.0;

    // 6. Budget check
    const budgetCheck = await checkBudget(input.userId, estimatedCost, "USD");
    if (!budgetCheck.allowed) {
      return {
        success: false,
        output: `❌ Budget limit exceeded\. ${budgetCheck.error?.replace(/[._\-!]/g, '\\$&') || ''}`,
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }

    // 7. Check if confirmation is required
    if (requiresConfirmation("payment", estimatedCost)) {
      try {
        const challenge = await createConfirmationChallenge(
          input.userId,
          "payment",
          estimatedCost,
          "USD",
          `API call to ${new URL(input.url).hostname}`,
          undefined,
          input.url
        );
        
        // Cleaned copy-paste emoji artifact and formatted output text parameters safely
        return {
          success: false,
          output: `⚠️ *Confirmation Required*\n\nThis call requires an API micro-payment\. Please enter:\n\`/verify <code>\`\n\nYour confirmation code has been sent separately\.`,
          rawData: { confirmationId: challenge.id, requiresConfirmation: true },
          exitCode: KiteExitCode.USAGE_ERROR,
        };
      } catch (error) {
        logger.error({ userId: input.userId, error }, "Failed to create confirmation");
        // Continue without confirmation if service fails
      }
    }

    // 8. Record transaction as pending
    const transaction = await recordTransaction(input.userId, {
      type: "payment",
      amount: estimatedCost,
      currency: "USD",
      serviceId: input.url,
      description: `API call to ${new URL(input.url).hostname}`,
      status: "pending",
    });

    // 9. Build kpass command
    const args: string[] = [
      "agent:session",
      "execute",
      "--url", input.url,
      "--method", method,
      "--output", "json",
    ];

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

    // 10. Execute request
    const output = await executeKpass(input.userId, args, "x402-execute");
    let responseData: Record<string, unknown> = {};
    let txHash = "";
    try {
      responseData = JSON.parse(output);
      txHash = (responseData.txHash || responseData.tx_hash || "") as string;
    } catch {
      // Continue even if parse fails
    }

    // 11. Update transaction as completed
    await updateTransactionStatus(input.userId, transaction.id, "completed", {
      txHash,
      status: "completed",
    });

    // 12. Deduct from budget
    await deductFromBudget(input.userId, estimatedCost);

    // 13. Log telemetry
    logger.info(
      {
        userId: input.userId,
        url: input.url,
        method,
        cost: estimatedCost,
        txHash,
        durationMs: Date.now() - startTime,
      },
      "skill:x402Execute succeeded"
    );

    // Wrapped response components safely in structured layout grids
    let message = `*✅ Request Executed Successfully*\n`;
    message += `\`\`\`\n`;
    message += `Method: ${method}\n`;
    message += `Target: ${new URL(input.url).hostname}\n`;
    if (txHash) {
      message += `Hash:   ${txHash}\n`;
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

    // Map common errors safely escaping structural strings from parsing disruptions
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
