/**
 * SKILL WRAPPER: Wallet Balance
 * 
 * Wraps kpass wallet balance command with:
 * - Balance retrieval for all assets
 * - Wallet address display
 * - Chain ID and wallet type info
 * - Error handling for auth failures
 */

import { executeKpass } from "../userRuntime";
import { logger } from "../logger";
import { SkillExecutionOutput, KiteExitCode } from "./skillTypes";

export interface WalletBalanceInput {
  userId: number;
}

/**
 * Get wallet balance for all assets
 * 
 * Returns:
 * - Wallet address
 * - Wallet type
 * - Chain ID
 * - All asset balances (USDC, KITE, etc.)
 */
export async function walletBalanceSkill(input: WalletBalanceInput): Promise<SkillExecutionOutput> {
  const startTime = Date.now();

  try {
    // Execute kpass wallet balance command
    const output = await executeKpass(
      input.userId,
      ["wallet", "balance", "--output", "json"],
      "wallet-balance"
    );

    // Parse JSON output
    let balanceData: any = {};
    try {
      balanceData = JSON.parse(output);
    } catch (parseError) {
      logger.error({ userId: input.userId, error: parseError }, "Failed to parse wallet balance JSON");
      return {
        success: false,
        output: "❌ Failed to parse wallet data. Please try again.",
        exitCode: KiteExitCode.NETWORK_ERROR,
        duration: Date.now() - startTime,
      };
    }

    // Check for auth error
    if (balanceData.status === "error" && balanceData.error && balanceData.error.includes("Not logged in")) {
      return {
        success: false,
        output: "❌ Not authenticated. Please sign in first with /agent auth-login",
        exitCode: KiteExitCode.AUTH_ERROR,
        duration: Date.now() - startTime,
      };
    }

    // Validate response structure
    if (!balanceData.wallet_address) {
      logger.error({ userId: input.userId, data: balanceData }, "Invalid wallet response structure");
      return {
        success: false,
        output: "❌ Invalid wallet response. Please try again or use /agent auth-login",
        exitCode: KiteExitCode.NETWORK_ERROR,
        duration: Date.now() - startTime,
      };
    }

    // Format output for display
    const walletAddress = balanceData.wallet_address || "Unknown";
    const walletType = balanceData.wallet_type || "Unknown";
    const chainId = balanceData.chain_id || "Unknown";
    const assets = (balanceData.assets || []) as any[];

    // Build formatted balance display
    // Replace the old formattedOutput block with this clean HTML structure:
    let formattedOutput = `<b>💰 Wallet Balance</b>\n`;
    formattedOutput += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    formattedOutput += `📍 <b>Address:</b> <code>${walletAddress}</code>\n`;
    formattedOutput += `🏦 <b>Type:</b> ${walletType}\n`;
    formattedOutput += `⛓️ <b>Chain:</b> ${chainId}\n\n`;

    if (assets.length > 0) {
      formattedOutput += `<b>Assets:</b>\n`;
      for (const asset of assets) {
        const symbol = asset.symbol || "Unknown";
        const balance = asset.balance || "0.00";
        formattedOutput += `• <b>${symbol}:</b> <code>${balance}</code>\n`;
      }
    } else {
      formattedOutput += `<i>No assets found</i>\n`;
    }
    // ... (Keep your asset loops and header assembly logic exactly the same)

    formattedOutput += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    // Wrap your entire output block in clean Markdown Monospace Triple Backticks
    const safeMarkdownOutput = `\`\`\`\n${formattedOutput}\n\`\`\``;

    logger.info(
      {
        userId: input.userId,
        walletAddress,
        assetCount: assets.length,
        duration: Date.now() - startTime,
      },
      "Wallet balance retrieved successfully"
    );

    return {
      success: true,
      output: safeMarkdownOutput, // 👈 Change this line to return the wrapped markdown block
      exitCode: KiteExitCode.SUCCESS,
      rawData: balanceData,
      duration: Date.now() - startTime,
    };


  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const exitCode = msg.includes("timeout") ? KiteExitCode.NETWORK_ERROR : KiteExitCode.USAGE_ERROR;

    logger.error(
      {
        userId: input.userId,
        error: msg,
        duration: Date.now() - startTime,
      },
      "Wallet balance skill failed"
    );

    return {
      success: false,
      output: `❌ Failed to retrieve wallet balance: ${msg}`,
      exitCode,
      error: msg,
      duration: Date.now() - startTime,
    };
  }
}
