import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import parser from "cron-parser";
import { getAgentStorage } from "./agentStorage";
import { logger } from "./logger";

/**
 * SCHEDULER ENGINE
 * 
 * Manages autonomous agent scheduling using BullMQ + Redis.
 * 
 * Responsibilities:
 * - Parse cron expressions and interval schedules
 * - Queue jobs at appropriate times
 * - Persist queue state in Redis
 * - Coordinate with execution workers
 * - Handle retries and backoff
 */

export interface ScheduledAgentJob {
  agentId: string;
  userId: number;
  command: string;
  commandArgs?: Record<string, string>;
  timeout: number;                        // milliseconds
  maxRetries: number;
  spendingLimit?: number;
  sessionId?: string;
}

export interface SchedulerConfig {
  redisUrl: string;
  queueName: string;
  maxConcurrency: number;
  retryBackoffBase: number;               // milliseconds
  retryBackoffMultiplier: number;
}

export class AgentScheduler {
  private redis: Redis;
  private queue: Queue<ScheduledAgentJob>;
  private config: SchedulerConfig;
  private isRunning: boolean = false;

  constructor(config: SchedulerConfig) {
    this.config = config;
    // CRITICAL: BullMQ requires maxRetriesPerRequest to be null
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    
    this.queue = new Queue<ScheduledAgentJob>(config.queueName, {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 1,                       // We handle retries ourselves
        removeOnComplete: false,           // Keep history
        removeOnFail: false,               // Keep failure logs
      },
    });

    logger.info({ queueName: config.queueName }, "AgentScheduler initialized");
  }

  /**
   * Start the scheduler background loop
   * Periodically checks agents and queues jobs whose time has come
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Scheduler already running");
      return;
    }

    this.isRunning = true;
    logger.info("AgentScheduler starting background loop");

    // Start the periodic scheduling loop
    this.scheduleCheckLoop();
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    await this.queue.close();
    this.redis.disconnect();
    logger.info("AgentScheduler stopped");
  }

  /**
   * Main scheduling loop - runs every 10 seconds
   * Checks all enabled agents and queues jobs if it's time to run
   */
  private scheduleCheckLoop(): void {
    const check = async () => {
      try {
        const storage = getAgentStorage();
        const agents = storage.listEnabledAgents();
        const now = new Date();

        for (const agent of agents) {
          // Check if it's time to run this agent
          if (agent.nextRunAt && new Date(agent.nextRunAt) <= now) {
            await this.queueAgentJob(agent.id);
          }
        }
      } catch (error) {
        logger.error({ error }, "Error in scheduler loop");
      }

      // Run check again in 10 seconds
      if (this.isRunning) {
        setTimeout(check, 10000);
      }
    };

    // Start the loop
    check();
  }

  /**
   * Queue a job for immediate execution
   */
  async queueAgentJob(agentId: string): Promise<string> {
    const storage = getAgentStorage();
    const agent = storage.getAgent(agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!agent.enabled) {
      throw new Error(`Agent is disabled: ${agentId}`);
    }

    const jobId = `${agentId}-${Date.now()}`;
    const job = await this.queue.add(
      `agent-${agentId}`,
      {
        agentId: agent.id,
        userId: agent.userId,
        command: agent.command,
        commandArgs: agent.commandArgs,
        timeout: agent.timeoutSeconds * 1000,
        maxRetries: agent.maxRetries,
        spendingLimit: agent.spendingLimitCents,
        sessionId: agent.activeSessionId,
      },
      {
        jobId,
        attempts: 1,                       // BullMQ attempts; we handle retries
        backoff: {
          type: "exponential",
          delay: this.config.retryBackoffBase,
        },
      }
    );

    logger.info({ agentId, jobId }, "Agent job queued");

    // Update agent's next_run_at based on schedule
    this.calculateNextRun(agent.id);

    return jobId;
  }

  /**
   * Calculate and update the next run time for an agent
   */
  private calculateNextRun(agentId: string): void {
    const storage = getAgentStorage();
    const agent = storage.getAgent(agentId);

    if (!agent) {
      logger.warn({ agentId }, "Agent not found when calculating next run");
      return;
    }

    let nextRunAt: Date;

    if (agent.scheduleType === "cron") {
      try {
        const interval = parser.parseExpression(agent.schedule, {
          tz: agent.timezone,
        });
        nextRunAt = interval.next().toDate();
      } catch (error) {
        logger.error({ agentId, schedule: agent.schedule, error }, "Invalid cron expression");
        storage.updateAgent(agentId, {
          lastError: `Invalid cron expression: ${agent.schedule}`,
          enabled: false,
        });
        return;
      }
    } else if (agent.scheduleType === "interval" && agent.intervalSeconds) {
      nextRunAt = new Date(Date.now() + agent.intervalSeconds * 1000);
    } else {
      logger.warn({ agentId }, "Cannot determine next run: invalid schedule type");
      return;
    }

    storage.updateAgent(agentId, {
      nextRunAt: nextRunAt.toISOString(),
    });

    logger.debug({ agentId, nextRunAt }, "Next run calculated");
  }

  /**
   * Parse a user description into schedule components
   * 
   * Examples:
   * - "every hour" → { interval: 3600 }
   * - "daily at 9am" → { cron: "0 9 * * *" }
   * - "every 10 minutes" → { interval: 600 }
   * 
   * Note: Phase 3 will enhance this with LLM-based parsing
   */
  parseScheduleDescription(description: string): { cron?: string; interval?: number; type: "cron" | "interval" } {
    const desc = description.toLowerCase().trim();

    // Interval patterns
    if (desc.includes("every hour") || desc === "hourly") {
      return { interval: 3600, type: "interval" };
    }
    if (desc.includes("every 30 minutes")) {
      return { interval: 1800, type: "interval" };
    }
    if (desc.includes("every 10 minutes")) {
      return { interval: 600, type: "interval" };
    }
    if (desc.includes("every 5 minutes")) {
      return { interval: 300, type: "interval" };
    }
    if (desc.includes("every minute")) {
      return { interval: 60, type: "interval" };
    }

    // Cron patterns
    if (desc.includes("daily") || desc === "every day") {
      return { cron: "0 0 * * *", type: "cron" };  // Midnight
    }
    if (desc.includes("hourly")) {
      return { cron: "0 * * * *", type: "cron" };  // Top of hour
    }
    if (desc.includes("weekly")) {
      return { cron: "0 0 * * 0", type: "cron" };  // Sunday midnight
    }

    // Default: every hour
    return { interval: 3600, type: "interval" };
  }

  /**
   * Parse command from user description
   * 
   * Examples:
   * - "Check KITE balance" → { command: "kpass", args: ["wallet", "balance"] }
   * - "Search for AI grants" → { command: "ksearch", args: ["AI grants"] }
   * 
   * Note: Phase 3 will enhance this with LLM-based parsing
   */
  parseCommand(description: string): { command: string; args: string[] } {
    const desc = description.toLowerCase().trim();

    if (desc.includes("balance") || desc.includes("wallet")) {
      return { command: "kpass", args: ["wallet", "balance"] };
    }
    if (desc.includes("transfer") || desc.includes("send")) {
      return { command: "kpass", args: ["wallet", "transfer"] };
    }
    if (desc.includes("search") || desc.includes("find")) {
      const terms = desc.replace(/search|find/gi, "").trim();
      return { command: "ksearch", args: terms ? [terms] : [""] };
    }

    // Default: wallet balance
    return { command: "kpass", args: ["wallet", "balance"] };
  }

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<{
    queued: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  }> {
    const counts = await this.queue.getJobCounts(
      "wait",
      "active",
      "delayed",
      "failed",
      "completed"
    );

    return {
      queued: counts.wait,
      active: counts.active,
      delayed: counts.delayed,
      failed: counts.failed,
      completed: counts.completed,
    };
  }

  /**
   * Get pending jobs for a specific agent
   */
  async getPendingJobsForAgent(agentId: string): Promise<number> {
    const jobs = await this.queue.getJobs(
      ["wait", "active", "delayed"],
      0,
      -1
    );

    return jobs.filter(j => {
      const data = j.data as ScheduledAgentJob;
      return data.agentId === agentId;
    }).length;
  }

  /**
   * Get the queue instance (for workers to consume)
   */
  getQueue(): Queue<ScheduledAgentJob> {
    return this.queue;
  }
}

// Singleton instance
let schedulerInstance: AgentScheduler | null = null;

export function initializeScheduler(config: SchedulerConfig): AgentScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new AgentScheduler(config);
  }
  return schedulerInstance;
}

export function getScheduler(): AgentScheduler {
  if (!schedulerInstance) {
    throw new Error("Scheduler not initialized. Call initializeScheduler() first.");
  }
  return schedulerInstance;
}
