/**
 * DEBUGGING UTILITIES
 * 
 * Diagnostic tools for troubleshooting KiteRelay runtime issues.
 * Includes DB inspection, permission checking, agent validation, and more.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { logger } from "./logger";
import { config } from "./config";
import { readUserProfile } from "./storage";

export interface DebugInfo {
  serviceRole: "relay" | "worker";
  databasePath: string;
  userDataRoot: string;
  userProfileExists: boolean;
  agentDatabaseExists: boolean;
  permissionsOk: boolean;
  kpassAvailable: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive runtime debug info for a user
 */
export function getUserDebugInfo(userId: number): DebugInfo {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract database path from DATABASE_URL
  let databasePath = config.databaseUrl;
  if (databasePath.includes("sqlite://")) {
    databasePath = databasePath.replace("sqlite:///", "/").replace("sqlite://", "");
  }

  const userDataDir = path.join(config.userDataRoot, String(userId));
  const agentDbPath = databasePath;

  // Check user profile exists
  let profileExists = false;
  try {
    const profile = readUserProfile(userId, config.userDataRoot);
    profileExists = !!profile;
  } catch {
    warnings.push("User profile not found - user may not be authenticated");
  }

  // Check if agent database exists
  let agentDbExists = false;
  if (fs.existsSync(agentDbPath)) {
    agentDbExists = true;
  } else {
    warnings.push(`Agent database not found at ${agentDbPath}`);
  }

  // Check permissions
  let permsOk = false;
  try {
    const testFile = path.join(config.userDataRoot, `.test-${userId}`);
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    permsOk = true;
  } catch (e) {
    errors.push(`User data directory not writable: ${config.userDataRoot}`);
  }

  // Check kpass availability
  let kpassOk = false;
  try {
    execSync(`${config.kpassBinary} --version`, { stdio: "pipe", timeout: 5000 });
    kpassOk = true;
  } catch {
    warnings.push(`kpass binary not available at ${config.kpassBinary}`);
  }

  return {
    serviceRole: config.isRelay ? "relay" : "worker",
    databasePath: agentDbPath,
    userDataRoot: config.userDataRoot,
    userProfileExists: profileExists,
    agentDatabaseExists: agentDbExists,
    permissionsOk: permsOk,
    kpassAvailable: kpassOk,
    errors,
    warnings,
  };
}

/**
 * Format debug info for Telegram display
 */
export function formatDebugInfo(userId: number): string {
  const info = getUserDebugInfo(userId);

  let message = `🔧 *KiteRelay Debug Information*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  message += `📍 *Service Configuration*\n`;
  message += `• Role: ${info.serviceRole === "relay" ? "🟢 RELAY" : "⚙️ WORKER"}\n`;
  message += `• User ID: ${userId}\n\n`;

  message += `💾 *Database*\n`;
  message += `• Path: \`${info.databasePath}\`\n`;
  message += `• Exists: ${info.agentDatabaseExists ? "✅" : "❌"}\n`;
  message += `• Readable: ${info.permissionsOk ? "✅" : "❌"}\n\n`;

  message += `👤 *User State*\n`;
  message += `• Profile: ${info.userProfileExists ? "✅ Authenticated" : "❌ Not authenticated"}\n`;
  message += `• Data Root: \`${info.userDataRoot}\`\n\n`;

  message += `🔧 *Tools*\n`;
  message += `• kpass: ${info.kpassAvailable ? "✅ Available" : "❌ Not found"}\n\n`;

  if (info.errors.length > 0) {
    message += `❌ *ERRORS*\n`;
    for (const err of info.errors) {
      message += `• ${err}\n`;
    }
    message += `\n`;
  }

  if (info.warnings.length > 0) {
    message += `⚠️ *Warnings*\n`;
    for (const warn of info.warnings) {
      message += `• ${warn}\n`;
    }
    message += `\n`;
  }

  message += `📋 *Recovery Steps*\n`;
  if (!info.userProfileExists) {
    message += `1. Authenticate: /login email@domain.com\n`;
  }
  if (!info.agentDatabaseExists) {
    message += `1. Database will auto-create on first agent action\n`;
    message += `2. Or run: /agent-register\n`;
  }
  if (!info.kpassAvailable) {
    message += `1. Install kpass (see KPASS_SETUP.md)\n`;
    message += `2. Or provide via Docker volume mount\n`;
  }

  return message;
}

/**
 * Check worker health (called from worker process only)
 */
export function getWorkerHealth(): {
  healthy: boolean;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  errors: string[];
} {
  const errors: string[] = [];
  const memoryUsage = process.memoryUsage();

  // Check if worker can access database
  if (!fs.existsSync(config.databaseUrl.replace("sqlite:///", "/"))) {
    errors.push("Database not accessible");
  }

  // Check if Redis is reachable (basic validation)
  // This would require actual connection test

  return {
    healthy: errors.length === 0,
    uptime: process.uptime(),
    memoryUsage,
    errors,
  };
}

/**
 * Format worker health for display
 */
export function formatWorkerHealth(): string {
  const health = getWorkerHealth();

  const uptime = Math.floor(health.uptime);
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);
  const uptimeSeconds = uptime % 60;

  const memMB = Math.round(health.memoryUsage.heapUsed / 1024 / 1024);

  let message = `⚙️ *Worker Health*\n`;
  message += `━━━━━━━━━━━━━━━\n\n`;

  message += `📊 *Status*\n`;
  message += `• Healthy: ${health.healthy ? "✅ YES" : "❌ NO"}\n`;
  message += `• Uptime: ${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s\n`;
  message += `• Memory: ${memMB} MB\n\n`;

  if (!health.healthy && health.errors.length > 0) {
    message += `❌ *Issues Detected*\n`;
    for (const err of health.errors) {
      message += `• ${err}\n`;
    }
  }

  return message;
}

/**
 * Validate agent registry and report issues
 */
export function validateAgentRegistry(): {
  valid: boolean;
  agentCount: number;
  errors: string[];
} {
  const errors: string[] = [];
  let agentCount = 0;

  try {
    // Try to import and check agent storage
    const { getAgentStorage } = require("./agentStorage");
    const storage = getAgentStorage();

    if (!storage) {
      errors.push("Agent storage not initialized");
      return { valid: false, agentCount: 0, errors };
    }

    // List all agents to verify database is working
    const allAgents = storage.listAllAgents ? storage.listAllAgents() : [];
    agentCount = Array.isArray(allAgents) ? allAgents.length : 0;

    if (agentCount === 0) {
      errors.push("No agents registered - run /agent-register first");
    }
  } catch (error: any) {
    errors.push(`Agent storage error: ${error.message}`);
  }

  return {
    valid: errors.length === 0,
    agentCount,
    errors,
  };
}

/**
 * Format agent registry validation for display
 */
export function formatAgentRegistryValidation(): string {
  const validation = validateAgentRegistry();

  let message = `🤖 *Agent Registry Status*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  message += `• Valid: ${validation.valid ? "✅ YES" : "❌ NO"}\n`;
  message += `• Agents: ${validation.agentCount}\n\n`;

  if (!validation.valid && validation.errors.length > 0) {
    message += `❌ *Issues*\n`;
    for (const err of validation.errors) {
      message += `• ${err}\n`;
    }
    message += `\n🔧 *Fix*\n`;
    message += `Run: /agent-register\n`;
  } else {
    message += `✅ Agent system is ready!\n`;
    message += `\nNext steps:\n`;
    message += `• Create agent: /agent-create DESCRIPTION\n`;
    message += `• View agents: /agent-list\n`;
    message += `• Check logs: /agent-logs AGENT_ID\n`;
  }

  return message;
}

/**
 * Comprehensive system health check
 */
export function getSystemHealth(): {
  overall: "healthy" | "degraded" | "critical";
  checks: Record<string, boolean>;
  timestamp: string;
} {
  const checks: Record<string, boolean> = {};

  // Database check
  try {
    const dbPath = config.databaseUrl.includes("sqlite://")
      ? config.databaseUrl.replace("sqlite:///", "/").replace("sqlite://", "")
      : config.databaseUrl;
    checks["database"] = fs.existsSync(dbPath) || fs.existsSync(path.dirname(dbPath));
  } catch {
    checks["database"] = false;
  }

  // User data check
  try {
    const testFile = path.join(config.userDataRoot, ".health-check");
    fs.writeFileSync(testFile, "check", { flag: "w" });
    fs.unlinkSync(testFile);
    checks["user_data_writable"] = true;
  } catch {
    checks["user_data_writable"] = false;
  }

  // kpass check
  try {
    execSync(`${config.kpassBinary} version`, { stdio: "pipe", timeout: 5000 });
    checks["kpass"] = true;
  } catch {
    checks["kpass"] = false;
  }

  // Determine overall health
  const failedChecks = Object.values(checks).filter(v => !v).length;
  let overall: "healthy" | "degraded" | "critical" = "healthy";
  if (failedChecks === 1) overall = "degraded";
  if (failedChecks >= 2) overall = "critical";

  return {
    overall,
    checks,
    timestamp: new Date().toISOString(),
  };
}
