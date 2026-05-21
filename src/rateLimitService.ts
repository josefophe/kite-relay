/**
 * PHASE 4: Rate Limiting Service
 *
 * Prevents abuse by enforcing per-user action limits:
 * - Track attempts per action type (transfers, payments, API calls, etc.)
 * - Enforce cooldown periods
 * - Return remaining quota and retry-after info
 * - Auto-cleanup of expired windows
 */

import { logger } from "./logger";
import { readUserProfile, writeUserProfile } from "./storage";
import { config } from "./config";

export interface RateLimitRecord {
  action: string;
  count: number;
  window: "minute" | "hour" | "day";
  windowStart: number;
  lastAttempt: number;
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetIn: number; // milliseconds
  error?: string;
}

/**
 * Rate limit configuration per action type
 * Format: { maxCount, windowMs }
 */
const RATE_LIMITS: Record<string, { maxCount: number; windowMs: number }> = {
  // Transfers: max 10 per hour
  "wallet.send": {
    maxCount: 10,
    windowMs: 60 * 60 * 1000,
  },

  // Payments: max 20 per hour
  "x402.execute": {
    maxCount: 20,
    windowMs: 60 * 60 * 1000,
  },

  // Service discovery: max 50 per hour
  "kite.discovery": {
    maxCount: 50,
    windowMs: 60 * 60 * 1000,
  },

  // Session creation: max 5 per day
  "session.create": {
    maxCount: 5,
    windowMs: 24 * 60 * 60 * 1000,
  },

  // Agent registration: max 3 per day
  "agent.register": {
    maxCount: 3,
    windowMs: 24 * 60 * 60 * 1000,
  },

  // Authentication: max 5 login attempts per hour
  "auth.login": {
    maxCount: 5,
    windowMs: 60 * 60 * 1000,
  },

  // Confirmation attempts: max 3 per challenge (handled separately in confirmationService)
  // But also global: max 10 verification attempts per hour
  "confirm.verify": {
    maxCount: 10,
    windowMs: 60 * 60 * 1000,
  },

  // Balance checks: max 30 per hour (generous for quick checks)
  "wallet.balance": {
    maxCount: 30,
    windowMs: 60 * 60 * 1000,
  },

  // Default for unknown actions: max 100 per hour
  default: {
    maxCount: 100,
    windowMs: 60 * 60 * 1000,
  },
};

/**
 * Check if action is rate limited
 */
export async function checkRateLimit(userId: number, action: string): Promise<RateLimitStatus> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.rateLimitRecords) {
      profile.rateLimitRecords = [];
    }

    const limits = RATE_LIMITS[action] || RATE_LIMITS.default;
    const now = Date.now();

    // Find existing record for this action
    let record = profile.rateLimitRecords.find((r) => r.action === action);

    // If no record or window expired, create new record
    if (!record || now >= record.windowStart + limits.windowMs) {
      record = {
        action,
        count: 0,
        window: getWindowType(limits.windowMs),
        windowStart: now,
        lastAttempt: now,
      };
      profile.rateLimitRecords.push(record);
    }

    // Calculate remaining quota
    const remaining = limits.maxCount - record.count;
    const resetIn = record.windowStart + limits.windowMs - now;

    // Check if rate limit exceeded
    if (record.count >= limits.maxCount) {
      logger.warn(
        {
          userId,
          action,
          count: record.count,
          limit: limits.maxCount,
          resetIn,
        },
        "Rate limit exceeded"
      );

      return {
        allowed: false,
        remaining: 0,
        resetIn,
        error: `Rate limit exceeded for ${action}. Try again in ${formatDuration(resetIn)}.`,
      };
    }

    // Increment and save
    record.count++;
    record.lastAttempt = now;
    writeUserProfile(userId, config.userDataRoot, profile);

    logger.debug(
      {
        userId,
        action,
        count: record.count,
        limit: limits.maxCount,
        remaining: remaining - 1,
      },
      "Rate limit check passed"
    );

    return {
      allowed: true,
      remaining: Math.max(0, remaining - 1),
      resetIn,
    };
  } catch (error) {
    logger.error({ userId, action, error }, "Error checking rate limit");
    // Fail open - allow action but log error
    return {
      allowed: true,
      remaining: -1,
      resetIn: 0,
      error: "Could not verify rate limit",
    };
  }
}

/**
 * Record an action attempt (called after successful execution)
 */
export async function recordAttempt(userId: number, action: string): Promise<void> {
  try {
    // checkRateLimit already increments, so this is mostly for logging
    logger.debug({ userId, action }, "Attempt recorded");
  } catch (error) {
    logger.error({ userId, action, error }, "Error recording attempt");
  }
}

/**
 * Get remaining quota for an action (without consuming it)
 */
export function getQuota(userId: number, action: string): number {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.rateLimitRecords || profile.rateLimitRecords.length === 0) {
      const limits = RATE_LIMITS[action] || RATE_LIMITS.default;
      return limits.maxCount;
    }

    const limits = RATE_LIMITS[action] || RATE_LIMITS.default;
    const now = Date.now();

    const record = profile.rateLimitRecords.find((r) => r.action === action);

    // If no record or window expired
    if (!record || now >= record.windowStart + limits.windowMs) {
      return limits.maxCount;
    }

    // Return remaining quota
    return Math.max(0, limits.maxCount - record.count);
  } catch {
    const limits = RATE_LIMITS[action] || RATE_LIMITS.default;
    return limits.maxCount;
  }
}

/**
 * Reset rate limit for an action (admin function)
 */
export async function resetRateLimit(userId: number, action: string): Promise<void> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.rateLimitRecords) {
      return;
    }

    profile.rateLimitRecords = profile.rateLimitRecords.filter((r) => r.action !== action);
    writeUserProfile(userId, config.userDataRoot, profile);

    logger.info({ userId, action }, "Rate limit reset");
  } catch (error) {
    logger.error({ userId, action, error }, "Error resetting rate limit");
  }
}

/**
 * Clean up expired rate limit records
 */
export async function cleanupExpiredRecords(userId: number): Promise<number> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.rateLimitRecords || profile.rateLimitRecords.length === 0) {
      return 0;
    }

    const before = profile.rateLimitRecords.length;
    const now = Date.now();

    profile.rateLimitRecords = profile.rateLimitRecords.filter((record) => {
      const limits = RATE_LIMITS[record.action] || RATE_LIMITS.default;
      return now < record.windowStart + limits.windowMs;
    });

    const removed = before - profile.rateLimitRecords.length;

    if (removed > 0) {
      writeUserProfile(userId, config.userDataRoot, profile);
      logger.debug({ userId, removed }, "Expired rate limit records cleaned up");
    }

    return removed;
  } catch (error) {
    logger.error({ userId, error }, "Error cleaning up rate limit records");
    return 0;
  }
}

/**
 * Get all active rate limits for a user
 */
export function getActiveRateLimits(userId: number): Array<RateLimitRecord & { limit: number; resetIn: number }> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.rateLimitRecords || profile.rateLimitRecords.length === 0) {
      return [];
    }

    const now = Date.now();
    return profile.rateLimitRecords
      .filter((record) => {
        const limits = RATE_LIMITS[record.action] || RATE_LIMITS.default;
        return now < record.windowStart + limits.windowMs;
      })
      .map((record) => {
        const limits = RATE_LIMITS[record.action] || RATE_LIMITS.default;
        return {
          ...record,
          limit: limits.maxCount,
          resetIn: record.windowStart + limits.windowMs - now,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Helper: Get window type from milliseconds
 */
function getWindowType(windowMs: number): "minute" | "hour" | "day" {
  if (windowMs === 60 * 1000) return "minute";
  if (windowMs === 60 * 60 * 1000) return "hour";
  if (windowMs === 24 * 60 * 60 * 1000) return "day";
  return "hour";
}

/**
 * Helper: Format duration in ms to readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format rate limit status for Telegram
 */
export function formatRateLimitStatus(status: RateLimitStatus): string {
  if (status.allowed) {
    return `✅ Action allowed. Remaining quota: ${status.remaining}`;
  }

  const resetTime = formatDuration(status.resetIn);
  return `⚠️ Rate limit exceeded. Reset in ${resetTime}.`;
}
