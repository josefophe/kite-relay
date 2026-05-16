import TelegramBot from "node-telegram-bot-api";
import { Message } from "node-telegram-bot-api";
import { logger } from "./logger";
import {
  handleLoginInit,
  handleVerify,
  handleLogout,
  handleBalance,
  handleSearch,
  handleTelemetryStatus,
  handleAgentRegister,
  handleSessionCreate,
  handleSessionList,
  handleSessionStatus,
  handleSessionUse,
  handleSessionExecute,
  handleWalletSend,
  handleSendToUsername,
  handleAgentCreate,
  handleAgentList,
  handleAgentStop,
  handleAgentStart,
  handleAgentDelete,
  handleAgentLogs,
  handleAgentRun,
  handleDebugRuntime,
  handleDebugHealth,
  handleAutoTopup,
  handleScheduleAirtime,
  handleDebugConfig,
  handleDebugDatabase,
  handleDebugAgent,
  handleBuyAirtime,
  handleBuyData,
  handlePaymentHistory,
} from "./commandGateway";
import { ensurePrivateChat } from "./utils";

import { readUserProfile, writeUserProfile } from "./storage";
import { config } from "./config";
import { getContextManager, initializeContextManager } from "./conversationContext";
import { createToolRegistry } from "./toolRegistry";
import { orchestrateAIExecution, formatExecutionResult } from "./aiOrchestration";

/**
 * Create Telegram bot with per-user isolated runtime support
 * 
 * Command flow:
 * 1. /login email@example.com → triggers handleLoginInit → kpass login init
 * 2. /verify <login-id> <code> → triggers handleVerify → kpass login verify
 * 3. /balance → queries wallet (requires authenticated session)
 * 4. /search → searches information (works without auth)
 * 5. /logout → clears session
 * 6. /status → shows runtime details
 * 
 * Each user has isolated HOME directory where kpass stores .kpass/config.json
 */

/**
 * Create Telegram bot with per-user isolated runtime support
 * 
 * @param botToken - Telegram bot token
 * @param enablePolling - Whether to enable polling (only relay should poll)
 */
export function createTelegramBot(botToken: string, enablePolling: boolean = true): TelegramBot {
  const bot = new TelegramBot(botToken, { polling: enablePolling });

  bot.on("message", async (msg: Message) => {
    const userId = msg.from?.id;
    if (!userId) {
      return bot.sendMessage(msg.chat.id, "Unable to resolve your Telegram identity.");
    }

    const incomingText = msg.text?.trim();
    if (!incomingText) {
      return;
    }

    try {
      // ==============================================================
      // INTERCEPTOR: CONVERSATIONAL AUTHENTICATION CODE STATE CHECK
      // ==============================================================
      if (!incomingText.startsWith("/")) {
        try {
          const profile = readUserProfile(userId, config.userDataRoot);

          if (profile.pendingAuth) {
            const authAge = Date.now() - profile.pendingAuth.createdAt;
            const MAX_AUTH_TTL = 10 * 60 * 1000; // 10 minutes

            if (authAge > MAX_AUTH_TTL) {
              delete profile.pendingAuth;
              writeUserProfile(userId, config.userDataRoot, profile);
              return await bot.sendMessage(
                msg.chat.id,
                "⏰ Your verification code has expired. Please run /login again to start a new authentication."
              );
            }

            const isOtpLike = /^[A-Z0-9]{4,12}$/.test(incomingText.toUpperCase());

            if (isOtpLike) {
              await bot.sendMessage(
                msg.chat.id,
                "⏳ Verification code received, authenticating your sandbox environment..."
              );

              const telegramUsername = msg.from?.username || undefined;
              const result = await handleVerify(userId, profile.pendingAuth.loginId, incomingText, telegramUsername);

              const updatedProfile = readUserProfile(userId, config.userDataRoot);
              delete updatedProfile.pendingAuth;
              writeUserProfile(userId, config.userDataRoot, updatedProfile);

              await bot.sendMessage(msg.chat.id, result.output);
              return; // Halt command routing execution tree
            }
          }
        } catch (profileError) {
          // No profile folder available yet, safe to pass through
        }
      }

      // ==============================================================
      // STANDARD ROUTING ENGINE LISTENER MATRIX
      // ==============================================================
      if (incomingText === "/start" || incomingText === "/help") {
        await bot.sendMessage(
          msg.chat.id,
          `🔐 *KiteRelay - Autonomous Agent OS*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Your isolated runtime. Autonomous agents. Real economy.\n\n` +
            
            `🎯 *QUICK START (Phase 2)*\n` +
            `1. Login: \`/login email@domain.com\`\n` +
            `2. Create agent: \`/agent-create Monitor KITE balance every hour\`\n` +
            `3. List agents: \`/agent-list\`\n` +
            `4. View results: \`/agent-logs ID\`\n\n` +
            
            `🤖 *Autonomous Agents*\n` +
            `• \`/agent-create DESCRIPTION\` — Create agent\n` +
            `• \`/agent-list\` — View all your agents\n` +
            `• \`/agent-start ID\` — Enable agent\n` +
            `• \`/agent-stop ID\` — Disable agent\n` +
            `• \`/agent-delete ID\` — Delete agent\n` +
            `• \`/agent-logs ID\` — View execution history\n` +
            `• \`/agent-run ID\` — Trigger immediate execution\n\n` +
            
            `📝 *Authentication*\n` +
            `• \`/login EMAIL\` — Authenticate with Kite Passport\n` +
            `• \`/verify LOGIN\\_ID CODE\` — Verify with code\n` +
            `• \`/logout\` — Clear session\n\n` +

            `💳 *Wallet & Transactions*\n` +
            `• \`/balance\` — Check wallet balance\n` +
            `• \`/send @username AMOUNT ASSET\` — Send to user\n` +
            `• \`/wallet-send ADDRESS AMOUNT ASSET\` — Send to address\n\n` +

            `🛒 *Commerce (Phase 4)*\n` +
            `• \`/buy-airtime PHONE AMOUNT provider\` — Buy airtime (NGN)\n` +
            `  Examples: /buy-airtime 08012345678 3000 MTN\n` +
            `            /buy-airtime +2348012345678 1000 GLO\n` +
            `• \`/buy-data PHONE|@username SIZE provider\` — Buy mobile data\n` +
            `  Examples: /buy-data 08012345678 2GB MTN\n` +
            `            /buy-data @alice 1GB AIRTEL\n` +
            `• \`/payment-history\` — View your commerce history\n` +
            `• \`/auto-topup SIZE frequency provider\` — Create recurring top-up\n` +
            `• \`/schedule-airtime AMOUNT frequency provider\` — Schedule airtime\n\n` +

            `🛡️ *Programmable Sessions*\n` +
            `• \`/session-create BUDGET TTL\\_HOURS\` — Spending session\n` +
            `• \`/session-list\` — List active sessions\n` +
            `• \`/session-use ID\` — Activate session\n` +
            `• \`/session-execute URL\` — Execute with x402 payment\n\n` +
            
            `🔍 *Search & Status*\n` +
            `• \`/search QUERY\` — Search information\n` +
            `• \`/status\` — Runtime diagnostics\n\n` +
            
            `⚠️ All actions execute in your isolated sandboxed runtime.\n` +
            `Multi-tenant isolation. Real wallet integration. Real economy.`,
          { parse_mode: "Markdown" }
        );
      }

      // ========== AUTHENTICATION: STEP 1 ==========
      else if (incomingText.startsWith("/login")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(
            msg.chat.id,
            "⚠️ For security, login must be completed in a private chat."
          );
        }

        const email = incomingText.split(" ").slice(1).join(" ").trim();
        if (!email) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /login user@example.com\n\nSend your email address to start authentication."
          );
        }

        try {
          const result = await handleLoginInit(userId, email);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, email, error }, "login init failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Login initialization failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== AUTHENTICATION: STEP 2 (MANUAL BACKWARD COMPATIBILITY) ==========
      else if (incomingText.startsWith("/verify")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(
            msg.chat.id,
            "⚠️ For security, verification must be completed in a private chat."
          );
        }

        const parts = incomingText.split(" ");
        if (parts.length < 3) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /verify <login-id> <otp-code>\n\nExample: /verify login_abc123 123456"
          );
        }

        const loginId = parts[1];
        const code = parts[2];

        try {
          const telegramUsername = msg.from?.username || undefined;
          const result = await handleVerify(userId, loginId, code, telegramUsername);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, loginId, error }, "verify failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Verification failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== LOGOUT ==========
      else if (msg.text === "/logout") {
        try {
          const result = await handleLogout(userId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "logout failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Logout failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== BALANCE ==========
      else if (msg.text === "/balance") {
        try {
          const result = await handleBalance(userId);
          if (result.success) {
            // Try to format as JSON if possible
            try {
              const parsed = JSON.parse(result.output);
              const formatted = `💰 Your Wallet Balance:\n━━━━━━━━━━━━━━━━━━━\n${JSON.stringify(
                parsed,
                null,
                2
              )}`;
              await bot.sendMessage(msg.chat.id, formatted);
            } catch {
              // If not JSON, send as-is
              await bot.sendMessage(msg.chat.id, `💰 Balance:\n${result.output}`);
            }
          } else {
            await bot.sendMessage(msg.chat.id, `❌ ${result.output}`);
          }
        } catch (error) {
          logger.error({ userId, error }, "balance command failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Balance query failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== SEARCH ==========
      else if (incomingText.startsWith("/search")) {
        const query = incomingText.split(" ").slice(1).join(" ").trim();
        if (!query) {
          return await bot.sendMessage(msg.chat.id, "Usage: /search QUERY\n\nExample: /search bitcoin price");
        }

        try {
          const result = await handleSearch(userId, query);
          if (result.success) {
            await bot.sendMessage(msg.chat.id, `🔍 Search Results:\n${result.output}`);
          } else {
            await bot.sendMessage(msg.chat.id, `❌ ${result.output}`);
          }
        } catch (error) {
          logger.error({ userId, query, error }, "search failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Search failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== STATUS ==========
      else if (incomingText === "/status") {
        try {
          const result = await handleTelemetryStatus(userId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "status command failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Status failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== AGENT REGISTRATION ==========
      else if (incomingText.startsWith("/agent-register")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, agent operations must be in private chat.");
        }

        const agentType = incomingText.split(" ").slice(1).join(" ").trim();
        if (!agentType) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /agent-register <agent-type>\nExample: /agent-register trader"
          );
        }

        try {
          const result = await handleAgentRegister(userId, agentType);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "agent registration failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Registration failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== SESSION CREATE ==========
      else if (incomingText.startsWith("/session-create")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, session operations must be in private chat.");
        }

        const parts = incomingText.split(" ");
        if (parts.length < 3) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /session-create <max-amount> <ttl> [task-summary]\n" +
            "Example: /session-create 10 1h Market research task"
          );
        }

        const maxAmount = parts[1];
        const ttl = parts[2];
        const taskSummary = parts.slice(3).join(" ") || undefined;

        try {
          const result = await handleSessionCreate(userId, maxAmount, ttl, taskSummary);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "session creation failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Creation failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== SESSION LIST ==========
      else if (incomingText === "/session-list" || incomingText.startsWith("/session-list ")) {
        const status = incomingText.split(" ")[1] || undefined;

        try {
          const result = await handleSessionList(userId, status);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "session list failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ List failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== SESSION STATUS ==========
      else if (incomingText.startsWith("/session-status")) {
        const requestId = incomingText.split(" ").slice(1).join(" ").trim();
        if (!requestId) {
          return await bot.sendMessage(msg.chat.id, "Usage: /session-status <request-id>");
        }

        try {
          const result = await handleSessionStatus(userId, requestId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "session status check failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Status check failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== SESSION USE ==========
      else if (incomingText.startsWith("/session-use")) {
        const sessionId = incomingText.split(" ").slice(1).join(" ").trim();
        if (!sessionId) {
          return await bot.sendMessage(msg.chat.id, "Usage: /session-use <session-id>");
        }

        try {
          const result = await handleSessionUse(userId, sessionId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "session activation failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Activation failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== SESSION EXECUTE ==========
      else if (incomingText.startsWith("/session-execute")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, execution must be in private chat.");
        }

        const parts = incomingText.split(" ");
        if (parts.length < 2) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /session-execute <url> [GET|POST] [headers-json]\n" +
            "Example: /session-execute https://api.example.com/data"
          );
        }

        const url = parts[1];
        const method = parts[2] || "GET";
        const headersJson = parts.slice(3).join(" ") || undefined;

        try {
          const result = await handleSessionExecute(userId, url, method, headersJson);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "session execution failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Execution failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== WALLET SEND ==========
      else if (incomingText.startsWith("/wallet-send")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, transfers must be in private chat.");
        }

        const parts = incomingText.split(" ");
        if (parts.length < 4) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /wallet-send <to-address> <amount> <asset>\n" +
            "Example: /wallet-send 0x123... 1.5 USDC"
          );
        }

        const toAddress = parts[1];
        const amount = parts[2];
        const asset = parts[3];

        try {
          const result = await handleWalletSend(userId, toAddress, amount, asset);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "wallet send failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Transfer failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }

      // ========== SEND TO USERNAME ==========
      else if (incomingText.startsWith("/send")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, transfers must be in private chat.");
        }

        const parts = incomingText.split(" ");
        if (parts.length < 4) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /send @username <amount> <asset>\n" +
            "Example: /send @alice 5 KITE\n" +
            "Example: /send @bob 1.5 USDC"
          );
        }

        const username = parts[1];
        const amount = parts[2];
        const asset = parts[3];

        if (!username.startsWith("@")) {
          return await bot.sendMessage(
            msg.chat.id,
            "❌ Username must start with @\n" +
            "Usage: /send @username <amount> <asset>"
          );
        }

        try {
          const result = await handleSendToUsername(userId, username, amount, asset, bot);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, username, error }, "send to username failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Transfer failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }

      // ========== PHASE 4: COMMERCE - BUY AIRTIME ==========
      else if (incomingText.startsWith("/buy-airtime")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, purchases must be in private chat.");
        }

        const parts = incomingText.split(" ");
        if (parts.length < 4) {
          return await bot.sendMessage(
            msg.chat.id,
            `❌ Usage: /buy-airtime <phone> <amount-NGN> <provider>\n\n` +
            `Examples:\n` +
            `• /buy-airtime 08012345678 3000 MTN\n` +
            `• /buy-airtime +2348012345678 1000 GLO\n\n` +
            `Supported providers: MTN, GLO, AIRTEL, NTEL`
          );
        }

        const phoneNumber = parts[1];
        const amountStr = parts[2];
        const providerCode = parts[3];

        try {
          const result = await handleBuyAirtime(userId, phoneNumber, amountStr, providerCode);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "buy-airtime failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Purchase failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }

      // ========== PHASE 4: COMMERCE - PAYMENT HISTORY ==========
      else if (incomingText.startsWith("/buy-data")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, purchases must be in private chat.");
        }

        const parts = incomingText.split(" ");
        if (parts.length < 4) {
          return await bot.sendMessage(
            msg.chat.id,
            `❌ Usage: /buy-data <phone|@username> <amount-NGN> <provider>\n\n` +
              `Examples:\n` +
              `• /buy-data 08012345678 2000 MTN\n` +
              `• /buy-data @alice 1500 AIRTEL`
          );
        }

        const recipient = parts[1];
        const amount = parts[2];
        const provider = parts[3];

        try {
          const result = await handleBuyData(userId, recipient, amount, provider);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "buy-data failed");
          await bot.sendMessage(msg.chat.id, `❌ Purchase failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== PHASE 4: COMMERCE - AUTO TOPUP ==========
      else if (incomingText.startsWith("/auto-topup")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, scheduling must be in private chat.");
        }

        const parts = incomingText.split(" ");
        if (parts.length < 4) {
          return await bot.sendMessage(
            msg.chat.id,
            `❌ Usage: /auto-topup <amount-NGN> <frequency> <provider>\n\nExamples:\n• /auto-topup 2000 weekly MTN`);
        }

        const amount = parts[1];
        const frequency = parts[2];
        const provider = parts[3];

        try {
          const result = await handleAutoTopup(userId, amount, frequency, provider);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "auto-topup failed");
          await bot.sendMessage(msg.chat.id, `❌ Scheduling failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }

      // ========== PHASE 4: COMMERCE - SCHEDULE AIRTIME ==========
      else if (incomingText.startsWith("/schedule-airtime")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, scheduling must be in private chat.");
        }

        const parts = incomingText.split(" ");
        if (parts.length < 4) {
          return await bot.sendMessage(
            msg.chat.id,
            `❌ Usage: /schedule-airtime <amount-NGN> <frequency> <provider>\n\nExamples:\n• /schedule-airtime 3000 weekly MTN`);
        }

        const amount = parts[1];
        const frequency = parts[2];
        const provider = parts[3];

        try {
          const result = await handleScheduleAirtime(userId, amount, frequency, provider);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "schedule-airtime failed");
          await bot.sendMessage(msg.chat.id, `❌ Scheduling failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      else if (incomingText === "/payment-history") {
        try {
          const result = await handlePaymentHistory(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "payment-history failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Failed to retrieve history: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }

      // ========== PHASE 2: AUTONOMOUS AGENT COMMANDS ==========
      else if (incomingText.startsWith("/agent-create")) {
        const description = incomingText.split(" ").slice(1).join(" ").trim();
        try {
          const result = await handleAgentCreate(userId, description);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "agent-create failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Agent creation failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      else if (incomingText === "/agent-list") {
        try {
          const result = await handleAgentList(userId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "agent-list failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Agent listing failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      else if (incomingText.startsWith("/agent-stop")) {
        const agentId = incomingText.split(" ").slice(1).join(" ").trim();
        try {
          const result = await handleAgentStop(userId, agentId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "agent-stop failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      else if (incomingText.startsWith("/agent-start")) {
        const agentId = incomingText.split(" ").slice(1).join(" ").trim();
        try {
          const result = await handleAgentStart(userId, agentId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "agent-start failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      else if (incomingText.startsWith("/agent-delete")) {
        const agentId = incomingText.split(" ").slice(1).join(" ").trim();
        try {
          const result = await handleAgentDelete(userId, agentId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "agent-delete failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      else if (incomingText.startsWith("/agent-logs")) {
        const parts = incomingText.split(" ");
        const agentId = parts[1] || "";
        const limit = parts[2] || "10";
        try {
          const result = await handleAgentLogs(userId, agentId, limit);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "agent-logs failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      else if (incomingText.startsWith("/agent-run")) {
        const agentId = incomingText.split(" ").slice(1).join(" ").trim();
        try {
          const result = await handleAgentRun(userId, agentId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, error }, "agent-run failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== DEBUG RUNTIME (DIAGNOSTICS) ==========
      else if (incomingText === "/debug-runtime") {
        try {
          const result = await handleDebugRuntime(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "debug-runtime failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Debug failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== DEBUG HEALTH CHECK ==========
      else if (incomingText === "/debug-health") {
        try {
          const result = await handleDebugHealth(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "debug-health failed");
          await bot.sendMessage(msg.chat.id, `❌ Health check failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== DEBUG CONFIG ==========
      else if (incomingText === "/debug-config") {
        try {
          const result = await handleDebugConfig(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "debug-config failed");
          await bot.sendMessage(msg.chat.id, `❌ Config debug failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== DEBUG DATABASE ==========
      else if (incomingText === "/debug-db") {
        try {
          const result = await handleDebugDatabase(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "debug-db failed");
          await bot.sendMessage(msg.chat.id, `❌ Database debug failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== DEBUG AGENT ==========
      else if (incomingText === "/debug-agent") {
        try {
          const result = await handleDebugAgent(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "debug-agent failed");
          await bot.sendMessage(msg.chat.id, `❌ Agent debug failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== PHASE 3: AI AGENT ORCHESTRATION ==========
      else if (incomingText.startsWith("/agent")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(
            msg.chat.id,
            "⚠️ For security, agent operations must be completed in a private chat."
          );
        }

        try {
          // Extract user intent from command
          const intent = incomingText.substring(7).trim();
          
          if (!intent) {
            return await bot.sendMessage(
              msg.chat.id,
              `🤖 *AI Agent Assistant*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `*Examples:*\n` +
              `\`/agent check my balance\`\n` +
              `\`/agent send @alice 5 KITE\`\n` +
              `\`/agent find cheapest AI API\`\n` +
              `\`/agent create 24h spending session 100 USDC\`\n\n` +
              `I can help you:\n` +
              `• Query wallet state\n` +
              `• Transfer funds\n` +
              `• Search information\n` +
              `• Manage spending sessions\n` +
              `• Execute economic actions\n\n` +
              `What would you like to do?`,
              { parse_mode: "Markdown" }
            );
          }

          // Show typing indicator
          await bot.sendChatAction(msg.chat.id, "typing");

          // Initialize context manager if needed
          const contextManager = getContextManager();

          // Create tool registry with handlers
          const toolHandlers: Record<string, Function> = {
            handleBalance,
            handleSearch,
            handleWalletSend,
            handleSendToUsername,
            handleSessionCreate,
            handleSessionList,
            handleSessionExecute,
            handleAgentList,
            handleBuyAirtime,
            handleBuyData,
            handlePaymentHistory,
          };

          const toolRegistry = createToolRegistry(toolHandlers);

          // Get user context and history
          const userContext = contextManager.getContext(userId);
          const conversationHistory = contextManager.getHistoryForLLM(userId) as { role: "user" | "assistant"; content: string }[];

          // Prepare execution context
          const executionContext = {
            userId,
            userMessage: intent,
            conversationHistory,
            activeSession: userContext.activeSession,
            wallet: userContext.lastWalletState
          };

          // Execute AI orchestration
          logger.info({ userId, intent }, "AI agent orchestration starting");
          const result = await orchestrateAIExecution(
            executionContext,
            toolRegistry,
            contextManager
          );

          // Add to conversation history
          contextManager.addMessage(userId, "user", intent);
          contextManager.addMessage(userId, "assistant", result.output);

          // Format and send response
          const formattedResponse = formatExecutionResult(result);

          // Split long messages (Telegram limit is 4096 chars)
          const maxLength = 4000;
          if (formattedResponse.length > maxLength) {
            const chunks = formattedResponse.match(new RegExp(`.{1,${maxLength}}`, "g")) || [];
            for (const chunk of chunks) {
              await bot.sendMessage(msg.chat.id, chunk, { parse_mode: "Markdown" });
            }
          } else {
            await bot.sendMessage(msg.chat.id, formattedResponse, { parse_mode: "Markdown" });
          }

          logger.info(
            { userId, success: result.success, toolsUsed: result.toolsExecuted.length },
            "telemetry: AI agent execution completed"
          );

        } catch (error: unknown) {
          logger.error({ userId, error }, "AI agent orchestration failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Agent error: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      else {
        // Unknown command - suggest help
        await bot.sendMessage(msg.chat.id, `Unknown command. Send /help for available commands.`);
      }
    } catch (error: unknown) {
      logger.error({ error }, "message handler error");
      try {
        await bot.sendMessage(
          msg.chat.id,
          "⚠️ An unexpected error occurred. Please try again later."
        );
      } catch (sendError) {
        logger.error({ sendError }, "failed to send error message");
      }
    }
  });

  bot.on("polling_error", (error: unknown) => {
    logger.error({ error }, "Telegram polling error");
  });

  return bot;
}
