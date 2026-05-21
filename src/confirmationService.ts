/**
 * PHASE 4: User Confirmation Service
 *
 * Manages confirmation prompts for high-value economic actions.
 * - Creates confirmation challenges for amounts exceeding threshold
 * - Tracks pending confirmations with TTL
 * - Validates confirmation codes
 * - Provides transaction summary before approval
 */

import { logger } from "./logger";
import { readUserProfile, writeUserProfile } from "./storage";
import { config } from "./config";

export interface ConfirmationChallenge {
  id: string;
  userId: number;
  action: "transfer" | "payment" | "session" | "agent-register";
  amount: number;
  currency: string;
  recipient?: string;
  serviceId?: string;
  description: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  code: string; // Random 6-digit code
}

export interface ConfirmationResult {
  valid: boolean;
  error?: string;
  challenge?: ConfirmationChallenge;
}

/**
 * Thresholds requiring confirmation (in USD equivalent)
 */
const CONFIRMATION_THRESHOLDS = {
  transfer: 50, // Confirm transfers above $50
  payment: 100, // Confirm payments above $100
  session: 50, // Confirm sessions above $50 limit
  "agent-register": 0, // Always confirm agent registration
};

/**
 * Generate random 6-digit confirmation code
 */
function generateConfirmationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check if action requires confirmation
 */
export function requiresConfirmation(action: string, amount: number): boolean {
  const threshold = CONFIRMATION_THRESHOLDS[action as keyof typeof CONFIRMATION_THRESHOLDS];
  if (threshold === undefined) return false;
  if (threshold === 0) return true; // Always confirm
  return amount >= threshold;
}

/**
 * Create a confirmation challenge for an economic action
 */
export async function createConfirmationChallenge(
  userId: number,
  action: "transfer" | "payment" | "session" | "agent-register",
  amount: number,
  currency: string = "USDC",
  description: string = "",
  recipient?: string,
  serviceId?: string
): Promise<ConfirmationChallenge> {
  if (!requiresConfirmation(action, amount)) {
    throw new Error(`Action ${action} with amount ${amount} does not require confirmation`);
  }

  const challengeId = `confirm_${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const code = generateConfirmationCode();
  const now = Date.now();
  const TTL = 10 * 60 * 1000; // 10 minute expiration

  const challenge: ConfirmationChallenge = {
    id: challengeId,
    userId,
    action,
    amount,
    currency,
    recipient,
    serviceId,
    description,
    createdAt: now,
    expiresAt: now + TTL,
    attempts: 0,
    maxAttempts: 3,
    code,
  };

  // Store challenge in user profile
  const profile = readUserProfile(userId, config.userDataRoot);
  if (!profile.pendingConfirmations) {
    profile.pendingConfirmations = [];
  }

  profile.pendingConfirmations.push(challenge);
  writeUserProfile(userId, config.userDataRoot, profile);

  logger.info(
    {
      userId,
      challengeId,
      action,
      amount,
      currency,
    },
    "Confirmation challenge created"
  );

  return challenge;
}

/**
 * Verify a confirmation code
 */
export async function verifyConfirmationCode(
  userId: number,
  challengeId: string,
  providedCode: string
): Promise<ConfirmationResult> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.pendingConfirmations || profile.pendingConfirmations.length === 0) {
      return {
        valid: false,
        error: "No pending confirmations found",
      };
    }

    // Find challenge
    const challenge = profile.pendingConfirmations.find((c) => c.id === challengeId);
    if (!challenge) {
      return {
        valid: false,
        error: "Confirmation challenge not found",
      };
    }

    // Check expiration
    if (Date.now() > challenge.expiresAt) {
      logger.warn(
        { userId, challengeId },
        "Confirmation challenge expired"
      );
      // Remove expired challenge
      profile.pendingConfirmations = profile.pendingConfirmations.filter(
        (c) => c.id !== challengeId
      );
      writeUserProfile(userId, config.userDataRoot, profile);
      return {
        valid: false,
        error: "Confirmation code expired. Please start over.",
      };
    }

    // Check attempts
    if (challenge.attempts >= challenge.maxAttempts) {
      logger.warn(
        { userId, challengeId, attempts: challenge.attempts },
        "Max confirmation attempts exceeded"
      );
      // Remove challenge
      profile.pendingConfirmations = profile.pendingConfirmations.filter(
        (c) => c.id !== challengeId
      );
      writeUserProfile(userId, config.userDataRoot, profile);
      return {
        valid: false,
        error: `Too many failed attempts. Please try again later.`,
      };
    }

    // Verify code
    challenge.attempts++;

    if (providedCode.trim() !== challenge.code) {
      logger.warn(
        { userId, challengeId, attempts: challenge.attempts },
        "Invalid confirmation code"
      );
      writeUserProfile(userId, config.userDataRoot, profile);
      return {
        valid: false,
        error: `Invalid code. ${challenge.maxAttempts - challenge.attempts} attempts remaining.`,
        challenge,
      };
    }

    // Code is valid - remove challenge
    logger.info(
      { userId, challengeId, action: challenge.action },
      "Confirmation code verified successfully"
    );

    profile.pendingConfirmations = profile.pendingConfirmations.filter(
      (c) => c.id !== challengeId
    );
    writeUserProfile(userId, config.userDataRoot, profile);

    return {
      valid: true,
      challenge,
    };
  } catch (error) {
    logger.error({ userId, challengeId, error }, "Confirmation verification error");
    return {
      valid: false,
      error: "Error verifying confirmation code",
    };
  }
}

/**
 * Get pending confirmation for user
 */
export function getPendingConfirmation(
  userId: number,
  challengeId?: string
): ConfirmationChallenge | undefined {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);
    if (!profile.pendingConfirmations || profile.pendingConfirmations.length === 0) {
      return undefined;
    }

    // Return specific challenge or first one
    if (challengeId) {
      return profile.pendingConfirmations.find((c) => c.id === challengeId);
    }

    return profile.pendingConfirmations[0];
  } catch {
    return undefined;
  }
}

/**
 * Format confirmation prompt for Telegram
 */
export function formatConfirmationPrompt(challenge: ConfirmationChallenge): string {
  let prompt = `⚠️ *Confirmation Required*\n\n`;
  prompt += `*Action*: ${challenge.action}\n`;
  prompt += `*Amount*: ${challenge.amount} ${challenge.currency}\n`;

  if (challenge.recipient) {
    prompt += `*Recipient*: ${challenge.recipient}\n`;
  }

  if (challenge.description) {
    prompt += `*Description*: ${challenge.description}\n`;
  }

  prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  prompt += `A confirmation code has been generated.\n`;
  prompt += `Enter the code to confirm this action.\n\n`;
  prompt += `💡 *Code*: \`${challenge.code}\`\n\n`;
  prompt += `⏰ *Expires in*: 10 minutes\n`;
  prompt += `❌ *Cancel*: /cancel`;

  return prompt;
}

/**
 * Clean up expired confirmations
 */
export async function cleanupExpiredConfirmations(userId: number): Promise<number> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.pendingConfirmations || profile.pendingConfirmations.length === 0) {
      return 0;
    }

    const before = profile.pendingConfirmations.length;
    const now = Date.now();

    profile.pendingConfirmations = profile.pendingConfirmations.filter((c) => c.expiresAt > now);

    const removed = before - profile.pendingConfirmations.length;

    if (removed > 0) {
      writeUserProfile(userId, config.userDataRoot, profile);
      logger.info({ userId, removed }, "Expired confirmations cleaned up");
    }

    return removed;
  } catch (error) {
    logger.error({ userId, error }, "Error cleaning up confirmations");
    return 0;
  }
}
