import { Worker, UnrecoverableError } from "bullmq";
import { Redis } from "ioredis";
import { executeKpass, executeKsearch } from "./userRuntime";
import { getAgentStorage, AgentRun } from "./agentStorage";
import { getScheduler, ScheduledAgentJob } from "./scheduler";
import { buyAirtimeFlow, buyDataFlow } from "./commerceService";
import { readUserProfile } from "./storage";
import { logger } from "./logger";
import { config } from "./config";

/**
 * EXECUTION WORKER
 * 
 * Consumes jobs from BullMQ queue and executes them in isolated user runtimes.
 * 
 * Flow:
 * 1. Pop job from queue
 * 2. Load agent configuration
 * 3. Execute in user's isolated runtime (HOME=/data/users/<userId>/)
 * 4. Capture output, errors, duration
 * 5. Update execution logs and agent status
 * 6. Queue retry if needed
 * 7. Send Telegram notification
 * 
 * Key Principle: Each job runs in its own process with complete isolation.
 */

export interface WorkerConfig {
  redisUrl: string;
  queueName: string;
  concurrency: number;
  workerName: string;
}

export class ExecutionWorker {
  private worker: Worker<ScheduledAgentJob> | null = null;
  private config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.config = config;
  }

  /**
   * Start the worker
   * Consumes jobs from the BullMQ queue and processes them
   */
  async start(): Promise<void> {
    // CRITICAL: BullMQ requires maxRetriesPerRequest to be null
    // This prevents Redis connection pool issues with blocking commands
    const redis = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.worker = new Worker<ScheduledAgentJob>(
      this.config.queueName,
      async (job) => {
        return this.processJob(job.data);
      },
      {
        connection: redis,
        concurrency: this.config.concurrency,
        lockDuration: 30000,                // 30 second lock
        lockRenewTime: 5000,                // Renew every 5 seconds
      }
    );

    this.worker.on("completed", (job) => {
      logger.info({ jobId: job.id, agentId: job.data.agentId }, "Job completed");
    });

    this.worker.on("failed", (job, error) => {
      logger.error({ jobId: job?.id, error: error.message }, "Job failed");
    });

    logger.info({ queueName: this.config.queueName, concurrency: this.config.concurrency }, "ExecutionWorker started");
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      logger.info("ExecutionWorker stopped");
    }
  }

  /**
   * Main job processing function
   * Executes the agent's command and handles success/failure
   */
  private async processJob(jobData: ScheduledAgentJob): Promise<{ success: boolean; output: string }> {
    const { agentId, userId, command, commandArgs, timeout, maxRetries } = jobData;
    const storage = getAgentStorage();
    const startTime = Date.now();

    logger.info({ agentId, userId, command }, "Processing agent job");

    // Create run record
    let run: AgentRun = storage.createRun(agentId, userId, {
      status: "running",
      startedAt: new Date().toISOString(),
      userId,   // user who triggered the job
      agentId,  // agent being executed
      commandExecuted: command,
      commandArgs,
      retryCount: 0,
    });

    try {
      // Enforce timeout
      const result = await this.executeWithTimeout(command, commandArgs, userId, timeout);

      const duration = Date.now() - startTime;

      // Update run with success
      run = storage.updateRun(run.id, {
        status: "success",
        completedAt: new Date().toISOString(),
        durationMs: duration,
        output: result.output,
        exitCode: 0,
      });

      // Update agent status
      storage.updateAgent(agentId, {
        lastRunAt: new Date().toISOString(),
        executionCount: (storage.getAgent(agentId)?.executionCount || 0) + 1,
        lastError: undefined,
      });

      // Recalculate next run
      const scheduler = getScheduler();
      (scheduler as any).calculateNextRun(agentId);

      // Log execution
      storage.appendExecutionLog(agentId, run.id, userId, "info", "Agent executed successfully", {
        command,
        duration,
      });

      logger.info({ agentId, duration }, "Agent job completed successfully");

      return { success: true, output: result.output };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      logger.error({ agentId, error: errorMsg, duration }, "Agent job failed");

      // Update run with failure
      run = storage.updateRun(run.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        durationMs: duration,
        error: errorMsg,
        retryCount: 0,
      });

      // Log error
      storage.appendExecutionLog(agentId, run.id, userId, "error", `Execution failed: ${errorMsg}`, {
        command,
        duration,
      });

      // Update agent
      const agent = storage.getAgent(agentId);
      if (agent) {
        storage.updateAgent(agentId, {
          failureCount: (agent.failureCount || 0) + 1,
          lastError: errorMsg,
        });
      }

      // Queue retry if retries available
      if ((run.retryCount || 0) < maxRetries) {
        await this.queueRetry(agentId, run.id, run.retryCount + 1, maxRetries);
      }

      throw new UnrecoverableError(errorMsg);
    }
  }

  /**
   * Execute command with timeout enforcement
   */
  private async executeWithTimeout(
    command: string,
    commandArgs: Record<string, string> | undefined,
    userId: number,
    timeoutMs: number
  ): Promise<{ output: string }> {
    return Promise.race([
      this.executeCommand(command, commandArgs, userId),
      new Promise<{ output: string }>((_, reject) =>
        setTimeout(() => reject(new Error("Execution timeout")), timeoutMs)
      ),
    ]);
  }

  /**
   * Execute the actual command
   * Routes to kpass or ksearch based on command type
   */
  private async executeCommand(
    command: string,
    commandArgs: Record<string, string> | undefined,
    userId: number
  ): Promise<{ output: string }> {
    try {
      let output: string;

      if (command === "kpass") {
        // Example: kpass wallet balance
        const args = ["wallet", "balance"];
        if (commandArgs?.asset) {
          args.push("--asset", commandArgs.asset);
        }
        output = await executeKpass(userId, args, "agent-kpass");
      } else if (command === "ksearch") {
        // Example: ksearch services list --query "AI grants" --output json
        const query = commandArgs?.query || "query";
        const args = ["services", "list", "--query", query, "--asset", "USDC", "--limit", "10", "--output", "json"];
        output = await executeKsearch(userId, args, "agent-ksearch");
      } else if (command === "commerce") {
        // commerce agent commands: delegate to commerceService flows
        const type = (commandArgs && (commandArgs as any).type) || "airtime";
        const provider = (commandArgs && (commandArgs as any).provider) || "";
        const amountRaw = (commandArgs && (commandArgs as any).amountNGN) || (commandArgs && (commandArgs as any).amount) || 0;
        const recipientArg = (commandArgs && (commandArgs as any).recipient) || undefined;

        // Resolve recipient: if undefined, attempt to read user's profile phone
        let recipient = recipientArg;
        if (!recipient) {
          try {
            const profile = readUserProfile(userId, config.userDataRoot);
            recipient = (profile as any).phone || (profile as any).contact?.phone || undefined;
          } catch {
            recipient = undefined;
          }
        }

        const amountNGN = parseInt(String(amountRaw), 10) || 0;

        if (type === "airtime") {
          if (!recipient) throw new Error("No recipient phone available for airtime purchase");
          const res = await buyAirtimeFlow(userId, String(recipient), amountNGN, String(provider), (commandArgs && (commandArgs as any).sessionId) );
          output = res.output;
        } else if (type === "data") {
          if (!recipient) throw new Error("No recipient phone available for data purchase");
          const res = await buyDataFlow(userId, String(recipient), amountNGN, String(provider), (commandArgs && (commandArgs as any).sessionId));
          output = res.output;
        } else {
          throw new Error(`Unsupported commerce type: ${type}`);
        }
      } else {
        throw new Error(`Unknown command: ${command}`);
      }

      return { output };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Command execution failed: ${errorMsg}`);
    }
  }

  /**
   * Queue a retry for a failed job
   */
  private async queueRetry(
    agentId: string,
    runId: string,
    retryCount: number,
    maxRetries: number
  ): Promise<void> {
    const storage = getAgentStorage();
    const agent = storage.getAgent(agentId);

    if (!agent) {
      logger.warn({ agentId }, "Cannot queue retry: agent not found");
      return;
    }

    // Calculate backoff delay
    const baseDelay = 1000;                // 1 second
    const multiplier = 2;
    const delay = baseDelay * Math.pow(multiplier, retryCount - 1);

    const nextRetryAt = new Date(Date.now() + delay);

    // Update run with retry info
    storage.updateRun(runId, {
      status: "queued",
      retryCount,
      nextRetryAt: nextRetryAt.toISOString(),
    });

    logger.info(
      { agentId, runId, retryCount, maxRetries, delayMs: delay },
      "Retry queued"
    );

    // Note: Actual requeue happens via scheduler when nextRetryAt is reached
  }

  /**
   * Get worker status
   */
  async getWorkerStatus(): Promise<{
    isRunning: boolean;
    concurrency: number;
    queueName: string;
  }> {
    return {
      isRunning: !!this.worker,
      concurrency: this.config.concurrency,
      queueName: this.config.queueName,
    };
  }
}

/**
 * Boot the execution worker
 * This is typically called from executionWorker.ts entry point
 */
export async function startExecutionWorker(): Promise<ExecutionWorker> {
  const worker = new ExecutionWorker({
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    queueName: "agent-scheduler",
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "4", 10),
    workerName: `worker-${process.pid}`,
  });

  await worker.start();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down execution worker");
    await worker.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return worker;
}

// Export ScheduledAgentJob for typing
export type { ScheduledAgentJob };
