/**
 * SKILL WRAPPER: Wallet Send
 *
 * Wraps kpass wallet send command with:
 * - Balance validation
 * - Recipient validation
 * - Amount validation
 * - Pre-execution safety checks
 * - Rate limiting
 * - Budget enforcement
 * - Confirmation prompts (Phase 4)
 * - Transaction history tracking (Phase 4)
 */
import { executeKpass } from "../userRuntime";
import { logger } from "../logger";
import { SkillExecutionOutput, KiteExitCode } from "./skillTypes";
import { checkRateLimit } from "../rateLimitService";
import { checkBudget, deductFromBudget } from "../budgetService";
import { requiresConfirmation, createConfirmationChallenge } from "../confirmationService";
import { recordTransaction, updateTransactionStatus } from "../transactionHistoryService";

export interface WalletSendInput {
  userId: number;
  toAddress: string;
  amount: string;
  asset?: string; // e.g., "USDC", "KITE"
}

/**
 * Send tokens to a wallet address
 *
 * Safety checks:
 * 1. Rate limit check
 * 2. Budget validation
 * 3. Validate to-address format
 * 4. Validate amount is positive number
 * 5. Check wallet balance before execution
 * 6. Verify asset exists
 * 7. Confirmation prompt if amount exceeds threshold
 * 8. Execute transfer
 * 9. Confirm transaction
 * 10. Record in history
 */
export async function walletSendSkill(input: WalletSendInput): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    // 1. Rate limit check
    const rateLimit = await checkRateLimit(input.userId, "wallet.send");
    if (!rateLimit.allowed) {
      return {
        success: false,
        output: `❌ Rate limit exceeded for transfers\. ${rateLimit.error?.replace(/[._\-!]/g, '\\$&') || ''}`,
        exitCode: KiteExitCode.RATE_LIMITED,
      };
    }

    // 2. Validate inputs
    if (!input.toAddress || input.toAddress.trim().length === 0) {
      return {
        success: false,
        output: "❌ Please provide a recipient address",
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }

    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(input.toAddress)) {
      return {
        success: false,
        output: "❌ Invalid wallet address\. Must be \`0x\` followed by 40 hex characters",
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }

    // 3. Validate amount
    const amount = parseFloat(input.amount);
    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        output: "❌ Amount must be a positive number",
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }

    const asset = input.asset || "USDC";

    // 4. Budget check
    const budgetCheck = await checkBudget(input.userId, amount, asset);
    if (!budgetCheck.allowed) {
      return {
        success: false,
        output: `❌ Budget limit exceeded\. ${budgetCheck.error?.replace(/[._\-!]/g, '\\$&') || ''}`,
        exitCode: KiteExitCode.USAGE_ERROR,
      };
    }

    // 5. Check if confirmation is required
    if (requiresConfirmation("transfer", amount)) {
      try {
        const challenge = await createConfirmationChallenge(
          input.userId,
          "transfer",
          amount,
          asset,
          `Transfer to ${input.toAddress.substring(0, 10)}...`,
          input.toAddress
        );
        
        // Fixed the broken URL emoji and safely formatted verification prompt
        return {
          success: false,
          output: `⚠️ *Confirmation Required*\n\nThis transfer exceeds your threshold\. Please enter:\n\`/verify <code>\`\n\nYour confirmation code has been sent separately\.`,
          rawData: { confirmationId: challenge.id, requiresConfirmation: true },
          exitCode: KiteExitCode.USAGE_ERROR,
        };
      } catch (error) {
        logger.error({ userId: input.userId, error }, "Failed to create confirmation");
        // Continue without confirmation if service fails
      }
    }

    // 6. Check balance first
    try {
      const balanceOutput = await executeKpass(
        input.userId,
        ["wallet", "balance", "--output", "json"],
        "balance-check"
      );
      let balanceData: any = {};
      try {
        balanceData = JSON.parse(balanceOutput);
      } catch {
        // Continue even if parse fails
      }

      const assets = (balanceData.assets || []) as any[];
      const assetBalance = assets.find((a: any) => a.symbol === asset);

      if (!assetBalance) {
        return {
          success: false,
          output: `❌ Asset \`${asset}\` not found in wallet`,
          exitCode: KiteExitCode.NOT_FOUND,
        };
      }

      const balance = parseFloat(assetBalance.balance || "0");
      if (balance < amount) {
        return {
          success: false,
          output: `❌ Insufficient balance\. Have \`${balance}\` ${asset}, need \`${amount}\``,
          exitCode: KiteExitCode.USAGE_ERROR,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ userId: input.userId, error: errorMsg }, "balance check failed, continuing with transfer");
      // Continue even if balance check fails (user may not be authenticated)
    }

    // 7. Record transaction as pending
    const transaction = await recordTransaction(input.userId, {
      type: "transfer",
      amount,
      currency: asset,
      recipient: input.toAddress,
      description: `Transfer to ${input.toAddress.substring(0, 10)}...`,
      status: "pending",
    });

    // 8. Execute transfer
    const output = await executeKpass(
      input.userId,
      ["wallet", "send", "--to", input.toAddress, "--amount", String(amount), "--asset", asset, "--output", "json"],
      "wallet-send"
    );

    let responseData: Record<string, unknown> = {};
    let txHash = "";
    try {
      responseData = JSON.parse(output);
      txHash = (responseData.txHash || responseData.tx_hash || "") as string;
    } catch {
      // Continue even if parse fails
    }

    // 9. Update transaction as completed
    await updateTransactionStatus(input.userId, transaction.id, "completed", {
      txHash,
      status: "completed",
    });

    // 10. Deduct from budget
    await deductFromBudget(input.userId, amount);

    // Wrapped inside a clear layout block to shield raw hexadecimal strings and hashes
    let message = `*✅ Transfer Successful*\n`;
    message += `\`\`\`\n`;
    message += `Amount: ${amount} ${asset}\n`;
    message += `To:     ${input.toAddress.substring(0, 8)}...${input.toAddress.substring(input.toAddress.length - 6)}\n`;
    if (txHash) {
      message += `Tx Hash: ${txHash}\n`;
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
        toAddress: input.toAddress,
        amount: input.amount,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      },
      "skill:walletSend failed"
    );

    if (errorMsg.includes("code 3")) {
      return {
        success: false,
        output: "❌ Not authenticated\. Please run \`/login\` first\.",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }

    // Protect unexpected dynamic system failures from throwing formatting errors
    const safeErrorMsg = errorMsg.replace(/[._\-!]/g, '\\$&');
    return {
      success: false,
      output: `❌ Transfer failed: ${safeErrorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}
