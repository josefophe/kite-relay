/**
 * PHASE 4: Budget Enforcement Service
 *
 * Implements per-user spending budgets:
 * - Daily, weekly, monthly spending limits
 * - Pre-execution budget validation
 * - Deduct amounts after transaction
 * - Budget reset on period boundary
 * - Flexible budget override for admins
 */

import { logger } from "./logger";
import { readUserProfile, writeUserProfile } from "./storage";
import { config } from "./config";

export interface SpendingBudget {
  period: "daily" | "weekly" | "monthly";
  limit: number; // USD equivalent
  spent: number;
  periodStart: number;
  periodEnd: number;
  lastUpdated: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  percentUsed: number;
  error?: string;
  budgetReset?: number; // Timestamp when budget resets
}

/**
 * Default budgets (USD equivalent)
 */
const DEFAULT_BUDGETS = {
  daily: 500, // $500/day
  weekly: 2000, // $2000/week
  monthly: 8000, // $8000/month
};

/**
 * Get period boundary timestamps
 */
function getPeriodBoundaries(period: "daily" | "weekly" | "monthly"): {
  start: number;
  end: number;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const day = now.getDay();

  let start: Date;
  let end: Date;

  if (period === "daily") {
    start = new Date(year, month, date, 0, 0, 0, 0);
    end = new Date(year, month, date, 23, 59, 59, 999);
  } else if (period === "weekly") {
    // Week starts on Monday
    const weekStart = new Date(year, month, date - day + (day === 0 ? -6 : 1));
    start = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0);
    end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7, 23, 59, 59, 999);
  } else {
    // monthly
    start = new Date(year, month, 1, 0, 0, 0, 0);
    end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  }

  return {
    start: start.getTime(),
    end: end.getTime(),
  };
}

/**
 * Initialize or get budget
 */
function getOrCreateBudget(profile: any, period: "daily" | "weekly" | "monthly"): SpendingBudget {
  if (!profile.budgets) {
    profile.budgets = {};
  }

  const budget = profile.budgets[period];
  const boundaries = getPeriodBoundaries(period);
  const now = Date.now();

  // If budget doesn't exist or period has ended, create new one
  if (!budget || now > budget.periodEnd) {
    return {
      period,
      limit: DEFAULT_BUDGETS[period],
      spent: 0,
      periodStart: boundaries.start,
      periodEnd: boundaries.end,
      lastUpdated: now,
    };
  }

  return budget;
}

/**
 * Check if spending amount is within budget
 */
export async function checkBudget(userId: number, amount: number, currency: string = "USDC"): Promise<BudgetCheckResult> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    // Get all budgets
    const daily = getOrCreateBudget(profile, "daily");
    const weekly = getOrCreateBudget(profile, "weekly");
    const monthly = getOrCreateBudget(profile, "monthly");

    // Update profile with refreshed budgets
    if (!profile.budgets) profile.budgets = {};
    profile.budgets.daily = daily;
    profile.budgets.weekly = weekly;
    profile.budgets.monthly = monthly;

    // Check each budget period
    const now = Date.now();
    const checks = [
      { budget: daily, name: "daily" },
      { budget: weekly, name: "weekly" },
      { budget: monthly, name: "monthly" },
    ];

    for (const { budget, name } of checks) {
      if (budget.spent + amount > budget.limit) {
        const remaining = Math.max(0, budget.limit - budget.spent);
        const percentUsed = Math.round((budget.spent / budget.limit) * 100);
        const resetIn = budget.periodEnd - now;

        logger.warn(
          {
            userId,
            budget: name,
            limit: budget.limit,
            spent: budget.spent,
            requested: amount,
            remaining,
          },
          "Budget limit exceeded"
        );

        return {
          allowed: false,
          remaining,
          percentUsed,
          budgetReset: budget.periodEnd,
          error: `${name} budget exceeded. Limit: $${budget.limit}, Spent: $${budget.spent}, Requested: $${amount}`,
        };
      }
    }

    // All budgets allow - calculate lowest remaining
    const allRemaining = [
      Math.max(0, daily.limit - daily.spent - amount),
      Math.max(0, weekly.limit - weekly.spent - amount),
      Math.max(0, monthly.limit - monthly.spent - amount),
    ];

    const remaining = Math.min(...allRemaining);
    const avgPercentUsed = Math.round(
      ((daily.spent + weekly.spent + monthly.spent) / (daily.limit + weekly.limit + monthly.limit)) * 100
    );

    logger.debug(
      {
        userId,
        amount,
        remaining,
        percentUsed: avgPercentUsed,
      },
      "Budget check passed"
    );

    return {
      allowed: true,
      remaining,
      percentUsed: avgPercentUsed,
      budgetReset: Math.min(daily.periodEnd, weekly.periodEnd, monthly.periodEnd),
    };
  } catch (error) {
    logger.error({ userId, error }, "Error checking budget");
    // Fail open but log
    return {
      allowed: true,
      remaining: -1,
      percentUsed: -1,
      error: "Could not verify budget",
    };
  }
}

/**
 * Deduct amount from all relevant budgets
 */
export async function deductFromBudget(userId: number, amount: number): Promise<boolean> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.budgets) {
      profile.budgets = {};
    }

    const periods: Array<"daily" | "weekly" | "monthly"> = ["daily", "weekly", "monthly"];

    for (const period of periods) {
      let budget = profile.budgets[period];

      if (!budget) {
        // Create new budget if doesn't exist
        const boundaries = getPeriodBoundaries(period);
        budget = {
          period,
          limit: DEFAULT_BUDGETS[period],
          spent: 0,
          periodStart: boundaries.start,
          periodEnd: boundaries.end,
          lastUpdated: Date.now(),
        };
      } else if (Date.now() > budget.periodEnd) {
        // Reset if period ended
        const boundaries = getPeriodBoundaries(period);
        budget = {
          period,
          limit: budget.limit,
          spent: 0,
          periodStart: boundaries.start,
          periodEnd: boundaries.end,
          lastUpdated: Date.now(),
        };
      }

      budget.spent += amount;
      budget.lastUpdated = Date.now();
      profile.budgets[period] = budget;
    }

    writeUserProfile(userId, config.userDataRoot, profile);

    logger.info(
      {
        userId,
        amount,
        daily: profile.budgets.daily?.spent,
        weekly: profile.budgets.weekly?.spent,
        monthly: profile.budgets.monthly?.spent,
      },
      "Budget deducted"
    );

    return true;
  } catch (error) {
    logger.error({ userId, amount, error }, "Error deducting from budget");
    return false;
  }
}

/**
 * Get current budget status
 */
export function getBudgetStatus(userId: number): Record<string, SpendingBudget & BudgetCheckResult> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.budgets) {
      profile.budgets = {};
    }

    const periods: Array<"daily" | "weekly" | "monthly"> = ["daily", "weekly", "monthly"];
    const status: Record<string, any> = {};

    for (const period of periods) {
      const budget = getOrCreateBudget(profile, period);
      const remaining = Math.max(0, budget.limit - budget.spent);
      const percentUsed = Math.round((budget.spent / budget.limit) * 100);

      status[period] = {
        ...budget,
        remaining,
        percentUsed,
        allowed: budget.spent < budget.limit,
      };
    }

    return status;
  } catch (error) {
    logger.error({ userId, error }, "Error getting budget status");
    return {};
  }
}

/**
 * Set custom budget limit
 */
export async function setBudgetLimit(
  userId: number,
  period: "daily" | "weekly" | "monthly",
  limit: number
): Promise<SpendingBudget | null> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.budgets) {
      profile.budgets = {};
    }

    const budget = getOrCreateBudget(profile, period);
    budget.limit = limit;
    budget.lastUpdated = Date.now();

    profile.budgets[period] = budget;
    writeUserProfile(userId, config.userDataRoot, profile);

    logger.info(
      {
        userId,
        period,
        newLimit: limit,
      },
      "Budget limit updated"
    );

    return budget;
  } catch (error) {
    logger.error({ userId, period, limit, error }, "Error setting budget limit");
    return null;
  }
}

/**
 * Format budget status for Telegram
 */
export function formatBudgetStatus(status: Record<string, SpendingBudget & BudgetCheckResult>): string {
  let output = "💰 *Spending Budgets*\n\n";

  for (const [period, budget] of Object.entries(status)) {
    const bar = formatProgressBar(budget.percentUsed);
    const remaining = Math.max(0, budget.limit - budget.spent);

    output += `*${period.charAt(0).toUpperCase() + period.slice(1)}*\n`;
    output += `Limit: $${budget.limit} | Spent: $${budget.spent}\n`;
    output += `Remaining: $${remaining}\n`;
    output += `${bar} ${budget.percentUsed}%\n\n`;
  }

  return output;
}

/**
 * Helper: Format progress bar
 */
function formatProgressBar(percentUsed: number, width: number = 10): string {
  const filled = Math.round((percentUsed / 100) * width);
  const empty = width - filled;

  let bar = "[";
  bar += "█".repeat(filled);
  bar += "░".repeat(empty);
  bar += "]";

  return bar;
}
