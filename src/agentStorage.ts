import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger";

/**
 * AGENT STORAGE LAYER
 * 
 * Provides persistent storage for autonomous agents and execution history.
 * Uses SQLite with better-sqlite3 for synchronous, embedded database.
 * 
 * Schema:
 * - agents: Agent definitions (schedule, command, config)
 * - agent_runs: Execution history and results
 * - agent_execution_logs: Detailed logs per execution
 */

export interface Agent {
  id: string;
  userId: number;
  name: string;
  goal: string;
  command: string;                        // e.g., "kpass wallet balance"
  commandArgs?: Record<string, string>;   // e.g., { "asset": "KITE" }
  schedule: string;                       // cron expression: "0 * * * *"
  scheduleType: "cron" | "interval";
  intervalSeconds?: number;               // for interval-based schedules
  timezone: string;                       // "UTC", "America/New_York", etc.
  enabled: boolean;
  maxRetries: number;
  timeoutSeconds: number;
  spendingLimitCents?: number;            // optional budget per run
  activeSessionId?: string;               // session to use for execution
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastError?: string;
  executionCount: number;
  failureCount: number;
}

export interface AgentRun {
  id: string;
  agentId: string;
  userId: number;
  status: "queued" | "running" | "success" | "failed" | "timeout";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  
  // Execution details
  commandExecuted?: string;
  commandArgs?: Record<string, string>;
  output?: string;                        // stdout/result
  error?: string;                         // stderr/error message
  exitCode?: number;
  
  // Economic tracking
  txHash?: string;
  explorerUrl?: string;
  costCents?: number;
  
  // Retry tracking
  retryCount: number;
  nextRetryAt?: string;
  
  createdAt: string;
}

export interface AgentExecutionLog {
  id: string;
  agentId: string;
  runId: string;
  userId: number;
  level: "info" | "warn" | "error";
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export class AgentStorage {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure parent directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
    }

    this.db = new Database(dbPath);
    
    // Enable foreign keys
    this.db.pragma("foreign_keys = ON");
    
    // Initialize schema
    this.initializeSchema();
    
    logger.info({ dbPath }, "AgentStorage initialized");
  }

  private initializeSchema(): void {
    // Create agents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        user_id INT NOT NULL,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        command TEXT NOT NULL,
        command_args TEXT,                  -- JSON string
        schedule TEXT NOT NULL,
        schedule_type TEXT NOT NULL,        -- 'cron' or 'interval'
        interval_seconds INT,
        timezone TEXT DEFAULT 'UTC',
        enabled BOOLEAN DEFAULT 1,
        max_retries INT DEFAULT 3,
        timeout_seconds INT DEFAULT 30,
        spending_limit_cents INT,
        active_session_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_run_at TEXT,
        next_run_at TEXT,
        last_error TEXT,
        execution_count INT DEFAULT 0,
        failure_count INT DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
      CREATE INDEX IF NOT EXISTS idx_agents_enabled ON agents(enabled);
    `);

    // Create agent_runs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        user_id INT NOT NULL,
        status TEXT NOT NULL,               -- 'queued', 'running', 'success', 'failed', 'timeout'
        started_at TEXT,
        completed_at TEXT,
        duration_ms INT,
        
        command_executed TEXT,
        command_args TEXT,                  -- JSON string
        output TEXT,
        error TEXT,
        exit_code INT,
        
        tx_hash TEXT,
        explorer_url TEXT,
        cost_cents INT,
        
        retry_count INT DEFAULT 0,
        next_retry_at TEXT,
        
        created_at TEXT NOT NULL,
        
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON agent_runs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id ON agent_runs(user_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at DESC);
    `);

    // Create agent_execution_logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_execution_logs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        user_id INT NOT NULL,
        level TEXT NOT NULL,                -- 'info', 'warn', 'error'
        message TEXT NOT NULL,
        metadata TEXT,                      -- JSON string
        created_at TEXT NOT NULL,
        
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_execution_logs_agent_id ON agent_execution_logs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_execution_logs_run_id ON agent_execution_logs(run_id);
    `);
  }

  // =====================================================================
  // AGENT OPERATIONS
  // =====================================================================

  createAgent(userId: number, data: Omit<Agent, "id" | "createdAt" | "updatedAt" | "executionCount" | "failureCount">): Agent {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO agents (
        id, user_id, name, goal, command, command_args, schedule, schedule_type,
        interval_seconds, timezone, enabled, max_retries, timeout_seconds,
        spending_limit_cents, active_session_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const commandArgsJson = data.commandArgs ? JSON.stringify(data.commandArgs) : null;

    stmt.run(
      id, userId, data.name, data.goal, data.command, commandArgsJson,
      data.schedule, data.scheduleType, data.intervalSeconds, data.timezone,
      data.enabled ? 1 : 0, data.maxRetries, data.timeoutSeconds,
      data.spendingLimitCents, data.activeSessionId, now, now
    );

    logger.info({ userId, agentId: id, name: data.name }, "Agent created");

    return {
      id,
      ...data,
      createdAt: now,
      updatedAt: now,
      executionCount: 0,
      failureCount: 0,
    };
  }

  getAgent(agentId: string): Agent | null {
    const stmt = this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `);

    const row = stmt.get(agentId) as any;
    if (!row) return null;

    return this.rowToAgent(row);
  }

  listAgentsByUser(userId: number): Agent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agents WHERE user_id = ? ORDER BY updated_at DESC
    `);

    const rows = stmt.all(userId) as any[];
    return rows.map(row => this.rowToAgent(row));
  }

  listEnabledAgents(): Agent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agents WHERE enabled = 1 ORDER BY next_run_at ASC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.rowToAgent(row));
  }

  updateAgent(agentId: string, updates: Partial<Omit<Agent, "id" | "userId" | "createdAt">>): Agent {
    const agent = this.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    const now = new Date().toISOString();
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    const allowedFields: (keyof Omit<Agent, "id" | "userId" | "createdAt">)[] = [
      "name", "goal", "command", "commandArgs", "schedule", "scheduleType",
      "intervalSeconds", "timezone", "enabled", "maxRetries", "timeoutSeconds",
      "spendingLimitCents", "activeSessionId", "lastRunAt", "nextRunAt",
      "lastError", "executionCount", "failureCount"
    ];

    for (const field of allowedFields) {
      if (field in updates && updates[field] !== undefined) {
        const colName = field === "commandArgs" ? "command_args" :
                       field === "scheduleType" ? "schedule_type" :
                       field === "intervalSeconds" ? "interval_seconds" :
                       field === "timeoutSeconds" ? "timeout_seconds" :
                       field === "spendingLimitCents" ? "spending_limit_cents" :
                       field === "activeSessionId" ? "active_session_id" :
                       field === "lastRunAt" ? "last_run_at" :
                       field === "nextRunAt" ? "next_run_at" :
                       field === "lastError" ? "last_error" :
                       field === "executionCount" ? "execution_count" :
                       field === "failureCount" ? "failure_count" :
                       field.toLowerCase();

        updateFields.push(`${colName} = ?`);
        
        const value = updates[field];
        if (field === "commandArgs") {
          updateValues.push(value ? JSON.stringify(value) : null);
        } else if (field === "enabled") {
          updateValues.push(value ? 1 : 0);
        } else {
          updateValues.push(value);
        }
      }
    }

    updateFields.push("updated_at = ?");
    updateValues.push(now);
    updateValues.push(agentId);

    const sql = `UPDATE agents SET ${updateFields.join(", ")} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...updateValues);

    logger.debug({ agentId, updates }, "Agent updated");

    return this.getAgent(agentId)!;
  }

  deleteAgent(agentId: string): void {
    const stmt = this.db.prepare("DELETE FROM agents WHERE id = ?");
    stmt.run(agentId);
    logger.info({ agentId }, "Agent deleted");
  }

  // =====================================================================
  // AGENT RUN OPERATIONS
  // =====================================================================

  createRun(agentId: string, userId: number, data: Omit<AgentRun, "id" | "createdAt">): AgentRun {
    const id = uuidv4();
    const now = new Date().toISOString();

    const commandArgsJson = data.commandArgs ? JSON.stringify(data.commandArgs) : null;

    const stmt = this.db.prepare(`
      INSERT INTO agent_runs (
        id, agent_id, user_id, status, started_at, completed_at, duration_ms,
        command_executed, command_args, output, error, exit_code,
        tx_hash, explorer_url, cost_cents, retry_count, next_retry_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, agentId, userId, data.status, data.startedAt, data.completedAt,
      data.durationMs, data.commandExecuted, commandArgsJson, data.output,
      data.error, data.exitCode, data.txHash, data.explorerUrl,
      data.costCents, data.retryCount, data.nextRetryAt, now
    );

    logger.debug({ agentId, runId: id, status: data.status }, "Agent run created");

    return {
      id,
      ...data,
      createdAt: now,
    };
  }

  getRun(runId: string): AgentRun | null {
    const stmt = this.db.prepare("SELECT * FROM agent_runs WHERE id = ?");
    const row = stmt.get(runId) as any;
    if (!row) return null;

    return this.rowToAgentRun(row);
  }

  updateRun(runId: string, updates: Partial<Omit<AgentRun, "id" | "agentId" | "userId" | "createdAt">>): AgentRun {
    const run = this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const updateFields: string[] = [];
    const updateValues: any[] = [];

    const fieldsMap: Record<string, string> = {
      status: "status",
      startedAt: "started_at",
      completedAt: "completed_at",
      durationMs: "duration_ms",
      commandExecuted: "command_executed",
      commandArgs: "command_args",
      output: "output",
      error: "error",
      exitCode: "exit_code",
      txHash: "tx_hash",
      explorerUrl: "explorer_url",
      costCents: "cost_cents",
      retryCount: "retry_count",
      nextRetryAt: "next_retry_at",
    };

    for (const [fieldName, colName] of Object.entries(fieldsMap)) {
      if (fieldName in updates && updates[fieldName as keyof typeof updates] !== undefined) {
        updateFields.push(`${colName} = ?`);
        const value = updates[fieldName as keyof typeof updates];
        
        if (fieldName === "commandArgs") {
          updateValues.push(value ? JSON.stringify(value) : null);
        } else {
          updateValues.push(value);
        }
      }
    }

    if (updateFields.length === 0) return run;

    const sql = `UPDATE agent_runs SET ${updateFields.join(", ")} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    updateValues.push(runId);
    stmt.run(...updateValues);

    logger.debug({ runId, updates }, "Agent run updated");

    return this.getRun(runId)!;
  }

  listRunsByAgent(agentId: string, limit: number = 50): AgentRun[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
    `);

    const rows = stmt.all(agentId, limit) as any[];
    return rows.map(row => this.rowToAgentRun(row));
  }

  listFailedRuns(agentId: string): AgentRun[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_runs WHERE agent_id = ? AND status IN ('failed', 'timeout')
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(agentId) as any[];
    return rows.map(row => this.rowToAgentRun(row));
  }

  countRunsByStatus(agentId: string): Record<string, number> {
    const stmt = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM agent_runs WHERE agent_id = ? GROUP BY status
    `);

    const rows = stmt.all(agentId) as any[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = row.count;
    }
    return result;
  }

  // =====================================================================
  // EXECUTION LOG OPERATIONS
  // =====================================================================

  appendExecutionLog(agentId: string, runId: string, userId: number, level: string, message: string, metadata?: Record<string, unknown>): AgentExecutionLog {
    const id = uuidv4();
    const now = new Date().toISOString();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO agent_execution_logs (id, agent_id, run_id, user_id, level, message, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, agentId, runId, userId, level, message, metadataJson, now);

    return {
      id,
      agentId,
      runId,
      userId,
      level: level as "info" | "warn" | "error",
      message,
      metadata,
      createdAt: now,
    };
  }

  listExecutionLogs(runId: string): AgentExecutionLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_execution_logs WHERE run_id = ? ORDER BY created_at ASC
    `);

    const rows = stmt.all(runId) as any[];
    return rows.map(row => this.rowToExecutionLog(row));
  }

  // =====================================================================
  // HELPER CONVERSIONS
  // =====================================================================

  private rowToAgent(row: any): Agent {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      goal: row.goal,
      command: row.command,
      commandArgs: row.command_args ? JSON.parse(row.command_args) : undefined,
      schedule: row.schedule,
      scheduleType: row.schedule_type,
      intervalSeconds: row.interval_seconds,
      timezone: row.timezone,
      enabled: row.enabled === 1,
      maxRetries: row.max_retries,
      timeoutSeconds: row.timeout_seconds,
      spendingLimitCents: row.spending_limit_cents,
      activeSessionId: row.active_session_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      lastError: row.last_error,
      executionCount: row.execution_count,
      failureCount: row.failure_count,
    };
  }

  private rowToAgentRun(row: any): AgentRun {
    return {
      id: row.id,
      agentId: row.agent_id,
      userId: row.user_id,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
      commandExecuted: row.command_executed,
      commandArgs: row.command_args ? JSON.parse(row.command_args) : undefined,
      output: row.output,
      error: row.error,
      exitCode: row.exit_code,
      txHash: row.tx_hash,
      explorerUrl: row.explorer_url,
      costCents: row.cost_cents,
      retryCount: row.retry_count,
      nextRetryAt: row.next_retry_at,
      createdAt: row.created_at,
    };
  }

  private rowToExecutionLog(row: any): AgentExecutionLog {
    return {
      id: row.id,
      agentId: row.agent_id,
      runId: row.run_id,
      userId: row.user_id,
      level: row.level,
      message: row.message,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
    };
  }

  // =====================================================================
  // MAINTENANCE
  // =====================================================================

  close(): void {
    this.db.close();
    logger.info("AgentStorage closed");
  }
}

// Singleton instance
let storageInstance: AgentStorage | null = null;

export function initializeAgentStorage(dbPath: string): AgentStorage {
  if (!storageInstance) {
    storageInstance = new AgentStorage(dbPath);
  }
  return storageInstance;
}

export function getAgentStorage(): AgentStorage {
  if (!storageInstance) {
    throw new Error("AgentStorage not initialized. Call initializeAgentStorage() first.");
  }
  return storageInstance;
}
