/**
 * PHASE 4: Enhanced Error Response Service
 *
 * Provides consistent, helpful error messages with recovery guidance:
 * - Maps error codes to user-friendly messages
 * - Suggests recovery actions for each error type
 * - Includes helpful links and next steps
 * - Formats responses for Telegram display
 */

import { logger } from "./logger";

export interface ErrorContext {
  code: string; // Error identifier (e.g., "AUTH_REQUIRED", "BUDGET_EXCEEDED")
  message: string; // User-friendly error message
  details?: string; // Additional technical details
  recoverySteps: string[]; // Suggested recovery actions
  suggestions: string[]; // Helpful suggestions
  action: string; // What user was trying to do
  documentationUrl?: string; // Link to help docs
}

export interface ErrorResponse {
  success: false;
  error: ErrorContext;
  timestamp: number;
}

/**
 * Error catalog with recovery steps
 */
const ERROR_CATALOG: Record<string, Omit<ErrorContext, "action" | "details">> = {
  // Authentication Errors
  AUTH_REQUIRED: {
    code: "AUTH_REQUIRED",
    message: "You must be logged in to perform this action",
    recoverySteps: ["/login - Log in with your email", "/signup - Create a new account"],
    suggestions: ["Use /help for authentication guide"],
    documentationUrl: "/docs/auth",
  },

  AUTH_INVALID_CODE: {
    code: "AUTH_INVALID_CODE",
    message: "Invalid authentication code",
    recoverySteps: [
      "Check that you entered the code correctly",
      "Request a new code via /login",
      "Try again with the new code",
    ],
    suggestions: ["Codes expire after 10 minutes", "Check your email for the code"],
    documentationUrl: "/docs/auth/otp",
  },

  AUTH_EXPIRED: {
    code: "AUTH_EXPIRED",
    message: "Your session has expired",
    recoverySteps: ["/logout - Log out", "/login - Log back in"],
    suggestions: ["Your session is valid for 24 hours"],
    documentationUrl: "/docs/auth/session",
  },

  AUTH_NETWORK_ERROR: {
    code: "AUTH_NETWORK_ERROR",
    message: "Could not reach authentication service",
    recoverySteps: [
      "Check your internet connection",
      "Wait a moment and try again",
      "Contact support if problem persists",
    ],
    suggestions: ["This is usually temporary"],
    documentationUrl: "/docs/troubleshooting",
  },

  // Wallet Errors
  WALLET_INSUFFICIENT_BALANCE: {
    code: "WALLET_INSUFFICIENT_BALANCE",
    message: "Insufficient balance for this transaction",
    recoverySteps: [
      "/balance - Check your current balance",
      "/faucet - Request test tokens (testnet only)",
      "Wait for incoming deposits",
    ],
    suggestions: [
      "You can check balance with /balance",
      "Need more funds? Use /help to find deposit options",
    ],
    documentationUrl: "/docs/wallet/balance",
  },

  WALLET_INVALID_ADDRESS: {
    code: "WALLET_INVALID_ADDRESS",
    message: "Invalid recipient address format",
    recoverySteps: [
      "Verify recipient address starts with 0x",
      "Ensure address is 42 characters long",
      "Copy address carefully and try again",
    ],
    suggestions: [
      'Valid Ethereum address format: 0x' + 'a'.repeat(40),
      "Double-check before sending",
    ],
    documentationUrl: "/docs/wallet/addresses",
  },

  WALLET_SAME_ADDRESS: {
    code: "WALLET_SAME_ADDRESS",
    message: "Cannot send funds to your own address",
    recoverySteps: [
      "Verify the recipient address is different from yours",
      "Use /balance to see your address",
      "Try again with correct recipient",
    ],
    suggestions: ["Make sure you're sending to someone else"],
  },

  // Budget and Rate Limit Errors
  BUDGET_EXCEEDED: {
    code: "BUDGET_EXCEEDED",
    message: "This action exceeds your spending budget",
    recoverySteps: ["/budget - View your budget status", "Wait for budget period to reset", "/help - Contact support"],
    suggestions: [
      "Budgets reset daily, weekly, and monthly",
      "You can request a budget increase",
    ],
    documentationUrl: "/docs/spending/budget",
  },

  RATE_LIMIT_EXCEEDED: {
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Please slow down",
    recoverySteps: ["Wait a moment before retrying", "Batch your requests together", "/help - Report urgent need"],
    suggestions: ["Rate limits prevent abuse and protect your account"],
    documentationUrl: "/docs/safety/ratelimit",
  },

  // Session Errors
  SESSION_NOT_FOUND: {
    code: "SESSION_NOT_FOUND",
    message: "Spending session not found",
    recoverySteps: [
      "/session list - View your active sessions",
      "/session create - Create a new session",
      "Use the new session ID",
    ],
    suggestions: ["Sessions expire after their TTL", "Check session details with /session status"],
    documentationUrl: "/docs/payments/sessions",
  },

  SESSION_EXPIRED: {
    code: "SESSION_EXPIRED",
    message: "Spending session has expired",
    recoverySteps: [
      "/session list - Check other active sessions",
      "/session create - Create a new session with fresh TTL",
    ],
    suggestions: ["Sessions have limited duration (1-24 hours typically)"],
    documentationUrl: "/docs/payments/sessions",
  },

  SESSION_INSUFFICIENT_FUNDS: {
    code: "SESSION_INSUFFICIENT_FUNDS",
    message: "Session has insufficient remaining balance",
    recoverySteps: [
      "/session status - Check session balance",
      "/session create - Create a new session with higher limit",
    ],
    suggestions: ["Each session has a per-transaction max limit"],
    documentationUrl: "/docs/payments/sessions",
  },

  // Confirmation Errors
  CONFIRM_REQUIRED: {
    code: "CONFIRM_REQUIRED",
    message: "This action requires confirmation",
    recoverySteps: [
      "Check your messages for confirmation code",
      "/verify <code> - Enter the 6-digit confirmation code",
      "Confirm expires in 10 minutes",
    ],
    suggestions: [
      "High-value actions require approval",
      "Code was sent separately for security",
    ],
    documentationUrl: "/docs/security/confirmation",
  },

  CONFIRM_INVALID_CODE: {
    code: "CONFIRM_INVALID_CODE",
    message: "Invalid confirmation code",
    recoverySteps: [
      "Check code for typos",
      "Verify you're using the most recent code",
      "Request a new code if expired",
    ],
    suggestions: ["Codes are case-sensitive", "You have 3 attempts"],
    documentationUrl: "/docs/security/confirmation",
  },

  CONFIRM_EXPIRED: {
    code: "CONFIRM_EXPIRED",
    message: "Confirmation code has expired",
    recoverySteps: [
      "Restart the action",
      "Request a new confirmation code",
      "Enter the new code within 10 minutes",
    ],
    suggestions: ["Codes expire for security reasons"],
    documentationUrl: "/docs/security/confirmation",
  },

  // Payment Errors
  PAYMENT_FAILED: {
    code: "PAYMENT_FAILED",
    message: "Payment could not be completed",
    recoverySteps: [
      "Check your balance with /balance",
      "Verify recipient address",
      "Check network status",
      "Try again in a moment",
    ],
    suggestions: ["Payments are processed on-chain", "Some failures are temporary"],
    documentationUrl: "/docs/payments/troubleshooting",
  },

  PAYMENT_TIMEOUT: {
    code: "PAYMENT_TIMEOUT",
    message: "Payment processing timed out",
    recoverySteps: [
      "Wait a moment for processing to complete",
      "/activity - Check if payment went through",
      "Retry if needed",
    ],
    suggestions: [
      "Blockchain transactions can take 10-60 seconds",
      "Check transaction history for status",
    ],
    documentationUrl: "/docs/payments/troubleshooting",
  },

  // Service Errors
  SERVICE_NOT_AVAILABLE: {
    code: "SERVICE_NOT_AVAILABLE",
    message: "Service is temporarily unavailable",
    recoverySteps: ["Wait a moment", "Try again", "Check /status for service updates"],
    suggestions: ["Services may be under maintenance"],
    documentationUrl: "/docs/troubleshooting",
  },

  SERVICE_NOT_FOUND: {
    code: "SERVICE_NOT_FOUND",
    message: "Service not found in catalog",
    recoverySteps: ["/discovery list - Browse available services", "Search for service with /search"],
    suggestions: ["Services in catalog vary by region and availability"],
    documentationUrl: "/docs/services",
  },

  // Generic Errors
  INVALID_INPUT: {
    code: "INVALID_INPUT",
    message: "Invalid input provided",
    recoverySteps: ["Check command syntax with /help", "Review example usage", "Try again with correct format"],
    suggestions: ["Use /help <command> for syntax help"],
    documentationUrl: "/docs/commands",
  },

  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    recoverySteps: ["Try the action again", "Check /status for issues", "Contact support if problem persists"],
    suggestions: ["Error has been logged for investigation"],
    documentationUrl: "/docs/support",
  },

  NETWORK_ERROR: {
    code: "NETWORK_ERROR",
    message: "Network error occurred",
    recoverySteps: [
      "Check your internet connection",
      "Wait a moment",
      "Try again",
      "Contact support if persistent",
    ],
    suggestions: ["Connection issues are usually temporary"],
    documentationUrl: "/docs/troubleshooting",
  },
};

/**
 * Create structured error response
 */
export function createErrorResponse(
  errorCode: string,
  action: string,
  details?: string
): ErrorResponse {
  const catalog = ERROR_CATALOG[errorCode] || ERROR_CATALOG.INTERNAL_ERROR;

  const context: ErrorContext = {
    ...catalog,
    action,
    details,
  };

  return {
    success: false,
    error: context,
    timestamp: Date.now(),
  };
}

/**
 * Format error for Telegram display
 */
export function formatErrorMessage(error: ErrorContext): string {
  let message = `❌ *Error: ${error.message}*\n\n`;

  if (error.details) {
    message += `_${error.details}_\n\n`;
  }

  message += `*Recovery:*\n`;
  for (const step of error.recoverySteps) {
    message += `• ${step}\n`;
  }

  if (error.suggestions && error.suggestions.length > 0) {
    message += `\n*Suggestions:*\n`;
    for (const suggestion of error.suggestions) {
      message += `💡 ${suggestion}\n`;
    }
  }

  message += `\n🆘 Use /help for more information`;

  return message;
}

/**
 * Format error for command response
 */
export function formatErrorCommand(error: ErrorContext): string {
  let response = `❌ ${error.message}\n\n`;

  if (error.recoverySteps && error.recoverySteps.length > 0) {
    response += `Next steps:\n`;
    for (const step of error.recoverySteps) {
      response += `  → ${step}\n`;
    }
  }

  return response;
}

/**
 * Log error for debugging
 */
export function logError(error: ErrorContext, additional?: any): void {
  logger.error(
    {
      code: error.code,
      action: error.action,
      details: error.details,
      ...additional,
    },
    error.message
  );
}

/**
 * Map common error types to error codes
 */
export function mapErrorCode(error: Error | unknown, context?: string): string {
  if (typeof error === "string") {
    // Check string patterns
    if (error.includes("authenticated") || error.includes("auth")) return "AUTH_REQUIRED";
    if (error.includes("balance")) return "WALLET_INSUFFICIENT_BALANCE";
    if (error.includes("rate limit")) return "RATE_LIMIT_EXCEEDED";
    if (error.includes("budget")) return "BUDGET_EXCEEDED";
    if (error.includes("session")) return "SESSION_NOT_FOUND";
    if (error.includes("network")) return "NETWORK_ERROR";
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("authenticated") || msg.includes("auth")) return "AUTH_REQUIRED";
    if (msg.includes("balance")) return "WALLET_INSUFFICIENT_BALANCE";
    if (msg.includes("rate limit")) return "RATE_LIMIT_EXCEEDED";
    if (msg.includes("budget")) return "BUDGET_EXCEEDED";
    if (msg.includes("session")) return "SESSION_NOT_FOUND";
    if (msg.includes("network")) return "NETWORK_ERROR";
  }

  return "INTERNAL_ERROR";
}
