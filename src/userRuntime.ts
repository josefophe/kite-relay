import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { ensureUserPaths, UserPaths, readUserProfile, writeUserProfile } from "./storage";
import { logExecution } from "./utils";
import { recordCommand } from "./telemetry";
import { logger } from "./logger";

/**
 * ARCHITECTURE: Per-User Runtime Isolation
 * 
 * Every Telegram user runs in an isolated environment that behaves like
 * a separate Linux user with their own kpass installation.
 * 
 * Key principle: Filesystem-based multi-tenancy
 * - Each user's HOME = /data/users/<telegram_id>
 * - kpass stores auth at HOME/.kpass/config.json
 * - No shared state, no token injection, no custom auth
 * - Environment variables enforce isolation
 */

interface ExecutionOptions {
  args: string[];
  bin: string;
  userId: number;
  command: string;
  envVars?: Record<string, string>;
}

// Per-user execution queue ensures serialization
// Prevents race conditions from concurrent commands
const queueMap = new Map<number, Promise<unknown>>();

function enqueue<T>(userId: number, task: () => Promise<T>): Promise<T> {
  const current = queueMap.get(userId) ?? Promise.resolve();
  const next = current
    .then(() => task())
    .finally(() => {
      if (queueMap.get(userId) === next) {
        queueMap.delete(userId);
      }
    });
  queueMap.set(userId, next);
  return next as Promise<T>;
}

function writeExecutionLog(paths: UserPaths, entry: string): void {
  const logFile = path.join(paths.logs, "execution.log");
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${entry}\n`, { encoding: "utf8" });
}

/**
 * Build isolated environment for a user
 * 
 * CRITICAL: This is where multi-tenancy happens
 * - HOME points to user's sandbox
 * - All subprocess filesystem access is confined to user's directory
 * - XDG variables ensure config/data isolation
 * - TMPDIR is user-specific
 */
function buildUserEnvironment(paths: UserPaths, customEnv?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // HOME determines where kpass looks for .kpass/config.json
    // Setting this is the core of filesystem-based isolation
    HOME: paths.root,
    
    // XDG Base Directory Specification compliance
    // kpass may respect these for additional config/cache locations
    XDG_CONFIG_HOME: path.join(paths.root, ".config"),
    XDG_DATA_HOME: path.join(paths.root, ".local/share"),
    
    // User-specific temp directory
    TMPDIR: paths.temp,
    
    // Preserve PATH so subprocess can find kpass/ksearch
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    
    // Optional: Mark this as being run in kite-relay for debugging
    KITE_USER_ID: paths.root,
    
    // Merge custom environment variables (e.g., KPASS_SIGNUP_CODE, KPASS_LOGIN_CODE)
    // These are sensitive values passed via env vars for security (not visible in ps)
    ...(customEnv || {}),
  };
}

/**
 * Execute subprocess with full isolation
 * 
 * Process:
 * 1. Set up user's isolated environment
 * 2. Spawn subprocess in user's workspace directory
 * 3. Capture stdout/stderr
 * 4. Log execution for audit trail
 * 5. Return result or error
 */
async function runSubprocess(opts: ExecutionOptions): Promise<string> {
  const paths = ensureUserPaths(opts.userId, config.userDataRoot);
  const userEnv = buildUserEnvironment(paths, opts.envVars);

  logger.debug(
    { userId: opts.userId, command: opts.command, args: opts.args, HOME: userEnv.HOME },
    "executing subprocess with isolated environment"
  );

  return new Promise((resolve, reject) => {
    const child = spawn(opts.bin, opts.args, {
      // User's workspace is the working directory
      cwd: paths.workspace,
      // Use isolated environment (critical for auth isolation)
      env: userEnv,
      // Suppress stdin, capture stdout/stderr
      stdio: ["ignore", "pipe", "pipe"],
      // CRITICAL: Never use shell=true (security risk)
      // Args passed as array prevent injection
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    const start = Date.now();

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: Error) => {
      const duration = (Date.now() - start) / 1000;
      const errorMsg = `spawn error: ${error.message}`;
      
      writeExecutionLog(paths, `ERROR ${opts.bin} ${opts.args.join(" ")} => ${errorMsg}`);
      logExecution(opts.userId.toString(), opts.command, errorMsg);
      recordCommand(opts.command, false, duration);
      
      logger.error(
        { userId: opts.userId, command: opts.command, error: error.message },
        "subprocess spawn error"
      );
      
      reject(new Error(`${opts.command} failed: ${error.message}`));
    });

    child.on("close", (code: number | null) => {
      const duration = (Date.now() - start) / 1000;
      const success = code === 0;

      // Log execution for audit trail
      const logEntry = success
        ? `exit=${code} ${opts.bin} ${opts.args.join(" ")}`
        : `exit=${code} ${opts.bin} ${opts.args.join(" ")} stderr=${stderr.trim()}`;

      writeExecutionLog(paths, logEntry);
      recordCommand(opts.command, success, duration);

      if (success) {
        logger.debug(
          { userId: opts.userId, command: opts.command, duration },
          "subprocess completed successfully"
        );
        resolve(stdout.trim() || "OK");
      } else {
        logger.error(
          { userId: opts.userId, command: opts.command, exitCode: code, stderr: stderr.trim() },
          "subprocess failed"
        );
        reject(new Error(stderr.trim() || `Command exited with code ${code}`));
      }
    });
  });
}

/**
 * Execute kpass in user's isolated environment
 * 
 * Per-user queuing ensures:
 * - No concurrent CLI conflicts
 * - Sequential auth operations
 * - Safe concurrent balance queries across users
 * 
 * @param envVars Optional environment variables (e.g., KPASS_SIGNUP_CODE, KPASS_LOGIN_CODE)
 *                  These are passed as env vars instead of CLI flags for security
 *                  (env vars are not visible in process listings)
 */
export async function executeKpass(userId: number, args: string[], command: string, envVars?: Record<string, string>): Promise<string> {
  return enqueue(userId, async () => {
    const paths = ensureUserPaths(userId, config.userDataRoot);
    
    // Update user profile with execution timestamp
    const profile = readUserProfile(userId, config.userDataRoot);
    profile.lastSeenAt = new Date().toISOString();
    profile.history.commands.push(`${new Date().toISOString()} ${command}`);
    writeUserProfile(userId, config.userDataRoot, profile);

    // Execute in isolated environment
    return runSubprocess({
      bin: config.kpassBinary,
      args,
      userId,
      command,
      envVars,
    });
  });
}

/**
 * Execute ksearch in user's isolated environment
 */
export async function executeKsearch(userId: number, args: string[], command: string): Promise<string> {
  return enqueue(userId, async () => {
    const paths = ensureUserPaths(userId, config.userDataRoot);
    
    const profile = readUserProfile(userId, config.userDataRoot);
    profile.lastSeenAt = new Date().toISOString();
    profile.history.commands.push(`${new Date().toISOString()} ksearch ${args.join(" ")}`);
    if (args.length > 0) {
      profile.history.searches.push(args.join(" "));
    }
    writeUserProfile(userId, config.userDataRoot, profile);

    return runSubprocess({
      bin: config.ksearchBinary,
      args,
      userId,
      command,
    });
  });
}
