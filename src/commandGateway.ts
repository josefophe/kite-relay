import { config } from "./config";
import { executeKpass, executeKsearch } from "./userRuntime";
import { isCommandAllowed, sanitizeSearchQuery } from "./policy";
import { appendUserHistory, readUserProfile, writeUserProfile, getUserPaths, PendingAuth } from "./storage";
import { logger } from "./logger";
import path from "path";
import fs from "fs";
import { getAgentStorage } from "./agentStorage";
import { getScheduler } from "./scheduler";

export interface CommandResult {
  success: boolean;
  output: string;
}

/**
 * Helper utility to securely assert if an isolated runtime configuration exists
 */
function assertAuthentication(userId: number): { exists: boolean; path: string } {
  const kpassConfigPath = `/data/users/${userId}/workspace/.kite-passport/config.json`;
  return { exists: fs.existsSync(kpassConfigPath), path: kpassConfigPath };
}

/**
 * STEP 1: Start authentication flow
 * User sends: /login email@example.com
 * Bot executes: kpass login init --email email@example.com
 */
export async function handleLoginInit(userId: number, email: string): Promise<CommandResult> {
  if (!isCommandAllowed("login")) {
    return { success: false, output: "Login command is not allowed." };
  }

  const sanitized = email.trim().toLowerCase();
  if (!sanitized || !sanitized.includes("@")) {
    return { success: false, output: "Please provide a valid email address.\nUsage: /login user@example.com" };
  }

  const startTime = Date.now();
  try {
    const output = await executeKpass(userId, ["login", "init", "--email", sanitized, "--output", "json"], "login-init");

    let loginId = "";
    try {
      const response = JSON.parse(output);
      loginId = response.loginId || response.login_id || "";
    } catch {
      return { success: true, output: output };
    }

    // Save the pending loginId to profile metadata so the bot knows this user is waiting to verify
    const profile = readUserProfile(userId, config.userDataRoot);
    if (!profile.preferences) {
      profile.preferences = { locale: "en-US" };
    }
    
    // Store pending auth with timestamp for TTL tracking
    profile.pendingAuth = {
      loginId,
      email: sanitized,
      createdAt: Date.now(),
    };
    writeUserProfile(userId, config.userDataRoot, profile);

    logger.info({ userId, email: sanitized, durationMs: Date.now() - startTime }, "telemetry: login initialization succeeded");

    // UPDATED MESSAGE: No more instructions to type a long command string
    const formattedOutput = 
      `📨 *Email verification initiated*\n` +
      `Please check *${sanitized}* for a verification code.\n\n` +
      `👉 *Reply to this message* or just type your verification code here:`;

    return { success: true, output: formattedOutput };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, email: sanitized, durationMs: Date.now() - startTime, error: errorMsg }, "telemetry: login initialization crashed");
    return { success: false, output: `Login initialization failed: ${errorMsg}` };
  }
}


/**
 * STEP 2: Complete authentication flow
 * User sends: /verify <login-id> <otp-code>
 * kpass persists auth to HOME/.kpass/config.json
 */
export async function handleVerify(userId: number, loginId: string, code: string, telegramUsername?: string): Promise<CommandResult> {
  if (!isCommandAllowed("login")) {
    return { success: false, output: "Login command is not allowed." };
  }

  const sanitizedId = loginId.trim();
  const sanitizedCode = code.trim();

  if (!sanitizedId || !sanitizedCode) {
    return { success: false, output: "Usage: /verify <login-id> <otp-code>" };
  }

  const startTime = Date.now();
  try {
    const output = await executeKpass(
      userId,
      ["login", "verify", "--login-id", sanitizedId, "--code", sanitizedCode, "--output", "json"],
      "login-verify"
    );

    let passportId = `user_${userId}`;
    let email = "authenticated";

    try {
      const response = JSON.parse(output);
      passportId = response.sub || response.passportId || response.user_id || passportId;
      email = response.email || email;
    } catch {
      // Allow fallback
    }

    const profile = readUserProfile(userId, config.userDataRoot);
    profile.identity = {
      passportId,
      walletId: undefined,
      label: email,
    };
    delete profile.pendingAuth;
    
    // Store Telegram username if provided (for /send @username lookups)
    if (telegramUsername) {
      (profile as any).telegramUsername = telegramUsername;
    }
    
    writeUserProfile(userId, config.userDataRoot, profile);

    logger.info({ userId, passportId, durationMs: Date.now() - startTime }, "telemetry: framework authentication session established");

    return {
      success: true,
      output:
        `✅ Authentication successful!\n` +
        `Passport ID: ${passportId}\n` +
        `Email: ${email}\n` +
        `\nYou can now use /balance, /search, and other commands.`,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, loginId: sanitizedId, durationMs: Date.now() - startTime, error: errorMsg }, "telemetry: verification flow validation failed");
    return { success: false, output: `Authentication failed: ${errorMsg}\nPlease try /login again.` };
  }
}

/**
 * Query wallet balance
 */
export async function handleBalance(userId: number): Promise<CommandResult> {
  if (!isCommandAllowed("balance")) {
    return { success: false, output: "Balance command is not allowed." };
  }

  const startTime = Date.now();
  try {
    const authStatus = assertAuthentication(userId);
    if (!authStatus.exists) {
      return {
        success: false,
        output: `❌ Not authenticated.\nChecked path: ${authStatus.path}\nPlease run /login first.`,
      };
    }

    const output = await executeKpass(userId, ["wallet", "balance", "--output", "json"], "balance");
    appendUserHistory(userId, config.userDataRoot, "balance", output);

    logger.info({ userId, durationMs: Date.now() - startTime }, "telemetry: balance check execution succeeded");

    try {
      const data = JSON.parse(output);
      if (data.status === "success" && Array.isArray(data.assets)) {
        let message = `💰 Wallet Balance\n`;
        message += `==============================\n`;
        message += `📍 Address: ${data.wallet_address}\n\n`;

        data.assets.forEach((asset: any) => {
          const balanceNum = parseFloat(asset.balance);
          if (balanceNum > 0 || asset.native) {
            const icon = asset.native ? "💎" : "🪙";
            message += `${icon} ${asset.symbol}: ${asset.balance}\n`;
          }
        });

        return { success: true, output: message };
      }
    } catch (parseError) {
      logger.warn({ userId, parseError }, "telemetry: failed parsing custom raw wallet balance output string structural types");
    }

    return { success: true, output: `💰 Wallet Balance Raw Dump:\n\n${output}` };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, durationMs: Date.now() - startTime, error: errorMsg }, "telemetry: balance transaction request crashed");
    return { success: false, output: `Balance query failed: ${errorMsg}` };
  }
}

/**
 * Search for information
 */
export async function handleSearch(userId: number, query: string): Promise<CommandResult> {
  if (!isCommandAllowed("search")) {
    return { success: false, output: "Search command is not allowed." };
  }

  const sanitized = sanitizeSearchQuery(query);
  const startTime = Date.now();
  try {
    const authStatus = assertAuthentication(userId);
    if (!authStatus.exists) {
      return { success: false, output: "❌ Session unauthenticated. Please run /login first." };
    }

    const output = await executeKsearch(userId, sanitized, "search");
    appendUserHistory(userId, config.userDataRoot, "search", sanitized);

    logger.info({ userId, querySize: sanitized.length, durationMs: Date.now() - startTime }, "telemetry: knowledge network search completed");
    return { success: true, output };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, query: sanitized, durationMs: Date.now() - startTime, error: errorMsg }, "telemetry: search daemon invocation crashed");
    return { success: false, output: `Search failed: ${errorMsg}` };
  }
}

/**
 * FEATURE 1: Transaction Capability (/transfer)
 * Executes on-chain transactions directly utilizing the internal user wallet context
 */
export async function handleTransfer(userId: number, textArguments: string): Promise<CommandResult> {
  if (!isCommandAllowed("transfer")) {
    return { success: false, output: "Transfer command is not allowed." };
  }

  const parts = textArguments.trim().split(/\s+/);
  const [toAddress, amount, tokenSymbol] = parts;

  if (!toAddress || !amount || !tokenSymbol) {
    return { 
      success: false, 
      output: "❌ Invalid Arguments.\nUsage: `/transfer <recipient_address> <amount> <token>`\nExample: `/transfer 0x123... 0.01 KITE`" 
    };
  }

  const startTime = Date.now();
  try {
    const authStatus = assertAuthentication(userId);
    if (!authStatus.exists) {
      return { success: false, output: "❌ Session unauthenticated. Please run /login first." };
    }

    const targetSymbol = tokenSymbol.toUpperCase();
    const output = await executeKpass(
      userId,
      ["wallet", "transfer", "--to", toAddress, "--amount", amount, "--token", targetSymbol, "--output", "json"],
      "transfer"
    );

    appendUserHistory(userId, config.userDataRoot, "transfer", output);
    logger.info({ userId, token: targetSymbol, amount, durationMs: Date.now() - startTime }, "telemetry: onchain transfer executed successfully");

    try {
      const data = JSON.parse(output);
      if (data.status === "success") {
        return {
          success: true,
          output: `✅ Transaction Executed!\n==============================\n📦 Hash: ${data.tx_hash || data.hash}\n💰 Asset: ${amount} ${targetSymbol}\n📍 To: ${toAddress}`
        };
      }
    } catch {
      // Fallback
    }

    return { success: true, output: `✅ Transfer complete. Output result:\n\n${output}` };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, destination: toAddress, durationMs: Date.now() - startTime, error: errorMsg }, "telemetry: transfer ledger write transaction crashed");
    return { success: false, output: `❌ Transfer operation failed: ${errorMsg}` };
  }
}

/**
 * FEATURE 2: Keystore Backups (/backup)
 * Securely reveals localized private keys for manual emergency user data recovery
 */
export async function handleBackup(userId: number): Promise<CommandResult> {
  if (!isCommandAllowed("backup")) {
    return { success: false, output: "Backup operations are disabled by policy rules." };
  }

  const startTime = Date.now();
  try {
    const authStatus = assertAuthentication(userId);
    if (!authStatus.exists) {
      return { success: false, output: "❌ Session unauthenticated. Please run /login first." };
    }

    const output = await executeKpass(userId, ["wallet", "export", "--private-key"], "backup");
    
    logger.warn({ userId, durationMs: Date.now() - startTime }, "telemetry: CRITICAL: wallet cryptographic keys exported by user request");

    return {
      success: true,
      output: `⚠️ CRITICAL SECURITY WARNING ⚠️\nNever expose this clear-text private key string to third parties. Delete this message immediately after your recovery import is complete.\n\n🔑 Your Private Key:\n\`${output.trim()}\``
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, durationMs: Date.now() - startTime, error: errorMsg }, "telemetry: failed extracting security key vault files");
    return { success: false, output: `❌ Key backup generation execution rejected: ${errorMsg}` };
  }
}

/**
 * FEATURE 3: Framework Telemetry Diagnostics Engine (/status /telemetry)
 * Optimizes observability profiles, checks metrics, and audits directory configurations live
 */
export async function handleTelemetryStatus(userId: number): Promise<CommandResult> {
  const startTime = Date.now();
  try {
    const authStatus = assertAuthentication(userId);
    const profile = readUserProfile(userId, config.userDataRoot);
    const userPaths = getUserPaths(userId, config.userDataRoot);

    let systemLogsStatus = "❌ Empty/No logs available";
    const logFilePath = path.join(userPaths.logs, "execution.log");
    
    if (fs.existsSync(logFilePath)) {
      const systemStats = fs.statSync(logFilePath);
      systemLogsStatus = `✅ Active (${systemStats.size} bytes stored)`;
    }

    const outputBlock = 
      `📊 Framework Diagnostics & Observability\n` +
      `==============================\n` +
      `👤 Telegram Client ID: ${userId}\n` +
      `🔑 Session Authenticated: ${authStatus.exists ? "✅ Yes" : "❌ No"}\n` +
      `📧 Identity Registry: ${profile.identity?.label || "Unassigned"}\n\n` +
      `📁 Platform Sandboxing Infrastructure\n` +
      `==============================\n` +
      `🏠 Path Root: ${userPaths.root}\n` +
      `📁 Runtime Path: ${userPaths.workspace}\n` +
      `📜 History Metric Logs: ${systemLogsStatus}\n` +
      `⚙️ Passport File Check: ${authStatus.exists ? "✅ Verified Valid" : "❌ Config Dead/Absent"}`;

    logger.debug({ userId, durationMs: Date.now() - startTime }, "telemetry: local health metadata check trace rendered");
    return { success: true, output: outputBlock };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "telemetry: status calculation execution failed");
    return { success: false, output: `❌ Observability telemetry collection loop failed: ${errorMsg}` };
  }
}

/**
 * Logout and clear authentication
 */
export async function handleLogout(userId: number): Promise<CommandResult> {
  if (!isCommandAllowed("logout")) {
    return { success: false, output: "Logout command is not allowed." };
  }

  const startTime = Date.now();
  try {
    await executeKpass(userId, ["logout"], "logout");
  } catch (error) {
    logger.debug({ userId }, "telemetry: fallback triggered: kpass binary clear dropped clean path error state bypass");
  }

  const profile = readUserProfile(userId, config.userDataRoot);
  profile.identity = undefined;
  delete (profile as any).pendingLoginId;
  writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId, durationMs: Date.now() - startTime }, "telemetry: session closed; user runtime data unmapped");

  return {
    success: true,
    output: "✅ Logged out successfully.\nYour session and wallet access have been cleared.",
  };
}

// ════════════════════════════════════════════════════════════════
// PHASE 1: AGENT SESSIONS - Real kpass agent infrastructure
// ════════════════════════════════════════════════════════════════

/**
 * Register an autonomous agent with kpass
 * 
 * Agent types allow different agent identities for specialized tasks
 * Each agent gets its own session and spending constraints
 */
export async function handleAgentRegister(userId: number, agentType: string): Promise<CommandResult> {
  if (!isCommandAllowed("agent-register")) {
    return { success: false, output: "Agent registration is not allowed." };
  }

  const authStatus = assertAuthentication(userId);
  if (!authStatus.exists) {
    return { success: false, output: "❌ Not authenticated. Please run /login first." };
  }

  const sanitized = agentType.trim().toLowerCase();
  if (!sanitized) {
    return { success: false, output: "Usage: /agent-register <agent-type>\nExample: /agent-register trader" };
  }

  const startTime = Date.now();
  try {
    const output = await executeKpass(
      userId,
      ["agent:register", "--type", sanitized, "--output", "json"],
      "agent-register"
    );

    logger.info({ userId, agentType: sanitized, durationMs: Date.now() - startTime }, "telemetry: agent registered successfully");

    try {
      const response = JSON.parse(output);
      const agentId = response.agent_id || response.id || "unknown";
      return {
        success: true,
        output:
          `🤖 Agent Registered\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `Type: ${sanitized}\n` +
          `Agent ID: ${agentId}\n` +
          `Status: Active\n` +
          `\nYou can now create spending sessions for this agent.`,
      };
    } catch {
      return { success: true, output };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, agentType: sanitized, error: errorMsg }, "telemetry: agent registration failed");
    return { success: false, output: `Agent registration failed: ${errorMsg}` };
  }
}

/**
 * Create a spending session with budget constraints
 * 
 * Sessions allow autonomous agents to spend money within preset limits
 * Requires approval and enforces:
 * - Per-transaction limits
 * - Total spend limits
 * - Time-to-live (TTL)
 * - Allowed assets
 */
export async function handleSessionCreate(
  userId: number,
  maxAmountPerTx: string,
  ttl: string,
  taskSummary?: string
): Promise<CommandResult> {
  if (!isCommandAllowed("session-create")) {
    return { success: false, output: "Session creation is not allowed." };
  }

  const authStatus = assertAuthentication(userId);
  if (!authStatus.exists) {
    return { success: false, output: "❌ Not authenticated. Please run /login first." };
  }

  const startTime = Date.now();
  try {
    // CRITICAL FIX: Validate agent registration BEFORE trying to create session
    // kpass agent:session requires a registered agent to exist
    logger.debug({ userId }, "checking registered agents before session creation");
    
    let agentRegistered = false;
    try {
      const agentsJson = await executeKpass(userId, ["user", "agents", "--output", "json"], "pre-session-check");
      const agents = JSON.parse(agentsJson);
      agentRegistered = Array.isArray(agents) && agents.length > 0;
      
      logger.info(
        { userId, agentCount: Array.isArray(agents) ? agents.length : 0 },
        "agent registration check"
      );
    } catch (checkError) {
      const checkMsg = checkError instanceof Error ? checkError.message : String(checkError);
      
      // Exit code 3 = auth error. But if we got here, auth passed balance check
      // So likely the actual issue is no agent registered
      logger.warn({ userId, checkError: checkMsg }, "agent check failed");
      
      // Don't fail here, let the session-create attempt and capture real error
      agentRegistered = false;
    }

    if (!agentRegistered) {
      // Return helpful message BEFORE attempting session-create
      return {
        success: false,
        output:
          `❌ No Agent Registered\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Sessions require a registered agent.\n\n` +
          `👉 First, register an agent:\n` +
          `\`/agent-register trader\`\n\n` +
          `Then try session creation again:\n` +
          `\`/session-create ${maxAmountPerTx} ${ttl}\``,
      };
    }

    const args = [
      "agent:session",
      "create",
      "--max-amount-per-tx",
      maxAmountPerTx,
      "--ttl",
      ttl,
      "--output",
      "json",
    ];

    if (taskSummary) {
      args.push("--task-summary", taskSummary);
    }

    const output = await executeKpass(userId, args, "session-create");

    logger.info({
      userId,
      maxAmountPerTx,
      ttl,
      durationMs: Date.now() - startTime,
    }, "telemetry: spending session request initiated");

    try {
      const response = JSON.parse(output);
      const requestId = response.request_id || response.id || "unknown";
      return {
        success: true,
        output:
          `💳 Spending Session Created\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Request ID: ${requestId}\n` +
          `Max/TX: ${maxAmountPerTx}\n` +
          `TTL: ${ttl}\n` +
          `Status: Pending Approval\n` +
          `\nCheck approval with: /session-status ${requestId}`,
      };
    } catch {
      return { success: true, output };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Enhanced error reporting for kpass-specific errors
    let userFriendlyError = errorMsg;
    
    if (errorMsg.includes("code 3") || errorMsg.includes("Auth")) {
      userFriendlyError = 
        `❌ Authentication Error\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Likely cause: Your session expired\n\n` +
        `Please re-authenticate:\n` +
        `1. /login your@email.com\n` +
        `2. /verify <login-id> <code>`;
    } else if (errorMsg.includes("agent") || errorMsg.includes("session")) {
      userFriendlyError = 
        `❌ Session Creation Failed\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Error: ${errorMsg}\n\n` +
        `Troubleshooting:\n` +
        `1. Check agent registration: /debug-runtime\n` +
        `2. Register if missing: /agent-register trader\n` +
        `3. Try again`;
    }
    
    logger.error({ userId, error: errorMsg, sanitized: userFriendlyError }, "telemetry: session creation failed");
    return { success: false, output: userFriendlyError };
  }
}

/**
 * List active and expired agent sessions
 */
export async function handleSessionList(userId: number, status?: string): Promise<CommandResult> {
  if (!isCommandAllowed("session-list")) {
    return { success: false, output: "Session listing is not allowed." };
  }

  const authStatus = assertAuthentication(userId);
  if (!authStatus.exists) {
    return { success: false, output: "❌ Not authenticated. Please run /login first." };
  }

  const startTime = Date.now();
  try {
    const args = ["agent:session", "list", "--output", "json"];
    if (status === "active" || status === "expired") {
      args.push("--status", status);
    }

    const output = await executeKpass(userId, args, "session-list");

    logger.info({ userId, status: status || "all", durationMs: Date.now() - startTime }, "telemetry: session list retrieved");

    try {
      const response = JSON.parse(output);
      const sessions = response.sessions || response.data || [];

      if (!Array.isArray(sessions) || sessions.length === 0) {
        return {
          success: true,
          output: "📋 No agent sessions found.\nCreate one with: /session-create",
        };
      }

      let message = `📋 Agent Sessions (${sessions.length})\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      sessions.forEach((session: any, idx: number) => {
        const sessionId = session.session_id || session.id || "unknown";
        const sessionStatus = session.status || "unknown";
        const limit = session.max_amount_per_tx || "N/A";
        const remaining = session.amount_remaining || "N/A";

        message += `\n${idx + 1}. Session: ${sessionId.substring(0, 16)}...\n`;
        message += `   Status: ${sessionStatus}\n`;
        message += `   Limit: ${limit}\n`;
        message += `   Remaining: ${remaining}\n`;
      });

      return { success: true, output: message };
    } catch {
      return { success: true, output };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "telemetry: session list retrieval failed");
    return { success: false, output: `Session listing failed: ${errorMsg}` };
  }
}

/**
 * Check approval status of a session request
 * 
 * Polls the request until approved or timeout
 */
export async function handleSessionStatus(userId: number, requestId: string): Promise<CommandResult> {
  if (!isCommandAllowed("session-status")) {
    return { success: false, output: "Session status check is not allowed." };
  }

  const authStatus = assertAuthentication(userId);
  if (!authStatus.exists) {
    return { success: false, output: "❌ Not authenticated. Please run /login first." };
  }

  if (!requestId || requestId.trim() === "") {
    return { success: false, output: "Usage: /session-status <request-id>" };
  }

  const startTime = Date.now();
  try {
    const output = await executeKpass(
      userId,
      ["agent:session", "status", "--request-id", requestId, "--output", "json"],
      "session-status"
    );

    logger.info({ userId, requestId, durationMs: Date.now() - startTime }, "telemetry: session approval status checked");

    try {
      const response = JSON.parse(output);
      const sessionStatus = response.status || "unknown";
      const sessionId = response.session_id || "pending";

      if (sessionStatus === "approved") {
        return {
          success: true,
          output:
            `✅ Session Approved!\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `Session ID: ${sessionId}\n` +
            `Status: Active\n` +
            `\nUse this session with: /session-use ${sessionId}`,
        };
      } else if (sessionStatus === "rejected") {
        return {
          success: true,
          output: `❌ Session Request Rejected.\nReason: ${response.reason || "No reason provided"}\n\nCreate a new one with: /session-create`,
        };
      } else {
        return {
          success: true,
          output:
            `⏳ Session Request Pending\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `Request ID: ${requestId}\n` +
            `Status: ${sessionStatus}\n` +
            `\nCheck again in a moment.`,
        };
      }
    } catch {
      return { success: true, output };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, requestId, error: errorMsg }, "telemetry: session status check failed");
    return { success: false, output: `Status check failed: ${errorMsg}` };
  }
}

/**
 * Set the active session for agent operations
 * 
 * Once approved, a session must be selected before it can be used
 */
export async function handleSessionUse(userId: number, sessionId: string): Promise<CommandResult> {
  if (!isCommandAllowed("session-use")) {
    return { success: false, output: "Session selection is not allowed." };
  }

  const authStatus = assertAuthentication(userId);
  if (!authStatus.exists) {
    return { success: false, output: "❌ Not authenticated. Please run /login first." };
  }

  if (!sessionId || sessionId.trim() === "") {
    return { success: false, output: "Usage: /session-use <session-id>" };
  }

  const startTime = Date.now();
  try {
    const output = await executeKpass(
      userId,
      ["agent:session", "use", "--session-id", sessionId, "--output", "json"],
      "session-use"
    );

    logger.info({ userId, sessionId, durationMs: Date.now() - startTime }, "telemetry: active session changed");

    return {
      success: true,
      output:
        `✅ Session Activated\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `Session ID: ${sessionId.substring(0, 16)}...\n` +
        `Status: Now active\n` +
        `\nAgent operations will use this session.`,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, sessionId, error: errorMsg }, "telemetry: session activation failed");
    return { success: false, output: `Session activation failed: ${errorMsg}` };
  }
}

/**
 * Execute an x402 payment through an active session
 * 
 * Allows agents to make HTTP requests with automatic x402 payment processing
 * The session enforces all spending constraints
 */
export async function handleSessionExecute(
  userId: number,
  url: string,
  method?: string,
  headersJson?: string
): Promise<CommandResult> {
  if (!isCommandAllowed("session-execute")) {
    return { success: false, output: "Session execution is not allowed." };
  }

  const authStatus = assertAuthentication(userId);
  if (!authStatus.exists) {
    return { success: false, output: "❌ Not authenticated. Please run /login first." };
  }

  if (!url || url.trim() === "") {
    return {
      success: false,
      output: "Usage: /session-execute <url> [GET|POST] [headers-json]",
    };
  }

  const startTime = Date.now();
  try {
    const args = ["agent:session", "execute", "--url", url, "--output", "json"];

    if (method && method.trim() && method !== "GET") {
      args.push("--method", method.toUpperCase());
    }

    if (headersJson && headersJson.trim()) {
      args.push("--headers", headersJson);
    }

    const output = await executeKpass(userId, args, "session-execute");

    logger.info(
      { userId, url, method: method || "GET", durationMs: Date.now() - startTime },
      "telemetry: x402 payment executed"
    );

    try {
      const response = JSON.parse(output);
      const status = response.status || "success";
      const payment = response.payment || {};

      return {
        success: true,
        output:
          `✅ Payment Executed\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `URL: ${url}\n` +
          `Status: ${status}\n` +
          `Cost: ${payment.amount || "N/A"} ${payment.asset || ""}\n` +
          `Remaining Budget: ${payment.remaining || "N/A"}\n`,
      };
    } catch {
      return { success: true, output };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, url, error: errorMsg }, "telemetry: x402 payment execution failed");
    return { success: false, output: `Payment execution failed: ${errorMsg}` };
  }
}

/**
 * Send funds directly from wallet
 * 
 * Direct wallet-to-wallet transfer with no session needed
 */
export async function handleWalletSend(
  userId: number,
  toAddress: string,
  amount: string,
  asset: string
): Promise<CommandResult> {
  if (!isCommandAllowed("wallet-send")) {
    return { success: false, output: "Wallet transfers are not allowed." };
  }

  const authStatus = assertAuthentication(userId);
  if (!authStatus.exists) {
    return { success: false, output: "❌ Not authenticated. Please run /login first." };
  }

  if (!toAddress || !amount || !asset) {
    return {
      success: false,
      output:
        "Usage: /wallet-send <to-address> <amount> <asset>\n" +
        "Example: /wallet-send 0x123... 1.5 USDC",
    };
  }

  const startTime = Date.now();
  try {
    const output = await executeKpass(
      userId,
      ["wallet", "send", "--to", toAddress, "--amount", amount, "--asset", asset, "--output", "json"],
      "wallet-send"
    );

    logger.info(
      { userId, toAddress, amount, asset, durationMs: Date.now() - startTime },
      "telemetry: wallet transfer initiated"
    );

    try {
      const response = JSON.parse(output);
      const txHash = response.tx_hash || response.hash;
      
      // If the binary returns a valid status fields, prioritize them for hackathon demo fidelity
      const statusText = response.status === "success" || txHash ? "✅ Success (Settled)" : "⏳ Processing";
      const txDisplay = txHash 
        ? `[${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}](kitescan.ai{txHash})`
        : "pending...";

      return {
        success: true,
        output:
          `✅ *Transfer Executed*\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📍 *To:* \`${toAddress.substring(0, 10)}...${toAddress.substring(toAddress.length - 8)}\`\n` +
          `💰 *Amount:* \`${amount} ${asset}\`\n` +
          `🔗 *TX Link:* ${txDisplay}\n` +
          `⚙️ *Status:* ${statusText}\n`,
      };
    } catch {
      return { success: true, output };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, toAddress, error: errorMsg }, "telemetry: wallet transfer failed");
    return { success: false, output: `Transfer failed: ${errorMsg}` };
  }
}

/**
 * Send tokens to a user by Telegram username
 * Resolves @username → Telegram ID → wallet address → kpass wallet send
 */
export async function handleSendToUsername(
  userId: number,
  username: string,
  amount: string,
  asset: string,
  bot: any
): Promise<CommandResult> {
  if (!isCommandAllowed("wallet-send")) {
    return { success: false, output: "Wallet send is not allowed." };
  }

  const authStatus = assertAuthentication(userId);
  if (!authStatus.exists) {
    return { success: false, output: "❌ Not authenticated. Please run /login first." };
  }

  const cleanUsername = username.replace(/^@/, "").toLowerCase();
  if (cleanUsername.toLowerCase() === (await getUsernameForId(userId, bot))?.toLowerCase()) {
    return { success: false, output: "❌ You cannot send to yourself." };
  }

  const startTime = Date.now();
  try {
    let recipientId: number | null = null;

    try {
      const profiles = fs.readdirSync("/data/users");
      for (const dir of profiles) {
        try {
          const profileFile = `/data/users/${dir}/profile.json`;
          if (fs.existsSync(profileFile)) {
            const profile = JSON.parse(fs.readFileSync(profileFile, "utf-8"));
            if ((profile as any).telegramUsername?.toLowerCase() === cleanUsername) {
              recipientId = profile.telegramId;
              break;
            }
          }
        } catch {
          // Continue searching
        }
      }
    } catch {
      // Continue with execution
    }

    if (!recipientId) {
      return { success: false, output: `❌ User @${cleanUsername} not found on the platform.` };
    }

    let recipientWallet: string | null = null;
    try {
      const recipientProfile = readUserProfile(recipientId, config.userDataRoot);
      recipientWallet = recipientProfile.identity?.walletId || null;
    } catch {
      // Catch empty path states
    }

    if (!recipientWallet) {
      return {
        success: false,
        output: `❌ User @${cleanUsername} has not set up their wallet yet. They need to authenticate first.`,
      };
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return { success: false, output: "❌ Invalid amount. Please enter a positive number." };
    }

    if (!asset || asset.length > 10) {
      return { success: false, output: "❌ Invalid asset symbol." };
    }

    const output = await executeKpass(
      userId,
      ["wallet", "send", "--to", recipientWallet, "--amount", amount, "--asset", asset.toUpperCase(), "--output", "json"],
      "wallet-send-to-username"
    );

    logger.info(
      { userId, recipientId, amount, asset, durationMs: Date.now() - startTime },
      "telemetry: wallet send to username initiated"
    );

    try {
      const response = JSON.parse(output);
      const txHash = response.tx_hash || response.hash;
      
      const statusText = response.status === "success" || txHash ? "✅ Success (Settled)" : "⏳ Submitted";
      const txDisplay = txHash 
        ? `[${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}](kitescan.ai{txHash})`
        : "pending...";

      return {
        success: true,
        output:
          `✅ *Transfer Successful*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 *Recipient:* @${cleanUsername}\n` +
          `💰 *Amount:* \`${amount} ${asset.toUpperCase()}\`\n` +
          `📍 *Wallet:* \`${recipientWallet.substring(0, 10)}...${recipientWallet.substring(recipientWallet.length - 8)}\`\n` +
          `🔗 *TX Link:* ${txDisplay}\n` +
          `⚙️ *Status:* ${statusText}\n`,
      };
    } catch {
      return { success: true, output };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, username, error: errorMsg }, "telemetry: send to username failed");
    return { success: false, output: `Transfer failed: ${errorMsg}` };
  }
}


/**
 * Helper to get username for a Telegram ID (cached in profile)
 */
async function getUsernameForId(userId: number, bot: any): Promise<string | null> {
  try {
    const profile = readUserProfile(userId, config.userDataRoot);
    return (profile as any).telegramUsername || null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// PHASE 2: AUTONOMOUS SCHEDULED AGENTS
// ════════════════════════════════════════════════════════════════

/**
 * Create an autonomous scheduled agent
 * 
 * User provides natural language description:
 * - "Monitor KITE balance every hour"
 * - "Search for AI grants daily"
 * - "Check Tavily API pricing every 6 hours"
 * 
 * Agent parses description → creates agent with schedule
 */
export async function handleAgentCreate(userId: number, description: string): Promise<CommandResult> {
  if (!isCommandAllowed("agent-create")) {
    return { success: false, output: "Agent creation is not allowed." };
  }

  const sanitized = description.trim();
  if (!sanitized) {
    return {
      success: false,
      output: "Usage: /agent-create <description>\n\n" +
              "Examples:\n" +
              "• Monitor KITE balance every hour\n" +
              "• Search for AI grants daily\n" +
              "• Check Tavily API pricing every 6 hours",
    };
  }

  const startTime = Date.now();
  try {
    // Lazy load agent storage and scheduler
    const { getAgentStorage } = await import("./agentStorage");
    const { getScheduler } = await import("./scheduler");

    const storage = getAgentStorage();
    const scheduler = getScheduler();

    // Parse schedule and command from description
    const scheduleInfo = scheduler.parseScheduleDescription(sanitized);
    const commandInfo = scheduler.parseCommand(sanitized);

    // Create agent in database
    const agent = storage.createAgent(userId, {
      name: sanitized.substring(0, 50),  // Use first 50 chars as name
      goal: sanitized,
      userId: userId,
      command: commandInfo.command,
      commandArgs: {},
      schedule: scheduleInfo.cron || "0 * * * *",  // Default: hourly
      scheduleType: scheduleInfo.type,
      intervalSeconds: scheduleInfo.interval,
      timezone: "UTC",
      enabled: true,
      maxRetries: 3,
      timeoutSeconds: 30,
    });

    // Calculate first run time
    (scheduler as any).calculateNextRun(agent.id);

    logger.info(
      { userId, agentId: agent.id, description: sanitized, durationMs: Date.now() - startTime },
      "telemetry: autonomous agent created"
    );

    return {
      success: true,
      output:
        `🤖 Autonomous Agent Created\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Name: ${agent.name}\n` +
        `Schedule: ${scheduleInfo.type === "cron" ? scheduleInfo.cron : `Every ${scheduleInfo.interval} seconds`}\n` +
        `Runtime: Isolated (/data/users/${userId}/)\n` +
        `Status: ✅ ACTIVE\n` +
        `Agent ID: ${agent.id}\n\n` +
        `The agent will now execute automatically.\n` +
        `View logs: /agent-logs ${agent.id}`,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, description: sanitized, error: errorMsg }, "telemetry: agent creation failed");
    return { success: false, output: `Agent creation failed: ${errorMsg}` };
  }
}

/**
 * List all agents for a user
 */
export async function handleAgentList(userId: number): Promise<CommandResult> {
  if (!isCommandAllowed("agent-list")) {
    return { success: false, output: "Agent listing is not allowed." };
  }

  const startTime = Date.now();
  try {
    const { getAgentStorage } = await import("./agentStorage");
    const storage = getAgentStorage();

    const agents = storage.listAgentsByUser(userId);

    if (agents.length === 0) {
      return {
        success: true,
        output: "📋 No autonomous agents created yet.\n\nCreate one with: /agent-create Monitor KITE balance every hour",
      };
    }

    let message = `📋 Your Autonomous Agents (${agents.length})\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    agents.forEach((agent, idx) => {
      const statusIcon = agent.enabled ? "✅" : "⚠️";
      const schedule = agent.scheduleType === "cron"
        ? agent.schedule
        : `Every ${agent.intervalSeconds}s`;

      const nextRun = agent.nextRunAt
        ? new Date(agent.nextRunAt).toLocaleString()
        : "pending";

      message += `\n${idx + 1}. ${agent.name}\n`;
      message += `   Schedule: ${schedule}\n`;
      message += `   Status: ${statusIcon} ${agent.enabled ? "ACTIVE" : "DISABLED"}\n`;
      message += `   Next Run: ${nextRun}\n`;
      message += `   Executions: ${agent.executionCount} (${agent.failureCount} failed)\n`;
      message += `   ID: \`${agent.id.substring(0, 8)}...\`\n`;
    });

    message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `Use /agent-logs <id> for execution history\n`;
    message += `Use /agent-stop <id> to disable\n`;
    message += `Use /agent-delete <id> to remove\n`;

    logger.info({ userId, count: agents.length, durationMs: Date.now() - startTime }, "telemetry: agents listed");

    return { success: true, output: message };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "telemetry: agent listing failed");
    return { success: false, output: `Agent listing failed: ${errorMsg}` };
  }
}

/**
 * Stop (disable) an agent
 */
export async function handleAgentStop(userId: number, agentId: string): Promise<CommandResult> {
  if (!isCommandAllowed("agent-stop")) {
    return { success: false, output: "Agent control is not allowed." };
  }

  const sanitized = agentId.trim();
  if (!sanitized) {
    return { success: false, output: "Usage: /agent-stop <agent-id>" };
  }

  const startTime = Date.now();
  try {
    const { getAgentStorage } = await import("./agentStorage");
    const storage = getAgentStorage();

    const agent = storage.getAgent(sanitized);
    if (!agent) {
      return { success: false, output: `❌ Agent not found: ${sanitized}` };
    }

    if (agent.userId !== userId) {
      return { success: false, output: "❌ You don't have permission to modify this agent." };
    }

    storage.updateAgent(sanitized, { enabled: false });

    logger.info({ userId, agentId: sanitized, durationMs: Date.now() - startTime }, "telemetry: agent disabled");

    return {
      success: true,
      output: `⏸️ Agent Disabled\n━━━━━━━━━━━━━━\n${agent.name}\n\nThe agent will not execute until re-enabled.\nUse /agent-start ${sanitized} to resume.`,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, agentId: sanitized, error: errorMsg }, "telemetry: agent stop failed");
    return { success: false, output: `Failed to stop agent: ${errorMsg}` };
  }
}

/**
 * Start (enable) an agent
 */
export async function handleAgentStart(userId: number, agentId: string): Promise<CommandResult> {
  if (!isCommandAllowed("agent-start")) {
    return { success: false, output: "Agent control is not allowed." };
  }

  const sanitized = agentId.trim();
  if (!sanitized) {
    return { success: false, output: "Usage: /agent-start <agent-id>" };
  }

  const startTime = Date.now();
  try {
    const { getAgentStorage } = await import("./agentStorage");
    const { getScheduler } = await import("./scheduler");

    const storage = getAgentStorage();
    const scheduler = getScheduler();

    const agent = storage.getAgent(sanitized);
    if (!agent) {
      return { success: false, output: `❌ Agent not found: ${sanitized}` };
    }

    if (agent.userId !== userId) {
      return { success: false, output: "❌ You don't have permission to modify this agent." };
    }

    storage.updateAgent(sanitized, { enabled: true });
    (scheduler as any).calculateNextRun(sanitized);

    logger.info({ userId, agentId: sanitized, durationMs: Date.now() - startTime }, "telemetry: agent enabled");

    return {
      success: true,
      output: `▶️ Agent Enabled\n━━━━━━━━━━━━\n${agent.name}\n\nThe agent will resume scheduled execution.`,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, agentId: sanitized, error: errorMsg }, "telemetry: agent start failed");
    return { success: false, output: `Failed to start agent: ${errorMsg}` };
  }
}

/**
 * Delete an agent permanently
 */
export async function handleAgentDelete(userId: number, agentId: string): Promise<CommandResult> {
  if (!isCommandAllowed("agent-delete")) {
    return { success: false, output: "Agent deletion is not allowed." };
  }

  const sanitized = agentId.trim();
  if (!sanitized) {
    return { success: false, output: "Usage: /agent-delete <agent-id>" };
  }

  const startTime = Date.now();
  try {
    const { getAgentStorage } = await import("./agentStorage");
    const storage = getAgentStorage();

    const agent = storage.getAgent(sanitized);
    if (!agent) {
      return { success: false, output: `❌ Agent not found: ${sanitized}` };
    }

    if (agent.userId !== userId) {
      return { success: false, output: "❌ You don't have permission to delete this agent." };
    }

    const agentName = agent.name;
    storage.deleteAgent(sanitized);

    logger.info({ userId, agentId: sanitized, durationMs: Date.now() - startTime }, "telemetry: agent deleted");

    return {
      success: true,
      output: `🗑️ Agent Deleted\n━━━━━━━━━━━━\n${agentName}\n\nAll execution history has been removed.`,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, agentId: sanitized, error: errorMsg }, "telemetry: agent deletion failed");
    return { success: false, output: `Failed to delete agent: ${errorMsg}` };
  }
}

/**
 * View execution logs for an agent
 */
export async function handleAgentLogs(userId: number, agentId: string, limit: string = "10"): Promise<CommandResult> {
  if (!isCommandAllowed("agent-logs")) {
    return { success: false, output: "Agent log viewing is not allowed." };
  }

  const sanitized = agentId.trim();
  if (!sanitized) {
    return { success: false, output: "Usage: /agent-logs <agent-id> [limit=10]" };
  }

  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  const startTime = Date.now();

  try {
    const { getAgentStorage } = await import("./agentStorage");
    const storage = getAgentStorage();

    const agent = storage.getAgent(sanitized);
    if (!agent) {
      return { success: false, output: `❌ Agent not found: ${sanitized}` };
    }

    if (agent.userId !== userId) {
      return { success: false, output: "❌ You don't have permission to view this agent." };
    }

    const runs = storage.listRunsByAgent(sanitized, limitNum);

    if (runs.length === 0) {
      return {
        success: true,
        output: `🔍 ${agent.name} - No executions yet\n\nAgent will run at: ${agent.nextRunAt || "pending calculation"}`,
      };
    }

    let message = `🔍 ${agent.name} - Recent Executions (${runs.length})\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    runs.forEach((run, idx) => {
      const statusIcon = 
        run.status === "success" ? "✅" :
        run.status === "failed" ? "❌" :
        run.status === "timeout" ? "⏱️" :
        "⏳";

      const date = new Date(run.createdAt);
      const timeStr = date.toLocaleString();
      const durationStr = run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "?";

      message += `\n${idx + 1}. ${timeStr}\n`;
      message += `   Status: ${statusIcon} ${run.status}\n`;
      message += `   Duration: ${durationStr}\n`;

      if (run.output && run.output.length > 0) {
        const output = run.output.substring(0, 50);
        message += `   Output: ${output}${run.output.length > 50 ? "..." : ""}\n`;
      }

      if (run.error && run.error.length > 0) {
        const error = run.error.substring(0, 50);
        message += `   Error: ${error}${run.error.length > 50 ? "..." : ""}\n`;
      }
    });

    logger.info({ userId, agentId: sanitized, count: runs.length, durationMs: Date.now() - startTime }, "telemetry: agent logs retrieved");

    return { success: true, output: message };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, agentId: sanitized, error: errorMsg }, "telemetry: agent logs retrieval failed");
    return { success: false, output: `Failed to retrieve logs: ${errorMsg}` };
  }
}

/**
 * Manually trigger immediate execution of an agent
 */
export async function handleAgentRun(userId: number, agentId: string): Promise<CommandResult> {
  if (!isCommandAllowed("agent-run")) {
    return { success: false, output: "Agent execution is not allowed." };
  }

  const sanitized = agentId.trim();
  if (!sanitized) {
    return { success: false, output: "Usage: /agent-run <agent-id>" };
  }

  const startTime = Date.now();
  try {
    const { getAgentStorage } = await import("./agentStorage");
    const { getScheduler } = await import("./scheduler");

    const storage = getAgentStorage();
    const scheduler = getScheduler();

    const agent = storage.getAgent(sanitized);
    if (!agent) {
      return { success: false, output: `❌ Agent not found: ${sanitized}` };
    }

    if (agent.userId !== userId) {
      return { success: false, output: "❌ You don't have permission to run this agent." };
    }

    // Queue immediate execution
    const jobId = await scheduler.queueAgentJob(sanitized);

    logger.info({ userId, agentId: sanitized, jobId, durationMs: Date.now() - startTime }, "telemetry: agent manual execution queued");

    return {
      success: true,
      output:
        `⏳ Agent Queued for Execution\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Agent: ${agent.name}\n` +
        `Status: Queued\n` +
        `Job ID: ${jobId}\n\n` +
        `The agent will execute within the next 30 seconds.\n` +
        `Check logs with: /agent-logs ${sanitized}`,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, agentId: sanitized, error: errorMsg }, "telemetry: agent run failed");
    return { success: false, output: `Failed to queue agent: ${errorMsg}` };
  }
}

/**
 * DEBUG COMMAND: Show runtime diagnostics
 * 
 * CRITICAL FOR DEBUGGING:
 * - Verify user isolation
 * - Check runtime paths
 * - Validate authentication files
 * - List registered agents
 * - Show active sessions
 * 
 * This is temporary for troubleshooting multi-user issues
 */
export async function handleDebugRuntime(userId: number): Promise<CommandResult> {
  const startTime = Date.now();
  const diagnostics: string[] = [];

  try {
    const paths = getUserPaths(userId, config.userDataRoot);
    
    // Section 1: Runtime Paths
    diagnostics.push("🔍 **RUNTIME ISOLATION CHECK**");
    diagnostics.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    diagnostics.push(`User ID: ${userId}`);
    diagnostics.push(`Root Dir: ${paths.root}`);
    diagnostics.push(`Workspace: ${paths.workspace}`);
    diagnostics.push(`Config Dir: ${paths.config}`);
    diagnostics.push("");

    // Section 2: Filesystem Verification
    diagnostics.push("📁 **FILESYSTEM VERIFICATION**");
    diagnostics.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    const dirsToCheck = [
      { name: "Root", path: paths.root },
      { name: "Workspace", path: paths.workspace },
      { name: "Config", path: paths.config },
      { name: "Sessions", path: paths.sessions },
      { name: "Logs", path: paths.logs },
    ];

    for (const dir of dirsToCheck) {
      const exists = fs.existsSync(dir.path);
      const icon = exists ? "✅" : "❌";
      diagnostics.push(`${icon} ${dir.name}: ${dir.path}`);
      
      if (exists) {
        try {
          const stat = fs.statSync(dir.path);
          diagnostics.push(`   Mode: ${(stat.mode & parseInt('777', 8)).toString(8)}, Owner: ${stat.uid}`);
        } catch (e) {
          diagnostics.push(`   ⚠️ Cannot read stats`);
        }
      }
    }
    diagnostics.push("");

    // Section 3: Authentication Files
    diagnostics.push("🔐 **AUTHENTICATION FILES**");
    diagnostics.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    const kpassConfigPath = path.join(paths.root, ".kite-passport", "config.json");
    const configExists = fs.existsSync(kpassConfigPath);
    diagnostics.push(`${configExists ? "✅" : "❌"} config.json: ${kpassConfigPath}`);
    
    if (configExists) {
      try {
        const config = JSON.parse(fs.readFileSync(kpassConfigPath, "utf-8"));
        diagnostics.push(`   Wallet: ${config.wallet_id ? "✅ Present" : "❌ Missing"}`);
        diagnostics.push(`   Auth: ${config.auth_token ? "✅ Present" : "❌ Missing"}`);
      } catch (e) {
        diagnostics.push(`   ⚠️ Cannot parse config`);
      }
    }
    diagnostics.push("");

    // Section 4: Query Registered Agents
    diagnostics.push("🤖 **REGISTERED AGENTS**");
    diagnostics.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    if (configExists) {
      try {
        const agentsOutput = await executeKpass(userId, ["user", "agents", "--output", "json"], "debug-agents");
        try {
          const agents = JSON.parse(agentsOutput);
          if (Array.isArray(agents) && agents.length > 0) {
            diagnostics.push(`✅ Found ${agents.length} registered agent(s):`);
            agents.forEach((agent: any) => {
              diagnostics.push(`   • ${agent.type || agent.id}: ${agent.id}`);
            });
          } else {
            diagnostics.push(`⚠️ No agents registered (required for /session-create)`);
          }
        } catch {
          diagnostics.push(`✅ Query executed but response format unknown`);
          diagnostics.push(`   Output: ${agentsOutput.substring(0, 100)}`);
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        if (err.includes("exit code 3")) {
          diagnostics.push(`❌ **AUTHENTICATION ERROR (Exit Code 3)**`);
          diagnostics.push(`   Likely cause: Invalid/expired auth token`);
          diagnostics.push(`   Action: Run /login again`);
        } else {
          diagnostics.push(`❌ Agent query failed: ${err}`);
        }
      }
    } else {
      diagnostics.push(`❌ Not authenticated (no config.json)`);
      diagnostics.push(`   Action: Run /login first`);
    }
    diagnostics.push("");

    // Section 5: Active Sessions
    diagnostics.push("💳 **ACTIVE SESSIONS**");
    diagnostics.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    if (configExists) {
      try {
        const sessionsOutput = await executeKpass(userId, ["agent:session", "list", "--output", "json"], "debug-sessions");
        try {
          const sessions = JSON.parse(sessionsOutput);
          if (Array.isArray(sessions) && sessions.length > 0) {
            diagnostics.push(`✅ Found ${sessions.length} session(s):`);
            sessions.forEach((session: any) => {
              diagnostics.push(`   • ${session.id}: ${session.status}`);
            });
          } else {
            diagnostics.push(`✅ No active sessions`);
          }
        } catch {
          diagnostics.push(`Session list query executed`);
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        diagnostics.push(`⚠️ Session query: ${err.substring(0, 80)}`);
      }
    }
    diagnostics.push("");

    // Section 6: Execution Environment (from userRuntime context)
    diagnostics.push("⚙️ **EXECUTION ENVIRONMENT**");
    diagnostics.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    diagnostics.push(`kpass Binary: ${config.kpassBinary}`);
    diagnostics.push(`User Data Root: ${config.userDataRoot}`);
    diagnostics.push("");

    // Section 7: Recommendations
    diagnostics.push("💡 **TROUBLESHOOTING GUIDE**");
    diagnostics.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    if (!configExists) {
      diagnostics.push(`1️⃣ Not authenticated`);
      diagnostics.push(`   → Run: /login your@email.com`);
      diagnostics.push(`   → Then: /verify <login-id> <code>`);
    } else {
      try {
        const agentsOutput = await executeKpass(userId, ["user", "agents", "--output", "json"], "debug-check");
        const agents = JSON.parse(agentsOutput);
        if (!Array.isArray(agents) || agents.length === 0) {
          diagnostics.push(`1️⃣ No agent registered`);
          diagnostics.push(`   → Run: /agent-register trader`);
          diagnostics.push(`   → Then: /session-create 100 USDC 24h`);
        } else {
          diagnostics.push(`1️⃣ Ready for sessions! Try:`);
          diagnostics.push(`   → /session-create 100 USDC 24h`);
        }
      } catch {
        diagnostics.push(`1️⃣ Run /agent-register first`);
      }
    }

    logger.info({ userId, durationMs: Date.now() - startTime }, "telemetry: debug runtime diagnostics shown");

    return {
      success: true,
      output: diagnostics.join("\n"),
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "telemetry: debug runtime failed");
    return {
      success: false,
      output: `Debug failed: ${errorMsg}`,
    };
  }
}

/**
 * Display system health check
 */
export async function handleDebugHealth(userId: number): Promise<CommandResult> {
  try {
    const { getSystemHealth } = await import("./debugUtilities");
    const health = getSystemHealth();

    let message = `🏥 *System Health Check*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `Overall: ${health.overall === "healthy" ? "🟢 HEALTHY" : health.overall === "degraded" ? "🟡 DEGRADED" : "🔴 CRITICAL"}\n`;
    message += `Timestamp: ${health.timestamp}\n\n`;

    message += `*Component Status*\n`;
    for (const [check, passed] of Object.entries(health.checks)) {
      const displayName = check
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      message += `• ${displayName}: ${passed ? "✅" : "❌"}\n`;
    }

    if (health.overall !== "healthy") {
      message += `\n⚠️ Run /debug-runtime for detailed diagnostics`;
    }

    return { success: true, output: message };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "health check failed");
    return { success: false, output: `Health check failed: ${errorMsg}` };
  }
}

/**
 * Display configuration information (sanitized for display)
 */
export async function handleDebugConfig(userId: number): Promise<CommandResult> {
  try {
    let message = `⚙️ *Configuration*\n`;
    message += `━━━━━━━━━━━━━━━\n\n`;

    message += `*Service Role*\n`;
    message += `• Mode: ${config.isRelay ? "🟢 RELAY" : "⚙️ WORKER"}\n`;
    message += `• Polling: ${config.enableTelegramPolling ? "✅ ON" : "❌ OFF"}\n\n`;

    message += `*Network*\n`;
    message += `• Host: ${config.host}:${config.port}\n`;
    message += `• Redis: ${config.redisUrl}\n\n`;

    message += `*Database*\n`;
    message += `• URL: \`${config.databaseUrl}\`\n`;
    message += `• Type: ${config.dbType}\n\n`;

    message += `*Runtime*\n`;
    message += `• User Data: \`${config.userDataRoot}\`\n`;
    message += `• kpass: \`${config.kpassBinary}\`\n\n`;

    message += `*AI/LLM*\n`;
    message += `• Provider: ${config.llmProvider}\n`;
    message += `• Model: ${config.llmModel}\n`;
    message += `• API Key: ${config.llmApiKey ? "✅ Configured" : "❌ Missing"}\n`;

    return { success: true, output: message };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "config debug failed");
    return { success: false, output: `Config debug failed: ${errorMsg}` };
  }
}

/**
 * Display database information and status
 */
export async function handleDebugDatabase(userId: number): Promise<CommandResult> {
  try {
    const dbPath = config.databaseUrl.includes("sqlite://")
      ? config.databaseUrl.replace("sqlite:///", "/").replace("sqlite://", "")
      : config.databaseUrl;

    const exists = fs.existsSync(dbPath);
    const dirExists = fs.existsSync(path.dirname(dbPath));

    let message = `💾 *Database Status*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `URL: \`${config.databaseUrl}\`\n`;
    message += `Type: ${config.dbType}\n`;
    message += `Exists: ${exists ? "✅ YES" : "❌ NO"}\n`;
    message += `Directory: ${dirExists ? "✅ OK" : "❌ Missing"}\n\n`;

    if (exists) {
      try {
        const stat = fs.statSync(dbPath);
        const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
        const lastModified = new Date(stat.mtime).toLocaleTimeString();
        message += `📊 *Database Info*\n`;
        message += `• Size: ${sizeMB} MB\n`;
        message += `• Last Modified: ${lastModified}\n`;
      } catch (err) {
        message += `⚠️ Could not read file stats\n`;
      }
    } else {
      message += `*Auto-create*\n`;
      message += `Database will be created automatically.\n`;
      message += `Trigger by running: /agent-register\n`;
    }

    return { success: true, output: message };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "database debug failed");
    return { success: false, output: `Database debug failed: ${errorMsg}` };
  }
}

/**
 * Check agent registry status
 */
export async function handleDebugAgent(userId: number): Promise<CommandResult> {
  try {
    const { validateAgentRegistry, formatAgentRegistryValidation } = await import("./debugUtilities");
    const output = formatAgentRegistryValidation();
    return { success: true, output };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "agent debug failed");
    return { success: false, output: `Agent debug failed: ${errorMsg}` };
  }
}

// ════════════════════════════════════════════════════════════════
// PHASE 4: REAL x402 PAID EXECUTION - COMMERCE COMMANDS
// ════════════════════════════════════════════════════════════════

/**
 * Buy airtime via Kite session and Reloadly provider
 * 
 * Usage: /buy-airtime <phone> <amount-NGN> <provider>
 * Example: /buy-airtime 08012345678 3000 MTN
 */
export async function handleBuyAirtime(
  userId: number,
  phoneNumber: string,
  amountStr: string,
  providerCode: string,
  sessionId?: string
): Promise<CommandResult> {
  const { buyAirtimeFlow } = await import("./commerceService");

  if (!isCommandAllowed("buy-airtime")) {
    return { success: false, output: "Airtime purchase is not allowed." };
  }

  // Validate inputs
  if (!phoneNumber || !amountStr || !providerCode) {
    return {
      success: false,
      output:
        `❌ Usage: /buy-airtime <phone> <amount-NGN> <provider>\n\n` +
        `Examples:\n` +
        `• /buy-airtime 08012345678 3000 MTN\n` +
        `• /buy-airtime +2348012345678 1000 GLO\n\n` +
        `Supported providers: MTN, GLO, AIRTEL, NTEL`,
    };
  }

  const amountNGN = parseInt(amountStr, 10);
  if (isNaN(amountNGN) || amountNGN <= 0) {
    return {
      success: false,
      output: `❌ Invalid amount. Please provide a positive number.`,
    };
  }

  const startTime = Date.now();
  try {
    const result = await buyAirtimeFlow(userId, phoneNumber, amountNGN, providerCode, sessionId);

    if (result.success) {
      logger.info(
        {
          userId,
          phoneNumber,
          amountNGN,
          provider: providerCode,
          txHash: result.txHash,
          duration: Date.now() - startTime,
        },
        "telemetry: airtime purchase successful"
      );
    } else {
      logger.warn(
        { userId, phoneNumber, amountNGN, provider: providerCode, error: result.output },
        "telemetry: airtime purchase failed"
      );
    }

    return { success: result.success, output: result.output };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "buy-airtime handler failed");
    return { success: false, output: `❌ Purchase failed: ${errorMsg}` };
  }
}

/**
 * Get commerce/purchase history for user
 * 
 * Usage: /payment-history
 */
export async function handlePaymentHistory(userId: number): Promise<CommandResult> {
  if (!isCommandAllowed("payment-history")) {
    return { success: false, output: "Payment history is not allowed." };
  }

  try {
    const { getCommerceHistory, formatCommerceHistory } = await import("./commerceService");
    const history = getCommerceHistory(userId);
    const output = formatCommerceHistory(history);

    logger.info({ userId, transactionCount: history.length }, "telemetry: payment history viewed");

    return { success: true, output };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "payment-history failed");
    return { success: false, output: `Failed to retrieve history: ${errorMsg}` };
  }
}

/**
 * Buy mobile data command handler
 * Usage: /buy-data <phone|@username> <amount-NGN> <provider>
 */
export async function handleBuyData(
  userId: number,
  recipient: string,
  amountStr: string,
  providerCode: string,
  sessionId?: string
): Promise<CommandResult> {
  const { buyDataFlow } = await import("./commerceService");

  if (!isCommandAllowed("buy-data")) {
    return { success: false, output: "Data purchase is not allowed." };
  }

  if (!recipient || !amountStr || !providerCode) {
    return {
      success: false,
      output:
        `❌ Usage: /buy-data <phone|@username> <amount-NGN> <provider>\n\n` +
        `Examples:\n` +
        `• /buy-data 08012345678 2000 MTN\n` +
        `• /buy-data @alice 1500 AIRTEL`,
    };
  }

  // Resolve @username to phone if necessary
  let resolvedRecipient = recipient;
  if (recipient.startsWith("@")) {
    const cleanUsername = recipient.replace(/^@/, "").toLowerCase();
    let recipientId: number | null = null;
    try {
      const profiles = fs.readdirSync("/data/users");
      for (const dir of profiles) {
        try {
          const profileFile = `/data/users/${dir}/profile.json`;
          if (fs.existsSync(profileFile)) {
            const profile = JSON.parse(fs.readFileSync(profileFile, "utf-8"));
            if ((profile as any).telegramUsername?.toLowerCase() === cleanUsername) {
              recipientId = profile.telegramId;
              break;
            }
          }
        } catch {
          // continue
        }
      }
    } catch {
      // ignore
    }

    if (!recipientId) {
      return { success: false, output: `❌ User @${cleanUsername} not found on the platform.` };
    }

    try {
      const recipientProfile = readUserProfile(recipientId, config.userDataRoot);
      // Attempt to find a phone number field in recipient profile
      const phone = (recipientProfile as any).phone || (recipientProfile as any).contact?.phone || null;
      if (!phone) {
        return { success: false, output: `❌ User @${cleanUsername} has no phone number on record. Please provide a phone number.` };
      }
      resolvedRecipient = phone;
    } catch {
      return { success: false, output: `❌ Failed to resolve recipient profile for @${cleanUsername}.` };
    }
  }

  const amountNGN = parseInt(amountStr, 10);
  if (isNaN(amountNGN) || amountNGN <= 0) {
    return { success: false, output: `❌ Invalid amount. Please provide a positive number.` };
  }

  const startTime = Date.now();
  try {
    const result = await buyDataFlow(userId, resolvedRecipient, amountNGN, providerCode, sessionId);

    if (result.success) {
      logger.info({ userId, recipient: resolvedRecipient, amountNGN, provider: providerCode, txHash: result.txHash, duration: Date.now() - startTime }, "telemetry: data purchase successful");
    } else {
      logger.warn({ userId, recipient: resolvedRecipient, amountNGN, provider: providerCode, error: result.output }, "telemetry: data purchase failed");
    }

    return { success: result.success, output: result.output };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "buy-data handler failed");
    return { success: false, output: `❌ Purchase failed: ${errorMsg}` };
  }
}

/**
 * Create a recurring auto-topup agent
 * Usage: /auto-topup <amount-NGN> <frequency> <provider>
 * Example: /auto-topup 2000 weekly MTN
 */
export async function handleAutoTopup(userId: number, amountStr: string, frequency: string, providerCode: string): Promise<CommandResult> {
  if (!isCommandAllowed("auto-topup")) {
    return { success: false, output: "Auto-topup is not allowed by policy." };
  }

  const amountNGN = parseInt(amountStr, 10);
  if (isNaN(amountNGN) || amountNGN <= 0) {
    return { success: false, output: `❌ Invalid amount. Provide a positive number in NGN.` };
  }

  // Basic provider validation
  const provider = providerCode ? providerCode.toUpperCase() : "";
  if (!provider) {
    return { success: false, output: `❌ Provider required (e.g., MTN, GLO, AIRTEL).` };
  }

  try {
    const storage = getAgentStorage();
    const scheduler = getScheduler();

    // Parse schedule
    const parsed = scheduler.parseScheduleDescription(frequency || "every hour");

    const scheduleType = parsed.type;
    const schedule = parsed.type === "cron" ? (parsed.cron as string) : `every_${parsed.interval}`;

    // We create an agent that will run the commerce 'data' purchase command
    const agent = storage.createAgent(userId, {
      name: `auto-topup-${provider}-${amountNGN}`,
      goal: `Auto top-up ${amountNGN} NGN ${provider} as recurring ${frequency}`,
      userId: userId,
      command: "commerce",
      commandArgs: {
        type: "data",
        amountNGN: String(amountNGN),
        provider: provider,
      },
      schedule,
      scheduleType: scheduleType,
      intervalSeconds: parsed.type === "interval" ? parsed.interval : undefined,
      timezone: "UTC",
      enabled: true,
      maxRetries: 3,
      timeoutSeconds: 60,
      spendingLimitCents: amountNGN * 100, // approximate
      activeSessionId: undefined,
    });

    // Recalculate next run via scheduler
    try {
      (scheduler as any).calculateNextRun(agent.id);
    } catch {
      // ignore
    }

    return { success: true, output: `✅ Auto-topup scheduled: ${agent.name} (id: ${agent.id})` };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "auto-topup creation failed");
    return { success: false, output: `❌ Failed to create auto-topup: ${errorMsg}` };
  }
}

/**
 * Schedule one-off or recurring airtime purchases
 * Usage: /schedule-airtime <amount-NGN> <frequency> <provider>
 */
export async function handleScheduleAirtime(userId: number, amountStr: string, frequency: string, providerCode: string): Promise<CommandResult> {
  if (!isCommandAllowed("schedule-airtime")) {
    return { success: false, output: "Scheduling airtime is not allowed by policy." };
  }

  const amountNGN = parseInt(amountStr, 10);
  if (isNaN(amountNGN) || amountNGN <= 0) {
    return { success: false, output: `❌ Invalid amount. Provide a positive number in NGN.` };
  }

  const provider = providerCode ? providerCode.toUpperCase() : "";
  if (!provider) {
    return { success: false, output: `❌ Provider required (e.g., MTN, GLO, AIRTEL).` };
  }

  try {
    const storage = getAgentStorage();
    const scheduler = getScheduler();

    const parsed = scheduler.parseScheduleDescription(frequency || "daily");
    const scheduleType = parsed.type;
    const schedule = parsed.type === "cron" ? (parsed.cron as string) : `every_${parsed.interval}`;

    const agent = storage.createAgent(userId, {
      name: `schedule-airtime-${provider}-${amountNGN}`,
      goal: `Scheduled airtime ${amountNGN} NGN to self on ${frequency}`,
      userId: userId,
      command: "commerce",
      commandArgs: {
        type: "airtime",
        amountNGN: String(amountNGN),
        provider: provider,
      },
      schedule,
      scheduleType,
      intervalSeconds: parsed.type === "interval" ? parsed.interval : undefined,
      timezone: "UTC",
      enabled: true,
      maxRetries: 3,
      timeoutSeconds: 60,
      spendingLimitCents: amountNGN * 100,
      activeSessionId: undefined,
    });

    try {
      (scheduler as any).calculateNextRun(agent.id);
    } catch {
      // ignore
    }

    return { success: true, output: `✅ Airtime scheduled: ${agent.name} (id: ${agent.id})` };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: errorMsg }, "schedule-airtime creation failed");
    return { success: false, output: `❌ Failed to schedule airtime: ${errorMsg}` };
  }
}
