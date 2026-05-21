/**
 * TELEGRAM RESPONSE FORMATTER
 * 
 * Converts raw skill outputs to polished Telegram messages.
 * Features:
 * - Emoji-rich formatting
 * - Action → Result flow
 * - Next-step suggestions
 * - Error recovery guidance
 * - Transaction links
 */

import { TelegramResponseContext } from "./skills/skillTypes";

export interface FormattedResponse {
  text: string;
  parseMode: "Markdown" | "MarkdownV2" | "HTML";
  disableWebPagePreview: boolean;
  suggestedActions?: string[];
}

/**
 * Escape HTML entities for safe Telegram HTML mode
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Format skill output as polished Telegram response
 */
export function formatTelegramResponse(
  skillOutput: string,
  context: TelegramResponseContext
): FormattedResponse {
  // Keep skill output as-is (don't escape - already formatted by skill)
  let text = skillOutput;
  const suggestions: string[] = [];

  // Add action-specific formatting and suggestions
  switch (context.action) {
    case "transfer":
      if (context.success) {
        suggestions.push(
          "/payment-history - Check transaction",
          "/balance - Verify balance updated"
        );
      } else {
        suggestions.push(
          "/balance - Check available balance",
          "/login - Re-authenticate if needed"
        );
      }
      break;

    case "session_create":
      if (context.success) {
        suggestions.push(
          "Approve in Kite Passport mobile app",
          "/session-status <request-id> - Check approval"
        );
      } else {
        suggestions.push(
          "/login - Ensure you're authenticated",
          "/help - View command reference"
        );
      }
      break;

    case "service_search":
      if (context.success) {
        suggestions.push(
          "/ksearch-service-get <id> - View service details",
          "/session-create - Create spending session to use service"
        );
      }
      break;

    case "authentication":
      if (context.success) {
        suggestions.push(
          "/balance - Check your wallet",
          "/help - Learn what you can do"
        );
      } else {
        suggestions.push(
          "/login - Try signing in again",
          "/help - View authentication help"
        );
      }
      break;

    case "x402_execute":
      if (context.success) {
        suggestions.push(
          "/session-list - View active sessions",
          "/payment-history - Check transaction details"
        );
      } else {
        suggestions.push(
          "/session-status <id> - Verify session is active",
          "/session-create - Create new spending session"
        );
      }
      break;

    case "agent_register":
      if (context.success) {
        suggestions.push(
          "/agent-create - Create autonomous agent",
          "/agent-list - View your agents"
        );
      }
      break;
  }

  // Add suggestions to output if available
  if (suggestions.length > 0) {
    text += `\n\n💡 <b>Next steps:</b>\n`;
    suggestions.forEach((suggestion) => {
      text += `• ${escapeHtml(suggestion)}\n`;
    });
  }

  return {
    text: text,
    parseMode: "Markdown",
    disableWebPagePreview: true,
    suggestedActions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Format error response with recovery guidance
 */
export function formatErrorResponse(
  error: string,
  context: TelegramResponseContext
): FormattedResponse {
  let text = `❌ <b>Action Failed</b>\n\n${escapeHtml(error)}\n`;

  const suggestions: string[] = [];

  // Map error to recovery suggestions
  if (error.includes("Not authenticated") || error.includes("authentication")) {
    text += "\n🔐 <b>Authentication Error</b>\n";
    suggestions.push("/login - Sign in to Kite Passport", "/help - View authentication guide");
  } else if (error.includes("Not found") || error.includes("not found")) {
    text += "\n🔍 <b>Resource Not Found</b>\n";
    suggestions.push("/help - View available commands", "/examples - See example prompts");
  } else if (error.includes("limit") || error.includes("Exceeds")) {
    text += "\n💰 <b>Budget Exceeded</b>\n";
    suggestions.push(
      "/session-create - Create new session with higher limit",
      "/balance - Check wallet balance"
    );
  } else if (error.includes("timeout")) {
    text += "\n⏱️ <b>Request Timeout</b>\n";
    suggestions.push("Please try again", "/status - Check system health");
  } else if (error.includes("rate limit")) {
    text += "\n🚦 <b>Rate Limited</b>\n";
    suggestions.push("Wait 30 seconds and try again");
  }

  if (suggestions.length > 0) {
    text += "\n<b>Try this:</b>\n";
    suggestions.forEach((suggestion) => {
      text += `• ${escapeHtml(suggestion)}\n`;
    });
  }

  return {
    text: text,
    parseMode: "Markdown",
    disableWebPagePreview: true,
  };
}

/**
 * Format payment/transaction response with explorer link
 */
export function formatTransactionResponse(
  txHash: string,
  amount: string,
  asset: string,
  recipient: string,
  explorerUrl?: string
): FormattedResponse {
  let text = `✅ <b>Transaction Sent</b>\n\n`;
  text += `💰 Amount: ${escapeHtml(amount)} ${escapeHtml(asset)}\n`;
  text += `📍 To: ${escapeHtml(recipient)}\n`;
  text += `🔗 TX Hash: <code>${escapeHtml(txHash.substring(0, 16))}...</code>\n`;

  if (explorerUrl) {
    text += `\n<a href="${escapeHtml(explorerUrl)}">View on Explorer</a>\n`;
  }

  text += `\n💡 <b>What's next?</b>\n`;
  text += `• Wait for confirmation (usually &lt;1 min)\n`;
  text += `• Run /payment-history to verify\n`;
  text += `• Run /balance to confirm updated balance\n`;

  return {
    text: text,
    parseMode: "Markdown",
    disableWebPagePreview: false,
  };
}

/**
 * Format session creation response
 */
export function formatSessionCreatedResponse(
  requestId: string,
  maxAmount: string,
  ttl: string
): FormattedResponse {
  const text = `✅ <b>Spending Session Created</b>\n\n` +
    `💰 Limit: ${escapeHtml(maxAmount)} USDC per transaction\n` +
    `⏰ Duration: ${escapeHtml(ttl)}\n` +
    `🆔 Request ID: <code>${escapeHtml(requestId)}</code>\n\n` +
    `📱 <b>Action Required:</b>\n` +
    `Please approve this session in your Kite Passport mobile app.\n\n` +
    `💡 <b>After approval:</b>\n` +
    `• Run /session-status ${escapeHtml(requestId)}\n` +
    `• Run /session-use ${escapeHtml(requestId)}\n` +
    `• You can then execute paid API calls\n`;

  return {
    text: text,
    parseMode: "Markdown",
    disableWebPagePreview: true,
  };
}

/**
 * Format service listing response
 */
export function formatServiceListResponse(services: any[], query?: string): FormattedResponse {
  let text = query
    ? `🔍 <b>Services matching "${escapeHtml(query)}"</b>\n\n`
    : `🔍 <b>Available Services</b>\n\n`;

  if (services.length === 0) {
    text = query
      ? `No services found matching "${escapeHtml(query)}"\n\nTry a different search term`
      : `No services available\n\nTry again later`;
    return {
      text: text,
      parseMode: "Markdown",
      disableWebPagePreview: true,
    };
  }

  services.slice(0, 5).forEach((service, idx) => {
    text += `${idx + 1}. <b>${escapeHtml(service.name || "Unknown")}</b>\n`;
    text += `   ID: <code>${escapeHtml(service.id || "N/A")}</code>\n`;
    text += `   Price: ${escapeHtml(service.price_per_call || "N/A")} USDC\n`;
    if (service.description) {
      text += `   ${escapeHtml(service.description)}\n`;
    }
    text += `\n`;
  });

  text += `💡 <b>To use a service:</b>\n`;
  text += `1. /session-create &lt;amount&gt; &lt;ttl&gt;\n`;
  text += `2. Wait for approval\n`;
  text += `3. /session-execute &lt;service-url&gt;\n`;

  return {
    text: text,
    parseMode: "Markdown",
    disableWebPagePreview: true,
  };
}

/**
 * Format wallet balance response
 */
export function formatBalanceResponse(assets: any[], walletAddress: string): FormattedResponse {
  let text = `💰 <b>Wallet Balance</b>\n\n`;
  text += `📍 Address: <code>${escapeHtml(walletAddress.substring(0, 20))}...</code>\n\n`;

  if (assets && assets.length > 0) {
    text += `<b>Assets:</b>\n`;
    assets.forEach((asset) => {
      const icon = asset.native ? "💎" : "🪙";
      const balance = parseFloat(asset.balance || "0");
      if (balance > 0 || asset.native) {
        text += `${icon} ${escapeHtml(asset.symbol)}: ${balance.toFixed(2)}\n`;
      }
    });
  } else {
    text += `No assets with positive balance\n`;
  }

  text += `\n💡 <b>Available actions:</b>\n`;
  text += `• /transfer &lt;address&gt; &lt;amount&gt; - Send funds\n`;
  text += `• /session-create - Create spending session\n`;
  text += `• /faucet-drop - Request test tokens\n`;

  return {
    text: text,
    parseMode: "Markdown",
    disableWebPagePreview: true,
  };
}

/**
 * Format confirmation prompt
 */
export function formatConfirmationPrompt(action: string, details: string): FormattedResponse {
  const text = `⚠️ <b>Confirm Action</b>\n\n` +
    `${escapeHtml(action)}\n\n` +
    `${escapeHtml(details)}\n\n` +
    `React with ✅ to confirm or ❌ to cancel`;

  return {
    text: text,
    parseMode: "Markdown",
    disableWebPagePreview: true,
  };
}
