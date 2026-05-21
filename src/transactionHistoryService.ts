/**
 * PHASE 4: Transaction History Service
 *
 * Tracks all economic actions for audit and user review:
 * - Records transfers, payments, session creation, agent registration
 * - Stores transaction metadata (amount, recipient, status, timestamp)
 * - Provides transaction history retrieval with filtering
 * - Auto-cleanup of old records (retention: 90 days)
 */

import { logger } from "./logger";
import { readUserProfile, writeUserProfile } from "./storage";
import { config } from "./config";

export interface Transaction {
  id: string;
  userId: number;
  type: "transfer" | "payment" | "session-create" | "agent-register" | "withdrawal" | "deposit";
  amount: number;
  currency: string;
  recipient?: string;
  serviceId?: string;
  description: string;
  status: "pending" | "completed" | "failed";
  error?: string;
  txHash?: string; // Blockchain tx hash if applicable
  gasUsed?: number;
  timestamp: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface TransactionFilter {
  type?: Transaction["type"];
  status?: Transaction["status"];
  startDate?: number;
  endDate?: number;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
}

/**
 * Record a new transaction
 */
export async function recordTransaction(userId: number, tx: Omit<Transaction, "id" | "userId" | "timestamp">): Promise<Transaction> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.transactions) {
      profile.transactions = [];
    }

    const transaction: Transaction = {
      ...tx,
      id: `tx_${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      userId,
      timestamp: Date.now(),
    };

    profile.transactions.push(transaction);
    writeUserProfile(userId, config.userDataRoot, profile);

    logger.info(
      {
        userId,
        txId: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
      },
      "Transaction recorded"
    );

    return transaction;
  } catch (error) {
    logger.error({ userId, error }, "Error recording transaction");
    throw error;
  }
}

/**
 * Update transaction status (e.g., pending -> completed)
 */
export async function updateTransactionStatus(
  userId: number,
  txId: string,
  status: Transaction["status"],
  updates?: Partial<Transaction>
): Promise<Transaction | null> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.transactions) {
      return null;
    }

    const tx = profile.transactions.find((t) => t.id === txId);
    if (!tx) {
      return null;
    }

    tx.status = status;
    if (status === "completed" || status === "failed") {
      tx.completedAt = Date.now();
    }

    if (updates) {
      Object.assign(tx, updates);
    }

    writeUserProfile(userId, config.userDataRoot, profile);

    logger.info(
      {
        userId,
        txId,
        status,
      },
      "Transaction status updated"
    );

    return tx;
  } catch (error) {
    logger.error({ userId, txId, error }, "Error updating transaction");
    return null;
  }
}

/**
 * Get transaction history with optional filtering
 */
export function getTransactionHistory(userId: number, filter?: TransactionFilter): Transaction[] {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.transactions || profile.transactions.length === 0) {
      return [];
    }

    let results = profile.transactions;

    // Apply filters
    if (filter?.type) {
      results = results.filter((t) => t.type === filter.type);
    }

    if (filter?.status) {
      results = results.filter((t) => t.status === filter.status);
    }

    if (filter?.startDate) {
      results = results.filter((t) => t.timestamp >= filter.startDate!);
    }

    if (filter?.endDate) {
      results = results.filter((t) => t.timestamp <= filter.endDate!);
    }

    if (filter?.minAmount !== undefined) {
      results = results.filter((t) => t.amount >= filter.minAmount!);
    }

    if (filter?.maxAmount !== undefined) {
      results = results.filter((t) => t.amount <= filter.maxAmount!);
    }

    // Sort by timestamp descending (newest first)
    results = results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    const limit = filter?.limit || 50;
    return results.slice(0, limit);
  } catch (error) {
    logger.error({ userId, error }, "Error retrieving transaction history");
    return [];
  }
}

/**
 * Get single transaction by ID
 */
export function getTransaction(userId: number, txId: string): Transaction | null {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.transactions) {
      return null;
    }

    return profile.transactions.find((t) => t.id === txId) || null;
  } catch (error) {
    logger.error({ userId, txId, error }, "Error retrieving transaction");
    return null;
  }
}

/**
 * Get transaction summary stats
 */
export function getTransactionStats(userId: number, days: number = 30): {
  totalCount: number;
  totalAmount: number;
  averageAmount: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
} {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.transactions || profile.transactions.length === 0) {
      return {
        totalCount: 0,
        totalAmount: 0,
        averageAmount: 0,
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
        byType: {},
        byStatus: {},
      };
    }

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = profile.transactions.filter((t) => t.timestamp >= cutoff);

    const stats = {
      totalCount: recent.length,
      totalAmount: 0,
      averageAmount: 0,
      successCount: 0,
      failedCount: 0,
      pendingCount: 0,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    };

    for (const tx of recent) {
      // Only count completed transactions for totals
      if (tx.status === "completed") {
        stats.totalAmount += tx.amount;
        stats.successCount++;
      } else if (tx.status === "failed") {
        stats.failedCount++;
      } else if (tx.status === "pending") {
        stats.pendingCount++;
      }

      stats.byType[tx.type] = (stats.byType[tx.type] || 0) + 1;
      stats.byStatus[tx.status] = (stats.byStatus[tx.status] || 0) + 1;
    }

    stats.averageAmount = stats.successCount > 0 ? stats.totalAmount / stats.successCount : 0;

    return stats;
  } catch (error) {
    logger.error({ userId, error }, "Error calculating transaction stats");
    return {
      totalCount: 0,
      totalAmount: 0,
      averageAmount: 0,
      successCount: 0,
      failedCount: 0,
      pendingCount: 0,
      byType: {},
      byStatus: {},
    };
  }
}

/**
 * Clean up old transactions (retention: 90 days)
 */
export async function cleanupOldTransactions(userId: number, retentionDays: number = 90): Promise<number> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);

    if (!profile.transactions || profile.transactions.length === 0) {
      return 0;
    }

    const before = profile.transactions.length;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    // Keep transactions that are newer than cutoff OR are still pending
    profile.transactions = profile.transactions.filter(
      (t) => t.timestamp >= cutoff || t.status === "pending"
    );

    const removed = before - profile.transactions.length;

    if (removed > 0) {
      writeUserProfile(userId, config.userDataRoot, profile);
      logger.info({ userId, removed, retentionDays }, "Old transactions cleaned up");
    }

    return removed;
  } catch (error) {
    logger.error({ userId, error }, "Error cleaning up transactions");
    return 0;
  }
}

/**
 * Format transaction for display
 */
export function formatTransaction(tx: Transaction): string {
  const statusEmoji = {
    completed: "✅",
    failed: "❌",
    pending: "⏳",
  }[tx.status];

  const typeLabel = {
    transfer: "💸 Transfer",
    payment: "💳 Payment",
    "session-create": "🔓 Session",
    "agent-register": "🤖 Agent",
    withdrawal: "📤 Withdrawal",
    deposit: "📥 Deposit",
  }[tx.type];

  const date = new Date(tx.timestamp);
  const timeStr = date.toLocaleDateString() + " " + date.toLocaleTimeString();

  let line = `${statusEmoji} ${typeLabel} • ${tx.amount} ${tx.currency}`;

  if (tx.recipient) {
    line += ` → ${tx.recipient.substring(0, 10)}...`;
  }

  line += ` • ${timeStr}`;

  if (tx.txHash) {
    line += ` [${tx.txHash.substring(0, 8)}...]`;
  }

  return line;
}

/**
 * Format transaction history for Telegram display
 */
export function formatTransactionHistory(transactions: Transaction[], limit: number = 10): string {
  if (transactions.length === 0) {
    return "📋 No transactions found";
  }

  let output = "📋 *Recent Transactions*\n\n";
  const limited = transactions.slice(0, limit);

  for (const tx of limited) {
    output += formatTransaction(tx) + "\n";
  }

  if (transactions.length > limit) {
    output += `\n_... and ${transactions.length - limit} more_`;
  }

  return output;
}
