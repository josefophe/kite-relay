/**
 * EXECUTION WORKER ENTRY POINT
 * 
 * Start as: npm run worker
 * 
 * This process runs independently and consumes jobs from the BullMQ queue.
 * Multiple worker instances can run in parallel for scaling.
 */

import { startExecutionWorker } from "./executionWorker";
import { initializeAgentStorage } from "./agentStorage";
import { initializeScheduler } from "./scheduler";
import { config } from "./config";
import { logger } from "./logger";

async function bootstrap(): Promise<void> {
  try {
    logger.info("Execution Worker booting...");

    // Initialize storage
    const dbPath = process.env.DATABASE_URL || "sqlite:///data/agents.db";
    initializeAgentStorage(dbPath);
    logger.info("Agent storage initialized");

    // Initialize scheduler (even though worker doesn't queue jobs, it uses scheduler utilities)
    initializeScheduler({
      redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
      queueName: "agent-scheduler",
      maxConcurrency: parseInt(process.env.WORKER_CONCURRENCY || "4", 10),
      retryBackoffBase: 1000,
      retryBackoffMultiplier: 2,
    });

    // Start worker
    const worker = await startExecutionWorker();
    logger.info("Execution worker started successfully");

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    logger.error({ error }, "Worker bootstrap failed");
    process.exit(1);
  }
}

bootstrap();
