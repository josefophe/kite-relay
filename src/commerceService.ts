/**
 * PHASE 4: Commerce Service Layer
 * 
 * Real x402 paid execution for airtime, data, and subscriptions.
 * Integrates Kite Passport sessions with Reloadly backend.
 * 
 * All purchases execute through:
 * 1. Session-validated budget enforcement
 * 2. Kite wallet payment execution
 * 3. Real provider API calls (Reloadly)
 * 4. Audit log + purchase history
 */

import axios from "axios";
import { executeKpass } from "./userRuntime";
import { logger } from "./logger";
import { readUserProfile, writeUserProfile, getUserPaths } from "./storage";
import { config } from "./config";
import path from "path";
import fs from "fs";

export interface CommerceProvider {
  id: string;
  name: string;
  type: "airtime" | "data" | "api";
  operatorId?: number; // Reloadly operator
  supported: boolean;
}

export interface CommerceProduct {
  name: string;
  provider: string;
  amount: number;
  currency: "NGN" | "USD" | "USDC";
  type: "airtime" | "data";
  expiresIn?: string;
}

export interface CommerceTransaction {
  id: string;
  userId: number;
  type: "airtime" | "data" | "subscription";
  recipient: string;
  provider: string;
  amountLocalCurrency: number;
  amountUSDC: number;
  status: "pending" | "success" | "failed";
  txHash?: string;
  operationId?: string;
  timestamp: number;
  error?: string;
}

/**
 * Supported providers mapping
 */
const PROVIDERS: Record<string, CommerceProvider> = {
  MTN: {
    id: "MTN",
    name: "MTN Nigeria",
    type: "airtime",
    operatorId: 341,
    supported: true,
  },
  GLO: {
    id: "GLO",
    name: "Globacom",
    type: "airtime",
    operatorId: 342,
    supported: true,
  },
  AIRTEL: {
    id: "AIRTEL",
    name: "Airtel Nigeria",
    type: "airtime",
    operatorId: 340,
    supported: true,
  },
  NTEL: {
    id: "NTEL",
    name: "9Mobile",
    type: "airtime",
    operatorId: 347,
    supported: true,
  },
};

/**
 * Get Reloadly auth token for provider API calls
 */
async function getReloadlyToken(): Promise<string> {
  try {
    const response = await axios.post(
      "https://auth.reloadly.com/oauth/token",
      {
        client_id: process.env.RELOADLY_CLIENT_ID,
        client_secret: process.env.RELOADLY_CLIENT_SECRET,
        grant_type: "client_credentials",
        audience: "https://topups-sandbox.reloadly.com",
      }
    );
    return response.data.access_token;
  } catch (error) {
    logger.error({ error }, "Failed to get Reloadly token");
    throw new Error("Provider authentication failed");
  }
}

/**
 * Convert NGN to USDC at approximate rate
 * In production, would use real price oracle
 */
function convertNGNToUSDC(ngnAmount: number): number {
  const NGN_TO_USD = 1500; // Approximate rate
  const usdcAmount = ngnAmount / NGN_TO_USD;
  return Math.round(usdcAmount * 10000) / 10000; // Round to 4 decimals
}

/**
 * Sanitize phone number to E.164 format
 */
function sanitizePhoneNumber(phone: string): string {
  // Remove common separators
  let cleaned = phone.replace(/[\s\-()]+/g, "");

  // If starts with 0 (Nigeria), replace with +234
  if (cleaned.startsWith("0")) {
    cleaned = "+234" + cleaned.substring(1);
  }
  // If doesn't start with +, assume +234
  else if (!cleaned.startsWith("+")) {
    cleaned = "+234" + cleaned;
  }

  return cleaned;
}

/**
 * Validate phone number format
 */
function isValidPhoneNumber(phone: string): boolean {
  const sanitized = sanitizePhoneNumber(phone);
  // E.164 format: +<country><number>
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(sanitized);
}

/**
 * Get provider by code (case-insensitive)
 */
function getProvider(code: string): CommerceProvider | null {
  const key = code.toUpperCase();
  return PROVIDERS[key] || null;
}

/**
 * Execute airtime purchase via Reloadly
 */
async function executeAirtimeDelivery(
  phoneNumber: string,
  amountNGN: number,
  provider: CommerceProvider
): Promise<{ transactionId: string; statusMessage: string }> {
  const token = await getReloadlyToken();

  try {
    const response = await axios.post(
      "https://topups-sandbox.reloadly.com/topups",
      {
        operatorId: provider.operatorId,
        amount: amountNGN,
        useLocalAmount: true,
        recipientPhone: {
          countryCode: "NG",
          number: phoneNumber.replace(/^\+234/, "0"),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/com.reloadly.topups-v1+json",
          "Content-Type": "application/json",
        },
      }
    );

    return {
      transactionId: response.data.transactionId || response.data.id,
      statusMessage: response.data.status || "pending",
    };
  } catch (error: any) {
    logger.error({ error: error.message, provider }, "Reloadly API error");
    throw new Error(`Provider delivery failed: ${error.message}`);
  }
}

/**
 * Validate active session and check budget availability
 * CRITICAL: Session must be active, not expired, and have sufficient budget
 */
async function validateSessionBudget(
  userId: number,
  sessionId: string,
  requiredAmountUSDC: number
): Promise<{ valid: boolean; error?: string; session?: Record<string, unknown> }> {
  try {
    // Retrieve active sessions
    const output = await executeKpass(
      userId,
      ["agent:session", "list", "--status", "active", "--output", "json"],
      "session-list"
    );

    const result = JSON.parse(output);
    const sessions = result.sessions || [];
    const session = sessions.find((s: any) => s.id === sessionId);

    if (!session) {
      return {
        valid: false,
        error: `❌ Session not found: ${sessionId}\n\nYou may need to create and approve a session first.`,
      };
    }

    if (session.status !== "active") {
      return {
        valid: false,
        error: `❌ Session is not active. Current status: ${session.status}\n\nPlease approve the session first.`,
      };
    }

    // Check expiration
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return {
        valid: false,
        error: `❌ Session has expired (was valid until ${expiresAt.toISOString()})\n\nPlease create a new session.`,
      };
    }

    // Check per-transaction limit
    const maxPerTx = parseFloat(session.delegation?.payment_policy?.max_amount_per_tx || "0");
    if (maxPerTx > 0 && requiredAmountUSDC > maxPerTx) {
      return {
        valid: false,
        error: `❌ Transaction amount (${requiredAmountUSDC} USDC) exceeds per-tx limit (${maxPerTx} USDC)\n\nCreate a session with higher per-tx limit.`,
      };
    }

    // Check total budget remaining
    const maxTotal = parseFloat(session.delegation?.payment_policy?.max_total_amount || "0");
    const spent = parseFloat(session.usage?.spent_total || "0");
    const reserved = parseFloat(session.usage?.reserved_total || "0");
    const remaining = maxTotal - spent - reserved;

    if (maxTotal > 0 && requiredAmountUSDC > remaining) {
      return {
        valid: false,
        error: `❌ Insufficient budget in session\n\nRequired: ${requiredAmountUSDC} USDC\nRemaining: ${remaining} USDC (of ${maxTotal} USDC total)\n\nCreate a new session or wait for budget to reset.`,
      };
    }

    return { valid: true, session };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    logger.error({ userId, sessionId, error: errorMsg }, "Session validation failed");
    return {
      valid: false,
      error: `❌ Failed to validate session: ${errorMsg}`,
    };
  }
}

/**
 * Execute payment through Kite session
 * This represents the x402 payment execution scoped to the session
 *
 * CRITICAL:
 * - Session must be validated and active before calling this
 * - Transaction must fit within session's max_amount_per_tx
 * - Total spent + reserved must not exceed max_total_amount
 */
async function executePaymentViaSession(
  userId: number,
  sessionId: string,
  amountUSDC: number,
  recipient: string,
  description: string
): Promise<string> {
  try {
    // MANDATORY: Validate session before payment
    const validation = await validateSessionBudget(userId, sessionId, amountUSDC);
    if (!validation.valid) {
      throw new Error(validation.error || "Session validation failed");
    }

    logger.info(
      { userId, sessionId, amountUSDC, recipient },
      "Executing scoped x402 payment"
    );

    const output = await executeKpass(
      userId,
      [
        "wallet",
        "send",
        "--to",
        recipient,
        "--amount",
        amountUSDC.toString(),
        "--asset",
        "USDC",
        "--session-id",
        sessionId,
        "--description",
        description,
        "--output",
        "json",
      ],
      "commerce-payment"
    );

    try {
      const result = JSON.parse(output);
      return result.tx_hash || result.hash || "pending";
    } catch {
      return output; // Return raw output as fallback
    }
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    logger.error(
      { userId, sessionId, amountUSDC, error: errorMsg },
      "Session payment failed"
    );
    throw error;
  }
}

/**
 * Store purchase transaction for audit trail
 */
function recordTransaction(
  userId: number,
  transaction: CommerceTransaction
): void {
  try {
    const paths = getUserPaths(userId, config.userDataRoot);
    const historyDir = paths.workspace;
    const historyFile = path.join(historyDir, "commerce-history.json");

    let history: CommerceTransaction[] = [];
    if (fs.existsSync(historyFile)) {
      const content = fs.readFileSync(historyFile, "utf-8");
      history = JSON.parse(content);
    }

    history.push(transaction);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

    logger.info(
      { userId, transactionId: transaction.id },
      "Transaction recorded"
    );
  } catch (error) {
    logger.warn(
      { userId, error },
      "Failed to record transaction in history"
    );
    // Don't fail the purchase if recording fails
  }
}

/**
 * Get purchase history for user
 */
export function getCommerceHistory(userId: number): CommerceTransaction[] {
  try {
    const paths = getUserPaths(userId, config.userDataRoot);
    const historyFile = path.join(paths.workspace, "commerce-history.json");

    if (!fs.existsSync(historyFile)) {
      return [];
    }

    const content = fs.readFileSync(historyFile, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    logger.warn({ userId, error }, "Failed to read commerce history");
    return [];
  }
}

/**
 * Main purchase flow: Buy Airtime
 * 
 * Steps:
 * 1. Validate user is authenticated
 * 2. MANDATORY: Require active session with budget (no defaults)
 * 3. Validate phone number and provider
 * 4. Calculate USDC cost
 * 5. Validate session budget availability
 * 6. Execute payment via session
 * 7. Deliver airtime via Reloadly
 * 8. Record transaction
 * 9. Return confirmation with tx hash
 */
export async function buyAirtimeFlow(
  userId: number,
  phoneNumber: string,
  amountNGN: number,
  providerCode: string,
  sessionId?: string
): Promise<{
  success: boolean;
  output: string;
  txHash?: string;
  transactionId?: string;
}> {
  // Airtime Treasury Address - receives all airtime purchase payments
  const AIRTIME_TREASURY = "0x0A9e112C42256ff917cCFbB67f7Ef63400322158";
  
  const transactionId = `airt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  try {
    // 1. Validate authentication
    const profile = readUserProfile(userId, config.userDataRoot);
    if (!profile.identity?.walletId) {
      return {
        success: false,
        output: `❌ Not authenticated.\n\nPlease run /login first to set up your wallet.`,
      };
    }

    // CRITICAL: Require explicit session ID (no defaults)
    if (!sessionId) {
      return {
        success: false,
        output: `❌ MANDATORY: Active spending session required.\n\n` +
                `You must create and approve a spending session before making purchases.\n\n` +
                `Steps:\n` +
                `1. Run /request-session to create a session\n` +
                `2. Approve it with your passkey\n` +
                `3. Pass the session ID to this command\n\n` +
                `This ensures budget enforcement and prevents unauthorized purchases.`,
      };
    }

    // 2. Validate provider
    const provider = getProvider(providerCode);
    if (!provider || !provider.supported) {
      const supportedProviders = Object.keys(PROVIDERS)
        .filter((k) => PROVIDERS[k].supported)
        .join(", ");
      return {
        success: false,
        output: `❌ Provider not supported: ${providerCode}\n\nSupported: ${supportedProviders}`,
      };
    }

    // 3. Validate phone number
    if (!isValidPhoneNumber(phoneNumber)) {
      return {
        success: false,
        output: `❌ Invalid phone number format.\n\nExpected: 08012345678 or +2348012345678`,
      };
    }

    // 4. Validate amount
    if (amountNGN <= 0 || amountNGN > 100000) {
      return {
        success: false,
        output: `❌ Invalid amount. Must be between ₦1 and ₦100,000.`,
      };
    }

    // 5. Convert to USDC
    const amountUSDC = convertNGNToUSDC(amountNGN);

    // 6. Validate session budget BEFORE attempting payment
    const budgetCheck = await validateSessionBudget(userId, sessionId, amountUSDC);
    if (!budgetCheck.valid) {
      return {
        success: false,
        output: budgetCheck.error || "Session validation failed",
      };
    }

    // 7. Execute wallet transfer to treasury (CRITICAL: Real blockchain payment)
    let txHash: string;
    try {
      txHash = await executePaymentViaSession(
        userId,
        sessionId,
        amountUSDC,
        AIRTIME_TREASURY, // Send to treasury, not personal wallet
        `Airtime to ${phoneNumber} via ${provider.name}`
      );
    } catch (paymentError: any) {
      const transaction: CommerceTransaction = {
        id: transactionId,
        userId,
        type: "airtime",
        recipient: phoneNumber,
        provider: provider.name,
        amountLocalCurrency: amountNGN,
        amountUSDC,
        status: "failed",
        timestamp: Date.now(),
        error: String(paymentError),
      };
      recordTransaction(userId, transaction);

      return {
        success: false,
        output: `❌ Payment failed: ${paymentError.message}\n\nPlease check your session or balance.`,
      };
    }

    // 8. Deliver airtime
    let deliveryResult;
    try {
      deliveryResult = await executeAirtimeDelivery(
        sanitizePhoneNumber(phoneNumber),
        amountNGN,
        provider
      );
    } catch (deliveryError: any) {
      // Payment succeeded but delivery failed - unusual but possible
      const transaction: CommerceTransaction = {
        id: transactionId,
        userId,
        type: "airtime",
        recipient: phoneNumber,
        provider: provider.name,
        amountLocalCurrency: amountNGN,
        amountUSDC,
        status: "failed",
        txHash,
        timestamp: Date.now(),
        error: `Delivery failed: ${deliveryError.message}`,
      };
      recordTransaction(userId, transaction);

      return {
        success: false,
        output:
          `⚠️ Payment processed but delivery failed.\n\n` +
          `TX Hash: ${txHash}\n` +
          `Error: ${deliveryError.message}\n\n` +
          `Contact support if funds were not returned.`,
        txHash,
        transactionId,
      };
    }

    // 9. Record success
    const transaction: CommerceTransaction = {
      id: transactionId,
      userId,
      type: "airtime",
      recipient: phoneNumber,
      provider: provider.name,
      amountLocalCurrency: amountNGN,
      amountUSDC,
      status: "success",
      txHash,
      operationId: deliveryResult.transactionId,
      timestamp: Date.now(),
    };
    recordTransaction(userId, transaction);

    // 10. Format response
    const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
    const explorerUrl = `https://kitescan.ai/tx/${txHash}`;

    return {
      success: true,
      output:
        `✅ *Airtime Purchase Successful*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📱 *Recipient:* ${sanitizedPhone}\n` +
        `🏢 *Provider:* ${provider.name}\n` +
        `💰 *Amount:* ₦${amountNGN.toLocaleString()}\n` +
        `💵 *Paid:* ${amountUSDC} USDC\n` +
        `🔗 *TX:* [${txHash.substring(0, 10)}...](${explorerUrl})\n` +
        `⏱️ *Status:* Confirmed\n`,
      txHash,
      transactionId,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { userId, phoneNumber, amountNGN, error: errorMsg },
      "Airtime purchase failed"
    );

    return {
      success: false,
      output: `❌ Purchase failed: ${errorMsg}`,
    };
  }
}

/**
 * Buy mobile data flow
 * Accepts NGN amount (numeric) for now. Size strings (e.g., 2GB) are not auto-priced.
 *
 * CRITICAL: Requires active spending session (no defaults allowed)
 */
export async function buyDataFlow(
  userId: number,
  recipient: string,
  amountNGN: number,
  providerCode: string,
  sessionId?: string
): Promise<{
  success: boolean;
  output: string;
  txHash?: string;
  transactionId?: string;
}> {
  // Data Treasury Address - receives all data purchase payments
  const DATA_TREASURY = "0x0A9e112C42256ff917cCFbB67f7Ef63400322158";
  
  const transactionId = `data_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  try {
    const profile = readUserProfile(userId, config.userDataRoot);
    if (!profile.identity?.walletId) {
      return {
        success: false,
        output: `❌ Not authenticated. Please run /login first.`,
      };
    }

    // CRITICAL: Require explicit session ID (no defaults)
    if (!sessionId) {
      return {
        success: false,
        output: `❌ MANDATORY: Active spending session required.\n\n` +
                `You must create and approve a spending session before making purchases.\n\n` +
                `Steps:\n` +
                `1. Run /request-session to create a session\n` +
                `2. Approve it with your passkey\n` +
                `3. Pass the session ID to this command\n\n` +
                `This ensures budget enforcement and prevents unauthorized purchases.`,
      };
    }

    const provider = getProvider(providerCode);
    if (!provider || !provider.supported) {
      const supportedProviders = Object.keys(PROVIDERS)
        .filter((k) => PROVIDERS[k].supported)
        .join(", ");
      return {
        success: false,
        output: `❌ Provider not supported: ${providerCode}\n\nSupported: ${supportedProviders}`,
      };
    }

    if (amountNGN <= 0 || amountNGN > 100000) {
      return { success: false, output: `❌ Invalid amount. Must be between ₦1 and ₦100,000.` };
    }

    const amountUSDC = convertNGNToUSDC(amountNGN);

    // Validate session budget BEFORE attempting payment
    const budgetCheck = await validateSessionBudget(userId, sessionId, amountUSDC);
    if (!budgetCheck.valid) {
      return {
        success: false,
        output: budgetCheck.error || "Session validation failed",
      };
    }

    // Execute wallet transfer to treasury (CRITICAL: Real blockchain payment)
    let txHash: string;
    try {
      txHash = await executePaymentViaSession(
        userId,
        sessionId,
        amountUSDC,
        DATA_TREASURY, // Send to treasury, not personal wallet
        `Data purchase for ${recipient} via ${provider.name}`
      );
    } catch (paymentError: any) {
      const transaction: CommerceTransaction = {
        id: transactionId,
        userId,
        type: "data",
        recipient,
        provider: provider.name,
        amountLocalCurrency: amountNGN,
        amountUSDC,
        status: "failed",
        timestamp: Date.now(),
        error: String(paymentError),
      };
      recordTransaction(userId, transaction);

      return {
        success: false,
        output: `❌ Payment failed: ${paymentError.message}\n\nPlease check your session or balance.`,
      };
    }

    // Call provider delivery (reuse airtime topup endpoint where appropriate)
    let deliveryResult;
    try {
      deliveryResult = await executeAirtimeDelivery(
        sanitizePhoneNumber(recipient),
        amountNGN,
        provider
      );
    } catch (deliveryError: any) {
      const transaction: CommerceTransaction = {
        id: transactionId,
        userId,
        type: "data",
        recipient,
        provider: provider.name,
        amountLocalCurrency: amountNGN,
        amountUSDC,
        status: "failed",
        txHash,
        timestamp: Date.now(),
        error: `Delivery failed: ${deliveryError.message}`,
      };
      recordTransaction(userId, transaction);

      return {
        success: false,
        output:
          `⚠️ Payment processed but delivery failed.\n\n` +
          `TX Hash: ${txHash}\n` +
          `Error: ${deliveryError.message}\n\n` +
          `Contact support if funds were not returned.`,
        txHash,
        transactionId,
      };
    }

    const transaction: CommerceTransaction = {
      id: transactionId,
      userId,
      type: "data",
      recipient,
      provider: provider.name,
      amountLocalCurrency: amountNGN,
      amountUSDC,
      status: "success",
      txHash,
      operationId: deliveryResult.transactionId,
      timestamp: Date.now(),
    };
    recordTransaction(userId, transaction);

    const explorerUrl = `https://kitescan.ai/tx/${txHash}`;

    return {
      success: true,
      output:
        `✅ *Data Purchase Successful*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📱 *Recipient:* ${sanitizePhoneNumber(recipient)}\n` +
        `🏢 *Provider:* ${provider.name}\n` +
        `💰 *Amount:* ₦${amountNGN.toLocaleString()}\n` +
        `💵 *Paid:* ${amountUSDC} USDC\n` +
        `🔗 *TX:* [${txHash.substring(0, 10)}...](${explorerUrl})\n` +
        `⏱️ *Status:* Confirmed\n`,
      txHash,
      transactionId,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, recipient, amountNGN, error: errorMsg }, "Data purchase failed");
    return { success: false, output: `❌ Purchase failed: ${errorMsg}` };
  }
}

/**
 * Format commerce history for display
 */
export function formatCommerceHistory(transactions: CommerceTransaction[]): string {
  if (transactions.length === 0) {
    return "📋 No purchase history yet.\n\nTry `/buy-airtime <phone> <amount> <provider>`";
  }

  let output = `📋 *Purchase History*\n━━━━━━━━━━━━━━━━━━\n\n`;

  // Show last 10 transactions
  const recent = transactions.slice(-10).reverse();
  for (let i = 0; i < recent.length; i++) {
    const tx = recent[i];
    const date = new Date(tx.timestamp).toLocaleDateString();
    const icon = tx.status === "success" ? "✅" : "❌";
    const type = tx.type.toUpperCase();

    output += `${icon} ${type} - ₦${tx.amountLocalCurrency}\n`;
    output += `   To: ${tx.recipient}\n`;
    output += `   Provider: ${tx.provider}\n`;
    output += `   Date: ${date}\n\n`;
  }

  return output;
}

export { getProvider, sanitizePhoneNumber, isValidPhoneNumber };
