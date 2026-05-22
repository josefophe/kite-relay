import TelegramBot from "node-telegram-bot-api";
import { Message } from "node-telegram-bot-api";
import { logger } from "./logger";
import {
  handleLoginInit,
  handleVerify,
  handleLogout,
  handleBalance,
  handleSearch,
  handleKsearchHealth,
  handleKsearchServicesList,
  handleKsearchServiceGet,
  handleKsearchCatalogExport,
  handleTelemetryStatus,
  handleStatus,
  handleVersion,
  handleMe,
  handleSignupInit,
  handleSignupPoll,
  handleSignupExchange,
  handleFaucetDrop,
  handleSessionStatusCheck,
  handleUserSessions,
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
  handleRequestSession,
  handleBuyAirtime,
  handleBuyData,
  handlePaymentHistory,
  handleScheduledJobs,
  handleStopTopup,
  handlePauseTopup,
  handleResumeTopup,
  handleOnboardingStart,
  handleOnboardingTutorial,
  handleOnboardingSetup,
  handleOnboardingProgress,
  handleOnboardingHelp,
  handleOnboardingNext,
  handleOnboardingSkip,
  handleOnboardingGuide,
} from "./commandGateway";
import { ensurePrivateChat, isHelpRequest } from "./utils";

import { readUserProfile, writeUserProfile } from "./storage";
import { config } from "./config";
import { getContextManager, initializeContextManager } from "./conversationContext";
import { createToolRegistry } from "./toolRegistry";
import { orchestrateAIExecution, formatExecutionResult } from "./aiOrchestration";

// ════════════════════════════════════════════════════════════════
// PHASE 3 IMPORTS: Skills Layer Integration
// ════════════════════════════════════════════════════════════════
import { resolveIntent } from "./intentResolver";
import {
  formatTelegramResponse,
  formatErrorResponse,
} from "./telegramFormatter";

// ════════════════════════════════════════════════════════════════
// PHASE 5 IMPORTS: User Onboarding & Guidance
// ════════════════════════════════════════════════════════════════
import {
  shouldShowPrompt,
  getPrompt,
  formatPrompt,
  FirstTimeEvent,
  dismissPrompt,
} from "./firstTimePromptsService";

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

  const originalSendMessage = bot.sendMessage.bind(bot);
  (bot as any).sendMessage = (chatId: number | string, text: string, options: TelegramBot.SendMessageOptions = {}) => {
    return originalSendMessage(chatId, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...options,
    });
  };

  const renderAutonomousHelp = (): string =>
    `<b>🤖 KiteRelay Autonomous AI Assistant</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I help you execute real commerce tasks using Kite AI, agents, and tool-based automation.

<b>What you can ask me:</b>
• Send payments → <i>Send @charity 5 USDC</i>
• Transfer tokens → <i>Transfer 2 KITE to @john</i>
• Check wallet → <i>What's my balance?</i>
• Search services → <i>Find verified aid organizations</i>
• Register agents → <i>Register autonomous trading agent</i>
• Pay services → <i>Pay subscription to service X</i>

<b>Getting started:</b>
1. Run /login
2. Run /agent-register trader
3. Use natural language or /agent commands

<b>Quick examples:</b>
• Send @charity 5 USDC
• Transfer 2 KITE to @john
• Check my wallet
• Find verified aid organizations
• Register autonomous trading agent
• Pay for API service
• Search service ID
`;

  const renderExamplesHelp = (): string =>
    `<b>🚀 KiteRelay Demo Examples</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Payments</b>
• Send @charity 5 USDC
• Pay @vendor 2 KITE

<b>Wallet</b>
• What's my balance?

<b>Search</b>
• Find verified aid organizations
• Search service ID for AI providers

<b>Agents</b>
• Register autonomous trading agent
• /agent-create Monitor KITE balance every hour
`;

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
      // Stop processing immediately if the incoming message contains no text
      if (!incomingText) return; 

      if (!incomingText.startsWith("/")) {
        try {
          const profile = readUserProfile(userId, config.userDataRoot);
          if (profile.pendingAuth) {
            const authAge = Date.now() - profile.pendingAuth.createdAt;
            const MAX_AUTH_TTL = 10 * 60 * 1000; 
            
            if (authAge > MAX_AUTH_TTL) {
              delete profile.pendingAuth;
              writeUserProfile(userId, config.userDataRoot, profile);
              return await bot.sendMessage(
                msg.chat.id,
                "⏰ Your verification code has expired. Please run /login again to start a new authentication."
              );
            }
            
            // Strings like '3UQ5QZUX' or '622KPDSZ' or '123456' will match here
            const isOtpLike = /^[A-Z0-9]{4,12}$/.test(incomingText.toUpperCase()) && /[0-9]/.test(incomingText);
            if (isOtpLike) {
              const { loginId, signupId } = profile.pendingAuth;
              
              // SIGNUP FLOW: OTP is the exchange token, verify and complete signup
              if (signupId && !loginId) {
                await bot.sendMessage(
                  msg.chat.id,
                  "⏳ Completing signup with verification code..."
                );
                
                try {
                  const exchangeResult = await handleSignupExchange(userId, signupId, incomingText);
                  const updatedProfile = readUserProfile(userId, config.userDataRoot);
                  delete updatedProfile.pendingAuth;
                  writeUserProfile(userId, config.userDataRoot, updatedProfile);
                  await bot.sendMessage(msg.chat.id, exchangeResult.output);
                } catch (signupError: unknown) {
                  logger.error({ userId, signupId, error: signupError }, "signup verification failed");
                  await bot.sendMessage(
                    msg.chat.id,
                    `❌ Signup verification failed: ${signupError instanceof Error ? signupError.message : "unexpected error"}`
                  );
                }
                return;
              }
              
              // LOGIN FLOW: Standard OTP verification
              if (loginId) {
                await bot.sendMessage(
                  msg.chat.id,
                  "⏳ Verification code received, authenticating your sandbox environment..."
                );
                const telegramUsername = msg.from?.username || undefined;
                const result = await handleVerify(userId, loginId, incomingText, telegramUsername);
                const updatedProfile = readUserProfile(userId, config.userDataRoot);
                delete updatedProfile.pendingAuth;
                writeUserProfile(userId, config.userDataRoot, updatedProfile);
                await bot.sendMessage(msg.chat.id, result.output);
                return;
              }

              await bot.sendMessage(
                msg.chat.id,
                "❌ Unable to complete verification because auth metadata is missing. Please run /login again."
              );
              return;
            }
          }
        } catch (profileError) {
          // No profile folder available yet, safe to pass through
        }
      }


      // ==============================================================
      // STANDARD ROUTING ENGINE LISTENER MATRIX
      // ==============================================================
      
      // ========== PHASE 5: ONBOARDING - START ==========
      if (incomingText === "/start") {
        try {
          const result = await handleOnboardingStart(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "HTML" });
        } catch (error) {
          logger.error({ userId, error }, "onboarding start failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Onboarding failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== PHASE 5: ONBOARDING - TUTORIAL ==========
      else if (incomingText.startsWith("/tutorial")) {
        try {
          const args = incomingText.split(" ").slice(1);
          const result = await handleOnboardingTutorial(userId, args[0]);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "HTML" });
        } catch (error) {
          logger.error({ userId, error }, "tutorial failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Tutorial error: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== PHASE 5: ONBOARDING - SETUP FLOWS ==========
      else if (incomingText.startsWith("/setup")) {
        try {
          const args = incomingText.split(" ").slice(1);
          const result = await handleOnboardingSetup(userId, args[0]);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "HTML" });
        } catch (error) {
          logger.error({ userId, error }, "setup flow failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Setup error: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== PHASE 5: ONBOARDING - PROGRESS ==========
      else if (incomingText === "/progress") {
        try {
          const result = await handleOnboardingProgress(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "HTML" });
        } catch (error) {
          logger.error({ userId, error }, "progress check failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Progress error: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== PHASE 5: ONBOARDING - HELP ==========
      else if (incomingText === "/help" || incomingText.startsWith("/help ")) {
        try {
          const args = incomingText.split(" ").slice(1);
          const result = await handleOnboardingHelp(userId, args[0]);
          // Use HTML parse mode for safety with formatting
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "HTML" });
        } catch (error) {
          logger.error({ userId, error }, "help failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Help error: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== PHASE 5: ONBOARDING - NEXT (ADVANCE) ==========
      else if (incomingText === "/next") {
        try {
          const result = await handleOnboardingNext(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "HTML" });
        } catch (error) {
          logger.error({ userId, error }, "next step failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Advance error: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== PHASE 5: ONBOARDING - SKIP ==========
      else if (incomingText === "/skip") {
        try {
          const result = await handleOnboardingSkip(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "HTML" });
        } catch (error) {
          logger.error({ userId, error }, "skip flow failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Skip error: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== PHASE 5: ONBOARDING - GUIDE ==========
      else if (incomingText.startsWith("/guide")) {
        try {
          const args = incomingText.split(" ").slice(1);
          const result = await handleOnboardingGuide(userId, args[0]);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "HTML" });
        } catch (error) {
          logger.error({ userId, error }, "guide failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Guide error: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== LEGACY HELP COMMANDS ==========
      else if (incomingText === "/ai-help" || incomingText === "/autonomous-help") {
        await bot.sendMessage(msg.chat.id, renderAutonomousHelp(), { parse_mode: "HTML" });
      }
      else if (incomingText === "/examples") {
        await bot.sendMessage(msg.chat.id, renderExamplesHelp(), { parse_mode: "HTML" });
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
      // ========== SIGNUP ==========
      else if (incomingText.startsWith("/signup")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(
            msg.chat.id,
            "⚠️ For security, signup must be completed in a private chat."
          );
        }

        const email = incomingText.split(" ").slice(1).join(" ").trim();
        if (!email) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /signup user@example.com\n\nSend your email address to start signup."
          );
        }

        try {
          const result = await handleSignupInit(userId, email);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, email, error }, "signup init failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Signup initialization failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== SIGNUP POLL (CHECK EMAIL VERIFICATION STATUS) ==========
      else if (incomingText.startsWith("/signup-poll")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(
            msg.chat.id,
            "⚠️ For security, signup must be completed in a private chat."
          );
        }

        const signupId = incomingText.split(" ").slice(1).join(" ").trim();
        if (!signupId) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /signup-poll <signup-id>\n\nCheck if your email verification is complete."
          );
        }

        try {
          const result = await handleSignupPoll(userId, signupId);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, signupId, error }, "signup-poll failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Signup poll failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      // ========== SIGNUP EXCHANGE (COMPLETE WITH VERIFICATION TOKEN) ==========
      else if (incomingText.startsWith("/signup-exchange")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(
            msg.chat.id,
            "⚠️ For security, signup must be completed in a private chat."
          );
        }

        const parts = incomingText.split(" ");
        if (parts.length < 3) {
          return await bot.sendMessage(
            msg.chat.id,
            "Usage: /signup-exchange <signup-id> <exchange-token>\n\nExample: /signup-exchange signup_abc123 token_xyz789"
          );
        }

        const signupId = parts[1];
        const exchangeToken = parts[2];

        try {
          const result = await handleSignupExchange(userId, signupId, exchangeToken);
          await bot.sendMessage(msg.chat.id, result.output);
        } catch (error) {
          logger.error({ userId, signupId, error }, "signup-exchange failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Signup exchange failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
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
      // ========== STATUS ==========
      else if (msg.text === "/status") {
        try {
          const result = await handleStatus(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "status failed");
          await bot.sendMessage(msg.chat.id, `❌ Status check failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== VERSION ==========
      else if (msg.text === "/version") {
        try {
          const result = await handleVersion(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "version failed");
          await bot.sendMessage(msg.chat.id, `❌ Version check failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== ME ==========
      else if (msg.text === "/me") {
        try {
          const result = await handleMe(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "me failed");
          await bot.sendMessage(msg.chat.id, `❌ Identity check failed: ${error instanceof Error ? error.message : "unexpected error"}`);
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
            
            // ========== PHASE 5: First-Time Wallet Check Prompt ==========
            if (await shouldShowPrompt(userId, FirstTimeEvent.WALLET_CHECK)) {
              const prompt = await getPrompt(userId, FirstTimeEvent.WALLET_CHECK);
              if (prompt) {
                await bot.sendMessage(msg.chat.id, formatPrompt(prompt), { parse_mode: "Markdown" });
                await dismissPrompt(userId, FirstTimeEvent.WALLET_CHECK);
              }
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
            await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
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
      // ========== KSEARCH HEALTH ==========
      else if (incomingText === "/ksearch-health") {
        try {
          const result = await handleKsearchHealth(userId);
          if (result.success) {
            await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
          } else {
            await bot.sendMessage(msg.chat.id, `❌ ${result.output}`);
          }
        } catch (error) {
          logger.error({ userId, error }, "ksearch health failed");
          await bot.sendMessage(msg.chat.id, `❌ KSearch health check failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== SERVICE LIST ==========
      else if (incomingText.startsWith("/services")) {
        const query = incomingText.split(" ").slice(1).join(" ").trim();

        try {
          const result = await handleKsearchServicesList(userId, query);
          if (result.success) {
            await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
          } else {
            await bot.sendMessage(msg.chat.id, `❌ ${result.output}`);
          }
        } catch (error) {
          logger.error({ userId, query, error }, "services command failed");
          await bot.sendMessage(msg.chat.id, `❌ Services query failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== SERVICE DETAIL ==========
      else if (incomingText.startsWith("/service")) {
        const serviceId = incomingText.split(" ").slice(1).join(" ").trim();
        if (!serviceId) {
          return await bot.sendMessage(msg.chat.id, "Usage: /service <service-id>");
        }

        try {
          const result = await handleKsearchServiceGet(userId, serviceId);
          if (result.success) {
            await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
          } else {
            await bot.sendMessage(msg.chat.id, `❌ ${result.output}`);
          }
        } catch (error) {
          logger.error({ userId, serviceId, error }, "service detail failed");
          await bot.sendMessage(msg.chat.id, `❌ Service lookup failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      // ========== CATALOG EXPORT ==========
      else if (incomingText === "/catalog-export") {
        try {
          const result = await handleKsearchCatalogExport(userId);
          if (result.success && result.filePath) {
            await bot.sendDocument(msg.chat.id, result.filePath, {
              caption: result.output,
            });
          } else if (result.success) {
            await bot.sendMessage(msg.chat.id, result.output);
          } else {
            await bot.sendMessage(msg.chat.id, `❌ ${result.output}`);
          }
        } catch (error) {
          logger.error({ userId, error }, "catalog export failed");
          await bot.sendMessage(msg.chat.id, `❌ Catalog export failed: ${error instanceof Error ? error.message : "unexpected error"}`);
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
        const method = parts[2] || "POST";
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
          
          // ========== PHASE 5: First-Time Transfer Prompt ==========
          if (result.success && await shouldShowPrompt(userId, FirstTimeEvent.FIRST_TRANSFER)) {
            const prompt = await getPrompt(userId, FirstTimeEvent.FIRST_TRANSFER);
            if (prompt) {
              await bot.sendMessage(msg.chat.id, formatPrompt(prompt), { parse_mode: "Markdown" });
              await dismissPrompt(userId, FirstTimeEvent.FIRST_TRANSFER);
            }
          }
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
          const result = await handleSendToUsername(userId, username, amount, asset);
          await bot.sendMessage(msg.chat.id, result.output);
          
          // ========== PHASE 5: First-Time Transfer Prompt ==========
          if (result.success && await shouldShowPrompt(userId, FirstTimeEvent.FIRST_TRANSFER)) {
            const prompt = await getPrompt(userId, FirstTimeEvent.FIRST_TRANSFER);
            if (prompt) {
              await bot.sendMessage(msg.chat.id, formatPrompt(prompt), { parse_mode: "Markdown" });
              await dismissPrompt(userId, FirstTimeEvent.FIRST_TRANSFER);
            }
          }
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
            `❌ Usage: /buy-airtime <phone> <amount-NGN> <provider> [--session-id <SESSION_ID>]\n\n` +
            `Examples:\n` +
            `• /buy-airtime 08012345678 3000 MTN --session-id sess_abc123\n` +
            `• /buy-airtime +2348012345678 1000 GLO\n\n` +
            `Supported providers: MTN, GLO, AIRTEL, NTEL\n\n` +
            `💡 Tip: Use /request-session first to get a session ID`
          );
        }

        const phoneNumber = parts[1];
        const amountStr = parts[2];
        const providerCode = parts[3];

        // Parse optional --session-id flag
        let sessionId: string | undefined;
        for (let i = 4; i < parts.length; i++) {
          if (parts[i] === "--session-id" && i + 1 < parts.length) {
            sessionId = parts[++i];
          }
        }

        try {
          const result = await handleBuyAirtime(userId, phoneNumber, amountStr, providerCode, sessionId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "buy-airtime failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Purchase failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }

      // ========== PHASE 4: COMMERCE - BUY DATA ==========
      else if (incomingText.startsWith("/buy-data")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, purchases must be in private chat.");
        }

        const parts = incomingText.split(" ");
        if (parts.length < 4) {
          return await bot.sendMessage(
            msg.chat.id,
            `❌ Usage: /buy-data <phone|@username> <amount-NGN> <provider> [--session-id <SESSION_ID>]\n\n` +
              `Examples:\n` +
              `• /buy-data 08012345678 2000 MTN --session-id sess_abc123\n` +
              `• /buy-data @alice 1500 AIRTEL\n\n` +
              `💡 Tip: Use /request-session first to get a session ID`
          );
        }

        const recipient = parts[1];
        const amount = parts[2];
        const provider = parts[3];

        // Parse optional --session-id flag
        let sessionId: string | undefined;
        for (let i = 4; i < parts.length; i++) {
          if (parts[i] === "--session-id" && i + 1 < parts.length) {
            sessionId = parts[++i];
          }
        }

        try {
          const result = await handleBuyData(userId, recipient, amount, provider, sessionId);
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
            `❌ Usage: /auto-topup <amount-NGN> <frequency> <provider> --session-id <SESSION_ID>\n\n` +
            `Examples:\n` +
            `• /auto-topup 3000 1hour MTN --session-id sess_abc123\n` +
            `• /auto-topup 2000 daily GLO --session-id sess_abc123\n\n` +
            `💡 Frequencies: 1hour, 2hours, daily, weekly`);
        }

        const amount = parts[1];
        const frequency = parts[2];
        const provider = parts[3];

        // Parse optional --session-id flag
        let sessionId: string | undefined;
        for (let i = 4; i < parts.length; i++) {
          if (parts[i] === "--session-id" && i + 1 < parts.length) {
            sessionId = parts[++i];
          }
        }

        try {
          const result = await handleAutoTopup(userId, amount, frequency, provider, sessionId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
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
            `❌ Usage: /schedule-airtime <amount-NGN> <frequency> <provider> --session-id <SESSION_ID>\n\n` +
            `Examples:\n` +
            `• /schedule-airtime 2000 daily GLO --session-id sess_abc123\n` +
            `• /schedule-airtime 5000 weekly AIRTEL --session-id sess_abc123`);
        }

        const amount = parts[1];
        const frequency = parts[2];
        const provider = parts[3];

        // Parse optional --session-id flag
        let sessionId: string | undefined;
        for (let i = 4; i < parts.length; i++) {
          if (parts[i] === "--session-id" && i + 1 < parts.length) {
            sessionId = parts[++i];
          }
        }

        try {
          const result = await handleScheduleAirtime(userId, amount, frequency, provider, sessionId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "schedule-airtime failed");
          await bot.sendMessage(msg.chat.id, `❌ Scheduling failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      else if (incomingText === "/request-session" || incomingText.startsWith("/request-session ")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, sessions must be requested in private chat.");
        }

        // Parse optional parameters: /request-session [--max-per-tx <USD>] [--max-total <USD>] [--ttl <seconds>]
        const parts = incomingText.split(" ");
        let maxPerTx: string | undefined;
        let maxTotal: string | undefined;
        let ttlSeconds: string | undefined;

        for (let i = 1; i < parts.length; i++) {
          if (parts[i] === "--max-per-tx" && i + 1 < parts.length) {
            maxPerTx = parts[++i];
          } else if (parts[i] === "--max-total" && i + 1 < parts.length) {
            maxTotal = parts[++i];
          } else if (parts[i] === "--ttl" && i + 1 < parts.length) {
            ttlSeconds = parts[++i];
          }
        }

        try {
          const result = await handleRequestSession(userId, maxPerTx, maxTotal, ttlSeconds);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "HTML" });
        } catch (error) {
          logger.error({ userId, error }, "request-session failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Session request failed: ${error instanceof Error ? error.message : "unexpected error"}`
          );
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

      // ========== PHASE 4: COMMERCE - SCHEDULED JOBS MANAGEMENT ==========
      else if (incomingText === "/scheduled-jobs") {
        try {
          const result = await handleScheduledJobs(userId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "scheduled-jobs failed");
          await bot.sendMessage(
            msg.chat.id,
            `❌ Failed to list jobs: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
      else if (incomingText.startsWith("/stop-topup")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, this must be in private chat.");
        }

        const parts = incomingText.split(" ");
        const jobId = parts[1];

        if (!jobId) {
          return await bot.sendMessage(msg.chat.id, `❌ Usage: /stop-topup <job-id>\n\nView jobs: /scheduled-jobs`);
        }

        try {
          const result = await handleStopTopup(userId, jobId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "stop-topup failed");
          await bot.sendMessage(msg.chat.id, `❌ Failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      else if (incomingText.startsWith("/pause-topup")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, this must be in private chat.");
        }

        const parts = incomingText.split(" ");
        const jobId = parts[1];

        if (!jobId) {
          return await bot.sendMessage(msg.chat.id, `❌ Usage: /pause-topup <job-id>\n\nView jobs: /scheduled-jobs`);
        }

        try {
          const result = await handlePauseTopup(userId, jobId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "pause-topup failed");
          await bot.sendMessage(msg.chat.id, `❌ Failed: ${error instanceof Error ? error.message : "unexpected error"}`);
        }
      }
      else if (incomingText.startsWith("/resume-topup")) {
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(msg.chat.id, "⚠️ For security, this must be in private chat.");
        }

        const parts = incomingText.split(" ");
        const jobId = parts[1];

        if (!jobId) {
          return await bot.sendMessage(msg.chat.id, `❌ Usage: /resume-topup <job-id>\n\nView jobs: /scheduled-jobs`);
        }

        try {
          const result = await handleResumeTopup(userId, jobId);
          await bot.sendMessage(msg.chat.id, result.output, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error({ userId, error }, "resume-topup failed");
          await bot.sendMessage(msg.chat.id, `❌ Failed: ${error instanceof Error ? error.message : "unexpected error"}`);
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
            handleKsearchServicesList,
            handleKsearchServiceGet,
            handleKsearchCatalogExport,
            handleStatus,
            handleVersion,
            handleMe,
            handleFaucetDrop,
            handleUserSessions,
            handleWalletSend,
            handleSendToUsername,
            handleAgentRegister,
            handleAgentCreate,
            handleSessionCreate,
            handleSessionList,
            handleSessionStatusCheck,
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
      // ========== FALLBACK: NATURAL LANGUAGE AI ORCHESTRATION ==========
      else if (!incomingText.startsWith("/")) {
        // Route natural language messages to AI orchestration
        if (!ensurePrivateChat(msg.chat.type)) {
          return await bot.sendMessage(
            msg.chat.id,
            "⚠️ For security, AI operations must be completed in a private chat."
          );
        }

        try {
          // Check authentication first
          const profile = readUserProfile(userId, config.userDataRoot);
          const isAuthenticated = profile && profile.identity && profile.identity.passportId;
          if (!isAuthenticated) {
            return await bot.sendMessage(
              msg.chat.id,
              "❌ Not authenticated.\nPlease run /login and /verify first."
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
            handleKsearchServicesList,
            handleKsearchServiceGet,
            handleKsearchCatalogExport,
            handleStatus,
            handleVersion,
            handleMe,
            handleFaucetDrop,
            handleUserSessions,
            handleWalletSend,
            handleSendToUsername,
            handleAgentRegister,
            handleAgentCreate,
            handleSessionCreate,
            handleSessionList,
            handleSessionStatusCheck,
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

          // Prepare execution context with natural language message
          const executionContext = {
            userId,
            userMessage: incomingText,
            conversationHistory,
            activeSession: userContext.activeSession,
            wallet: userContext.lastWalletState
          };

          // Execute AI orchestration
          logger.info({ userId, userMessage: incomingText }, "AI agent orchestration starting (natural language)");
          const result = await orchestrateAIExecution(
            executionContext,
            toolRegistry,
            contextManager
          );

          // Add to conversation history
          contextManager.addMessage(userId, "user", incomingText);
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
            "telemetry: AI agent execution completed (natural language)"
          );

        } catch (error: unknown) {
          logger.error({ userId, error }, "AI agent orchestration failed (natural language)");
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
