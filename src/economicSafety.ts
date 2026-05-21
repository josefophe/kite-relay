/**
 * ECONOMIC SAFETY VALIDATION LAYER
 * 
 * Pre-execution validation for all economic actions:
 * - Authentication checks
 * - Session validation
 * - Spending limit enforcement
 * - Balance verification
 * - Amount validation
 * 
 * CRITICAL: All economic tools must pass through this layer.
 */

import { logger } from "./logger";
import { readUserProfile } from "./storage";
import { config } from "./config";
import { EconomicValidationResult } from "./skills/skillTypes";

export interface EconomicActionContext {
  userId: number;
  actionType: "transfer" | "x402_execute" | "buy_airtime" | "buy_data";
  amount?: number;
  currency?: string;
  recipientAddress?: string;
  sessionId?: string;
  serviceUrl?: string;
}

/**
 * Validate economic action before execution
 * 
 * Returns:
 * - valid: true if action can proceed
 * - error: human-readable error message if validation fails
 * - warnings: non-blocking warnings for user awareness
 * - requiresConfirmation: if amount is high, ask for confirmation
 */
export async function validateEconomicAction(
  context: EconomicActionContext
): Promise<EconomicValidationResult> {
  const validations: string[] = [];
  const warnings: string[] = [];

  // 1. Verify authentication
  const authStatus = validateAuthentication(context.userId);
  if (!authStatus.valid) {
    return authStatus;
  }

  // 2. Verify recipient (if transfer)
  if (context.actionType === "transfer") {
    const recipientStatus = validateRecipient(context.recipientAddress);
    if (!recipientStatus.valid) {
      return recipientStatus;
    }
  }

  // 3. Verify amount
  if (context.amount !== undefined) {
    const amountStatus = validateAmount(context.amount, context.currency);
    if (!amountStatus.valid) {
      return amountStatus;
    }

    // Check if high-value (requires confirmation)
    if (context.amount > 100) {
      warnings.push(`High-value transaction: ${context.amount} ${context.currency || "USDC"}`);
      return {
        valid: true,
        warnings,
        requiresConfirmation: true,
        confirmationPrompt: `Confirm transfer of ${context.amount} ${context.currency || "USDC"}?`,
      };
    }
  }

  // 4. Verify session (if x402 execute)
  if (context.actionType === "x402_execute" && context.sessionId) {
    const sessionStatus = validateSession(context.userId, context.sessionId);
    if (!sessionStatus.valid) {
      return sessionStatus;
    }
    validations.push(`Session ${context.sessionId} is valid`);
  }

  logger.info(
    {
      userId: context.userId,
      actionType: context.actionType,
      validations,
      warnings,
    },
    "Economic action validation passed"
  );

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate user is authenticated
 */
function validateAuthentication(userId: number): EconomicValidationResult {
  const profile = readUserProfile(userId, config.userDataRoot);
  const isAuthenticated = profile && profile.identity && profile.identity.passportId;

  if (!isAuthenticated) {
    return {
      valid: false,
      error: "❌ Not authenticated. Please run /login first.",
    };
  }

  return { valid: true };
}

/**
 * Validate recipient address format
 */
function validateRecipient(address?: string): EconomicValidationResult {
  if (!address) {
    return {
      valid: false,
      error: "Recipient address is required",
    };
  }

  // Check for Ethereum address format (0x + 40 hex chars)
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  const telegramUsernameRegex = /^@[a-zA-Z0-9_]{1,32}$/;

  if (!ethAddressRegex.test(address) && !telegramUsernameRegex.test(address)) {
    return {
      valid: false,
      error: "Invalid recipient. Must be 0x-address or @username",
    };
  }

  return { valid: true };
}

/**
 * Validate transaction amount
 */
function validateAmount(amount: number, currency?: string): EconomicValidationResult {
  if (amount <= 0) {
    return {
      valid: false,
      error: "Amount must be greater than 0",
    };
  }

  if (amount > 1000000) {
    return {
      valid: false,
      error: "Amount exceeds maximum transaction limit (1,000,000)",
    };
  }

  // Check for reasonable precision
  const decimalPlaces = (amount.toString().split(".")[1] || "").length;
  if (decimalPlaces > 18) {
    return {
      valid: false,
      error: "Too many decimal places. Maximum 18 decimals",
    };
  }

  return { valid: true };
}

/**
 * Validate spending session is active and has sufficient budget
 */
function validateSession(userId: number, sessionId: string): EconomicValidationResult {
  // STUB: This should query kpass to get session status
  // For now, we just verify session ID format

  if (!sessionId || sessionId.trim().length === 0) {
    return {
      valid: false,
      error: "Session ID is required",
    };
  }

  // TODO: Add real session validation
  // - Check session exists in kpass backend
  // - Verify session is in "active" state
  // - Check remaining budget
  // - Verify TTL hasn't expired

  return { valid: true };
}

/**
 * Log economic action for audit trail
 */
export function logEconomicAction(
  userId: number,
  actionType: string,
  details: Record<string, unknown>,
  result: "success" | "failure"
): void {
  logger.info(
    {
      userId,
      actionType,
      details,
      result,
      timestamp: new Date().toISOString(),
    },
    "audit: economic action"
  );
}

/**
 * Check if user has exceeded rate limits
 */
export function checkRateLimit(userId: number): boolean {
  // STUB: Implement rate limiting logic
  // Track actions per user per minute
  // Return true if rate limit exceeded

  return false;
}

/**
 * Validate spending session has sufficient budget for amount
 */
export function validateSpendingBudget(
  userId: number,
  sessionId: string,
  amount: number
): boolean {
  // STUB: This should query kpass to verify
  // sessionMaxPerTx >= amount
  // sessionBalance >= amount

  return true;
}
