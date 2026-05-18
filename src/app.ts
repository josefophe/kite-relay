import express from "express";
import { config } from "./config";
import { createTelegramBot } from "./telegramBot";
import { setupMetrics } from "./telemetry";
import { logger } from "./logger";
import { runStartupDiagnostics, logStartupInfo } from "./startupDiagnostics";

async function bootstrap(): Promise<void> {
  // ════════════════════════════════════════════════════════════════
  // STARTUP DIAGNOSTICS & LOGGING
  // ════════════════════════════════════════════════════════════════
  logStartupInfo();
  
  try {
    await runStartupDiagnostics();
  } catch (error) {
    logger.warn({ error }, "Startup diagnostics failed, continuing anyway");
  }
  
  // ════════════════════════════════════════════════════════════════
  // SERVICE ROLE CHECK: This is critical to avoid double-polling
  // ════════════════════════════════════════════════════════════════
  if (config.isWorker) {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("⚙️ WORKER MODE DETECTED");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("✓ Telegram polling: DISABLED (worker mode)");
    logger.info("✓ Agent execution: ENABLED");
    logger.info("✓ Redis job queue: ENABLED");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    // Worker should NOT initialize Telegram polling or create bot
    // Worker processes jobs from Redis queue only
    await bootstrapWorker();
  } else {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("📡 RELAY MODE DETECTED");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("✓ Telegram polling: ENABLED");
    logger.info("✓ Bot token: Present");
    logger.info("✓ Scheduler support: ENABLED");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    // Relay initializes Telegram polling and scheduler
    await bootstrapRelay();
  }
}

/**
 * Bootstrap relay mode: Telegram polling + scheduler
 */
async function bootstrapRelay(): Promise<void> {
  const app = express();
  setupMetrics(app);

  app.get("/", (req, res) => {
    res.json({ service: "kite-relay", status: "ready", uptime: process.uptime() });
  });

  app.get("/healthcheck", (req, res) => {
    res.json({
      status: "healthy",
      role: "relay",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  try {
    // ════════════════════════════════════════════════════════════════
    // 1. CRITICAL: ALL DYNAMIC IMPORTS MUST BE FIRST
    // ════════════════════════════════════════════════════════════════
    const { initializeAgentStorage } = await import("./agentStorage");
    const { initializeScheduler } = await import("./scheduler");
    const { ExecutionWorker } = await import("./executionWorker");

    // ════════════════════════════════════════════════════════════════
    // 2. STARTUP DIAGNOSTICS
    // ════════════════════════════════════════════════════════════════
    const dbPath = config.databaseUrl;
    console.log("[BOOT] Mode: RELAY");
    console.log("[BOOT] Scheduler enabled:", process.env.AGENT_SCHEDULER_ENABLED);
    console.log("[BOOT] Worker mode (IS_WORKER):", process.env.IS_WORKER);
    console.log("[BOOT] DB Path:", dbPath);

    // ════════════════════════════════════════════════════════════════
    // 3. INITIALIZE AGENT STORAGE FIRST
    // ════════════════════════════════════════════════════════════════
    initializeAgentStorage(dbPath);
    logger.info({ dbPath }, "Agent storage initialized");

    // ════════════════════════════════════════════════════════════════
    // 4. CONDITIONALLY INITIALIZE SCHEDULER + WORKER
    // ════════════════════════════════════════════════════════════════
    if (process.env.AGENT_SCHEDULER_ENABLED !== "false") {
      console.log("[BOOT] Initializing scheduler...");

      // 4A. START SCHEDULER FIRST
      let scheduler: any;
      try {
        scheduler = initializeScheduler({
          redisUrl: config.redisUrl || "redis://localhost:6379",
          queueName: "agent-scheduler",
          maxConcurrency: parseInt(process.env.WORKER_CONCURRENCY || "4", 10),
          retryBackoffBase: parseInt(process.env.AGENT_RETRY_BACKOFF_BASE || "1000", 10),
          retryBackoffMultiplier: 2,
        });
        console.log("[BOOT] ✓ Scheduler instantiated");
      } catch (schedulerConstructError) {
        console.error("[BOOT] SCHEDULER CONSTRUCTOR ERROR:", schedulerConstructError);
        throw schedulerConstructError;
      }

      try {
        await scheduler.start();
        console.log("[BOOT] ✓ Scheduler started");
        logger.info("Agent scheduler started");
      } catch (schedulerStartError) {
        console.error("[BOOT] SCHEDULER START ERROR:", schedulerStartError);
        throw schedulerStartError;
      }

      // 4B. THEN START WORKER
      console.log("[BOOT] Initializing execution worker...");
      console.log("[BOOT] Redis URL:", config.redisUrl || "redis://localhost:6379");
      console.log("[BOOT] Queue Name: agent-scheduler");
      console.log("[BOOT] Worker Concurrency:", parseInt(process.env.WORKER_CONCURRENCY || "4", 10));

      let executionWorker: any;
      try {
        executionWorker = new ExecutionWorker({
          redisUrl: config.redisUrl || "redis://localhost:6379",
          queueName: "agent-scheduler",
          concurrency: parseInt(process.env.WORKER_CONCURRENCY || "4", 10),
          workerName: `worker-${process.pid}`,
        });
        console.log("[BOOT] ✓ ExecutionWorker instantiated");
      } catch (workerConstructError) {
        console.error("[BOOT] WORKER CONSTRUCTOR ERROR:", workerConstructError);
        throw workerConstructError;
      }

      try {
        await executionWorker.start();
        console.log("[BOOT] ✓ Execution worker started");
        logger.info("✓ Execution worker started");
      } catch (workerStartError) {
        console.error("[BOOT] WORKER START ERROR:", workerStartError);
        throw workerStartError;
      }

      // Setup Graceful Shutdown handlers
      const shutdown = async (): Promise<void> => {
        logger.info("Shutting down KiteRelay (relay) gracefully.");
        try {
          await executionWorker.stop();
          logger.info("✓ Execution worker stopped");
        } catch (e) {
          logger.warn("Execution worker stop failed", e);
        }
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } else {
      console.log("[BOOT] Scheduler disabled - skipping initialization");
    }
  } catch (error) {
    // ════════════════════════════════════════════════════════════════
    // RAW ERROR LOGGING (before logger)
    // ════════════════════════════════════════════════════════════════
    console.error("[BOOT] RAW ERROR:", error);
    if (error instanceof Error) {
      console.error("[BOOT] Error message:", error.message);
      console.error("[BOOT] Stack trace:", error.stack);
    }
    logger.error("Failed to initialize relay infrastructure", { error });
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════
  // START HTTP OBSERVABILITY SERVER
  // ════════════════════════════════════════════════════════════════
  const server = app.listen(config.port, config.host, () => {
    console.log("[BOOT] ✓ Relay HTTP observability server listening on", config.host + ":" + config.port);
    logger.info({ host: config.host, port: config.port }, "HTTP observability server listening");
  });

  // ════════════════════════════════════════════════════════════════
  // INITIALIZE TELEGRAM BOT (relay only)
  // ════════════════════════════════════════════════════════════════
  if (!config.telegramBotToken) {
    logger.error("TELEGRAM_BOT_TOKEN not configured for relay mode");
    process.exit(1);
  }

  console.log("[BOOT] Initializing Telegram bot...");
  const bot = createTelegramBot(config.telegramBotToken, config.enableTelegramPolling);
  console.log("[BOOT] ✓ Telegram bot initialized");
  logger.info("✓ Telegram bot created");
  logger.info("✓ Telegram polling started");

  // ════════════════════════════════════════════════════════════════
  // GRACEFUL SHUTDOWN FOR RELAY
  // ════════════════════════════════════════════════════════════════
  const shutdown = async (): Promise<void> => {
    logger.info("Shutting down KiteRelay (relay) gracefully.");
    try {
      bot.stopPolling();
      logger.info("✓ Telegram polling stopped");
    } catch (e) {
      logger.warn("Telegram stopPolling failed", e);
    }
    server.close(() => {
      logger.info("✓ HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Bootstrap worker mode: Job queue processing only
 */
async function bootstrapWorker(): Promise<void> {
  // ════════════════════════════════════════════════════════════════
  // CRITICAL SAFETY GUARD: WORKER MUST NOT POLL TELEGRAM
  // ════════════════════════════════════════════════════════════════
  if (config.telegramBotToken && config.enableTelegramPolling) {
    logger.error("FATAL: Telegram polling enabled in worker mode! This causes ETELEGRAM 409 conflict.");
    logger.error("Set IS_WORKER=true to disable polling, OR disable TELEGRAM_BOT_TOKEN in worker.");
    process.exit(1);
  }

  const app = express();
  setupMetrics(app);

  app.get("/", (req, res) => {
    res.json({ service: "kite-relay-worker", status: "ready", uptime: process.uptime() });
  });

  app.get("/healthcheck", (req, res) => {
    res.json({
      status: "healthy",
      role: "worker",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  try {
    // ════════════════════════════════════════════════════════════════
    // 1. CRITICAL: ALL DYNAMIC IMPORTS MUST BE FIRST
    // ════════════════════════════════════════════════════════════════
    const { initializeAgentStorage } = await import("./agentStorage");
    const { ExecutionWorker } = await import("./executionWorker");

    // ════════════════════════════════════════════════════════════════
    // 2. STARTUP DIAGNOSTICS
    // ════════════════════════════════════════════════════════════════
    const dbPath = config.databaseUrl;
    console.log("[BOOT] Mode: WORKER");
    console.log("[BOOT] Worker mode (IS_WORKER):", process.env.IS_WORKER);
    console.log("[BOOT] DB Path:", dbPath);
    console.log("[BOOT] Redis URL:", config.redisUrl || "redis://localhost:6379");
    console.log("[BOOT] ✓ Telegram polling: DISABLED");

    // ════════════════════════════════════════════════════════════════
    // 3. INITIALIZE AGENT STORAGE FIRST
    // ════════════════════════════════════════════════════════════════
    initializeAgentStorage(dbPath);
    logger.info({ dbPath }, "Agent storage initialized");

    // ════════════════════════════════════════════════════════════════
    // 4. INITIALIZE EXECUTION WORKER
    // ════════════════════════════════════════════════════════════════
    console.log("[BOOT] Initializing execution worker...");
    console.log("[BOOT] Redis URL:", config.redisUrl || "redis://localhost:6379");
    console.log("[BOOT] Queue Name: agent-scheduler");
    console.log("[BOOT] Worker Concurrency:", parseInt(process.env.WORKER_CONCURRENCY || "4", 10));
    
    let executionWorker: any;
    try {
      executionWorker = new ExecutionWorker({
        redisUrl: config.redisUrl || "redis://localhost:6379",
        queueName: "agent-scheduler",
        concurrency: parseInt(process.env.WORKER_CONCURRENCY || "4", 10),
        workerName: `worker-${process.pid}`,
      });
      console.log("[BOOT] ✓ ExecutionWorker instantiated");
    } catch (constructorError) {
      console.error("[BOOT] CONSTRUCTOR ERROR:", constructorError);
      throw constructorError;
    }

    try {
      await executionWorker.start();
      console.log("[BOOT] ✓ Execution worker started");
      logger.info("✓ Execution worker started");
    } catch (startError) {
      console.error("[BOOT] START ERROR:", startError);
      throw startError;
    }

    // ════════════════════════════════════════════════════════════════
    // 5. GRACEFUL SHUTDOWN HANDLER
    // ════════════════════════════════════════════════════════════════
    const shutdown = async (): Promise<void> => {
      logger.info("Shutting down KiteRelay (worker) gracefully.");
      try {
        await executionWorker.stop();
        logger.info("✓ Execution worker stopped");
      } catch (e) {
        logger.warn("Execution worker stop failed", e);
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    // ════════════════════════════════════════════════════════════════
    // RAW ERROR LOGGING (before logger)
    // ════════════════════════════════════════════════════════════════
    console.error("[BOOT] RAW ERROR:", error);
    console.error("[BOOT] Error type:", typeof error);
    console.error("[BOOT] Error toString:", String(error));
    
    if (error instanceof Error) {
      console.error("[BOOT] Error message:", error.message);
      console.error("[BOOT] Stack trace:", error.stack);
    } else if (error && typeof error === 'object') {
      console.error("[BOOT] Error object:", JSON.stringify(error, null, 2));
    }
    
    logger.error("Failed to initialize worker", { 
      error: error instanceof Error ? error.message : String(error),
      errorType: typeof error,
      errorStack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════
  // START HTTP OBSERVABILITY SERVER (only after worker init succeeds)
  // ════════════════════════════════════════════════════════════════
  const server = app.listen(config.port, config.host, () => {
    console.log("[BOOT] ✓ Worker HTTP observability server listening on", config.host + ":" + config.port);
    logger.info({ host: config.host, port: config.port }, "Worker HTTP observability server listening");
  });
}

bootstrap().catch((error) => {
  logger.error({ error }, "startup failed");
  process.exit(1);
});
