/**
 * STARTUP DIAGNOSTICS
 * 
 * Comprehensive runtime validation and logging at bootstrap time.
 * Detects configuration issues, permissions problems, and connectivity before entering production.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import https from "https";
import { logger } from "./logger";
import { config } from "./config";

export interface StartupDiagnostics {
  serviceRole: "relay" | "worker";
  telegramConnectivity: boolean;
  databaseAccessible: boolean;
  userDataDirWritable: boolean;
  redisConnectivity: boolean;
  kpassBinaryAvailable: boolean;
  permissionChecks: {
    dataDir: boolean;
    tempDir: boolean;
    configDir: boolean;
  };
}

/**
 * Test DNS resolution and HTTPS connectivity to Telegram API
 */
async function testTelegramConnectivity(): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn("⚠️ Telegram API request timed out - slow network?");
      resolve(false);
    }, 5000);

    const req = https.get("https://api.telegram.org/bottest/getMe", {}, (res) => {
      clearTimeout(timeout);
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        logger.info("✓ Telegram API DNS and HTTPS connectivity OK");
        resolve(true);
      } else {
        logger.warn(`⚠️ Telegram API returned status ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on("error", (error: any) => {
      clearTimeout(timeout);
      if (error.code === "ENOTFOUND") {
        logger.warn("⚠️ Telegram API DNS resolution failed - network isolation?");
      } else if (error.code === "ECONNREFUSED") {
        logger.warn("⚠️ Telegram API connection refused - firewall/proxy issue?");
      } else {
        logger.warn(`⚠️ Telegram connectivity check failed: ${error.message}`);
      }
      resolve(false);
    });

    req.end();
  });
}

/**
 * Validate database accessibility
 */
async function testDatabaseAccessibility(): Promise<boolean> {
  try {
    const dbUrl = config.databaseUrl;
    
    if (dbUrl.includes("sqlite://")) {
      // For SQLite, validate file accessibility
      const dbPath = dbUrl.replace("sqlite:///", "/").replace("sqlite://", "");
      const dirPath = path.dirname(dbPath);
      
      // Ensure directory exists
      if (!fs.existsSync(dirPath)) {
        try {
          fs.mkdirSync(dirPath, { recursive: true });
          logger.info(`✓ Database directory created: ${dirPath}`);
        } catch (err) {
          logger.error(`❌ Failed to create database directory: ${dirPath}`);
          return false;
        }
      }
      
      // Test write access
      const testFile = path.join(dirPath, ".write-test");
      try {
        fs.writeFileSync(testFile, "test");
        fs.unlinkSync(testFile);
        logger.info(`✓ Database directory writable: ${dirPath}`);
        return true;
      } catch (err) {
        logger.error(`❌ Database directory not writable: ${dirPath}`);
        return false;
      }
    } else {
      logger.info(`✓ Using non-SQLite database: ${dbUrl.substring(0, 50)}...`);
      return true;
    }
  } catch (error) {
    logger.error({ error }, "Database accessibility check failed");
    return false;
  }
}

/**
 * Validate user data directory permissions
 */
function testUserDataDirWritable(): boolean {
  try {
    const testDir = path.join(config.userDataRoot, ".write-test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.rmdirSync(testDir);
    logger.info(`✓ User data directory writable: ${config.userDataRoot}`);
    return true;
  } catch (error) {
    logger.error(`❌ User data directory not writable: ${config.userDataRoot}`);
    return false;
  }
}

/**
 * Test Redis connectivity
 */
async function testRedisConnectivity(): Promise<boolean> {
  try {
    const { createClient } = await import("redis");
    const client = createClient({
      url: config.redisUrl,
    });
    
    await client.connect();
    const pong = await client.ping();
    await client.disconnect();
    
    if (pong === "PONG") {
      logger.info(`✓ Redis connectivity OK: ${config.redisUrl}`);
      return true;
    }
    
    logger.warn("⚠️ Redis ping unexpected response");
    return false;
  } catch (error: any) {
    if (error.code === "ECONNREFUSED") {
      logger.warn(`⚠️ Redis connection refused: ${config.redisUrl}`);
    } else if (error.code === "ENOTFOUND") {
      logger.warn(`⚠️ Redis DNS resolution failed: ${config.redisUrl}`);
    } else {
      logger.warn(`⚠️ Redis connectivity check failed: ${error.message}`);
    }
    return false;
  }
}

/**
 * Check kpass binary availability
 */
function testKpassBinaryAvailable(): boolean {
  try {
    const output = execSync(`${config.kpassBinary} --version`, {
      timeout: 5000,
      stdio: "pipe",
    }).toString().trim();
    
    logger.info(`✓ kpass binary available: ${config.kpassBinary}`);
    logger.debug({ version: output }, "kpass version");
    return true;
  } catch (error) {
    logger.warn(`⚠️ kpass binary not found or not executable: ${config.kpassBinary}`);
    return false;
  }
}

/**
 * Check permission configurations in key directories
 */
function checkPermissions(): {
  dataDir: boolean;
  tempDir: boolean;
  configDir: boolean;
} {
  const results = {
    dataDir: false,
    tempDir: false,
    configDir: false,
  };
  
  try {
    const dataDir = config.userDataRoot;
    fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
    results.dataDir = true;
    logger.info(`✓ Data directory permissions OK: ${dataDir}`);
  } catch {
    logger.warn(`⚠️ Data directory permission issue: ${config.userDataRoot}`);
  }
  
  try {
    const tmpDir = path.join(config.userDataRoot, "temp");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.accessSync(tmpDir, fs.constants.R_OK | fs.constants.W_OK);
    results.tempDir = true;
    logger.info(`✓ Temp directory permissions OK: ${tmpDir}`);
  } catch {
    logger.warn(`⚠️ Temp directory permission issue`);
  }
  
  try {
    const configDir = path.join(config.userDataRoot, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.accessSync(configDir, fs.constants.R_OK | fs.constants.W_OK);
    results.configDir = true;
    logger.info(`✓ Config directory permissions OK: ${configDir}`);
  } catch {
    logger.warn(`⚠️ Config directory permission issue`);
  }
  
  return results;
}

/**
 * Run full startup diagnostics
 */
export async function runStartupDiagnostics(): Promise<StartupDiagnostics> {
  logger.info("════════════════════════════════════════════════════");
  logger.info("🔍 STARTUP DIAGNOSTICS - KiteRelay");
  logger.info("════════════════════════════════════════════════════");
  
  // Service role detection
  logger.info(`\n📍 Service Role Detection:`);
  logger.info(`   IS_WORKER: ${process.env.IS_WORKER || "false"}`);
  logger.info(`   → Running as: ${config.isRelay ? "RELAY (polling enabled)" : "WORKER (polling disabled)"}`);
  
  // Telegram configuration
  logger.info(`\n📡 Telegram Configuration:`);
  logger.info(`   Bot Token: ${config.telegramBotToken ? "✓ Present" : "✗ Missing"}`);
  logger.info(`   Polling Enabled: ${config.enableTelegramPolling}`);
  
  // Database configuration
  logger.info(`\n💾 Database Configuration:`);
  logger.info(`   URL: ${config.databaseUrl}`);
  logger.info(`   Type: ${config.dbType}`);
  
  // Runtime paths
  logger.info(`\n📂 Runtime Paths:`);
  logger.info(`   User Data Root: ${config.userDataRoot}`);
  logger.info(`   kpass Binary: ${config.kpassBinary}`);
  logger.info(`   ksearch Binary: ${config.ksearchBinary}`);
  
  // Redis
  logger.info(`\n🔴 Redis Configuration:`);
  logger.info(`   URL: ${config.redisUrl}`);
  
  // Run connectivity tests in parallel
  logger.info(`\n🧪 Connectivity Tests:`);
  
  const [telegramOk, redisOk] = await Promise.all([
    config.isRelay ? testTelegramConnectivity() : Promise.resolve(true),
    testRedisConnectivity(),
  ]);
  
  // Sequential tests (disk I/O)
  logger.info(`\n🧪 Storage Tests:`);
  const databaseOk = await testDatabaseAccessibility();
  const userDataWritable = testUserDataDirWritable();
  const kpassAvailable = testKpassBinaryAvailable();
  
  const permissionChecks = checkPermissions();
  
  // Summary
  logger.info(`\n════════════════════════════════════════════════════`);
  logger.info(`📊 DIAGNOSTICS SUMMARY:`);
  logger.info(`   Service: ${config.isRelay ? "✓ RELAY" : "✓ WORKER"}`);
  logger.info(`   Telegram: ${telegramOk ? "✓" : "⚠️"}`);
  logger.info(`   Database: ${databaseOk ? "✓" : "⚠️"}`);
  logger.info(`   User Data: ${userDataWritable ? "✓" : "⚠️"}`);
  logger.info(`   Redis: ${redisOk ? "✓" : "⚠️"}`);
  logger.info(`   kpass: ${kpassAvailable ? "✓" : "⚠️"}`);
  logger.info(`════════════════════════════════════════════════════\n`);
  
  const diagnostics: StartupDiagnostics = {
    serviceRole: config.isRelay ? "relay" : "worker",
    telegramConnectivity: telegramOk,
    databaseAccessible: databaseOk,
    userDataDirWritable: userDataWritable,
    redisConnectivity: redisOk,
    kpassBinaryAvailable: kpassAvailable,
    permissionChecks,
  };
  
  return diagnostics;
}

/**
 * Log runtime startup information
 */
export function logStartupInfo(): void {
  logger.info("🚀 KiteRelay Startup Information:");
  logger.info(`   Node Version: ${process.version}`);
  logger.info(`   Service Role: ${config.isRelay ? "RELAY" : "WORKER"}`);
  logger.info(`   Process ID: ${process.pid}`);
  logger.info(`   User Data Root: ${config.userDataRoot}`);
  logger.info(`   Database URL: ${config.databaseUrl}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || "development"}`);
}
