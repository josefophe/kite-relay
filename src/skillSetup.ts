/**
 * SKILL SETUP MANAGER
 * 
 * Centralized management of Kite Passport skill setup.
 * Ensures all skills have been initialized before use.
 */

import { spawn } from "child_process";
import { logger } from "./logger";
import Database from "better-sqlite3";
import path from "path";
import { config } from "./config";

export interface SkillSetupStatus {
  skillName: string;
  installed: boolean;
  version?: string;
  lastChecked: Date;
  error?: string;
}

export class SkillSetupManager {
  private db: Database.Database;

  constructor(dbPath: string = config.databaseUrl) {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  /**
   * Initialize SQLite schema for skill tracking
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_setup (
        id INTEGER PRIMARY KEY,
        skillName TEXT UNIQUE NOT NULL,
        installed BOOLEAN DEFAULT 0,
        version TEXT,
        lastChecked INTEGER,
        error TEXT
      )
    `);
  }

  /**
   * Check if a skill is set up and ready to use
   */
  isSkillReady(skillName: string): boolean {
    try {
      const row = this.db
        .prepare("SELECT installed FROM skill_setup WHERE skillName = ?")
        .get(skillName) as any;

      if (!row) {
        return false;
      }

      return !!row.installed;
    } catch (error) {
      logger.warn({ skillName, error }, "Failed to check skill setup status");
      return false;
    }
  }

  /**
   * Mark a skill as ready
   */
  markSkillReady(skillName: string, version?: string): void {
    try {
      this.db
        .prepare(
          `
        INSERT INTO skill_setup (skillName, installed, version, lastChecked)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(skillName) DO UPDATE SET
          installed = 1,
          version = COALESCE(excluded.version, version),
          lastChecked = excluded.lastChecked
      `
        )
        .run(skillName, version || null, Date.now());

      logger.info({ skillName, version }, "Skill marked ready");
    } catch (error) {
      logger.error({ skillName, error }, "Failed to mark skill ready");
    }
  }

  /**
   * Mark a skill as failed to set up
   */
  markSkillFailed(skillName: string, error: string): void {
    try {
      this.db
        .prepare(
          `
        INSERT INTO skill_setup (skillName, installed, error, lastChecked)
        VALUES (?, 0, ?, ?)
        ON CONFLICT(skillName) DO UPDATE SET
          installed = 0,
          error = excluded.error,
          lastChecked = excluded.lastChecked
      `
        )
        .run(skillName, error, Date.now());

      logger.warn({ skillName, error }, "Skill marked failed");
    } catch (error) {
      logger.error({ skillName, error }, "Failed to mark skill failed");
    }
  }

  /**
   * Get all skill setup statuses
   */
  getAllSkillStatuses(): SkillSetupStatus[] {
    try {
      const rows = this.db
        .prepare("SELECT * FROM skill_setup ORDER BY skillName")
        .all() as any[];

      return rows.map((row) => ({
        skillName: row.skillName,
        installed: !!row.installed,
        version: row.version,
        lastChecked: new Date(row.lastChecked),
        error: row.error,
      }));
    } catch (error) {
      logger.error({ error }, "Failed to get skill statuses");
      return [];
    }
  }

  /**
   * Check if all critical skills are ready
   */
  areAllCriticalSkillsReady(): boolean {
    const criticalSkills = [
      "authenticate-user",
      "kite-discovery",
      "request-session",
      "x402-execute",
      "wallet-send",
      "manage-agents",
    ];

    return criticalSkills.every((skill) => this.isSkillReady(skill));
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Global instance
let setupManager: SkillSetupManager | null = null;

export function getSkillSetupManager(): SkillSetupManager {
  if (!setupManager) {
    setupManager = new SkillSetupManager();
  }
  return setupManager;
}

/**
 * Run skill setup script
 * Returns true if setup succeeded
 */
export async function runSkillSetup(skillName: string, skillDir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const setupScript = path.join(skillDir, "scripts", "setup.sh");

    const proc = spawn("bash", [setupScript], {
      cwd: skillDir,
      timeout: 30000, // 30 second timeout
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      const manager = getSkillSetupManager();

      if (code === 0) {
        logger.info({ skillName }, "Skill setup succeeded");
        manager.markSkillReady(skillName);
        resolve(true);
      } else {
        const error = stderr || stdout || `Setup failed with code ${code}`;
        logger.error({ skillName, error }, "Skill setup failed");
        manager.markSkillFailed(skillName, error);
        resolve(false);
      }
    });

    proc.on("error", (error) => {
      const manager = getSkillSetupManager();
      manager.markSkillFailed(skillName, error.message);
      logger.error({ skillName, error }, "Skill setup error");
      resolve(false);
    });
  });
}
