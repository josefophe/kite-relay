/**
 * SKILL WRAPPER: Request Session
 *
 * Wraps kpass agent:session commands with:
 * - Session creation with validation
 * - Session listing and filtering
 * - Session status checking
 * - TTL validation
 */
import { executeKpass } from "../userRuntime";
import { logger } from "../logger";
import { SkillExecutionOutput, KiteExitCode } from "./skillTypes";

export interface RequestSessionInput {
  userId: number;
  action: "create" | "list" | "status" | "use";
  maxAmountPerTx?: string;
  ttl?: string;
  taskSummary?: string;
  requestId?: string;
  sessionId?: string;
}

/**
 * Manage spending sessions for autonomous agents
 *
 * Actions:
 * - create: Create new spending session
 * - list: List existing sessions
 * - status: Check session approval status
 * - use: Activate a session for use
 */
export async function requestSessionSkill(input: RequestSessionInput): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    switch (input.action) {
      case "create":
        return await handleCreate(input.userId, input.maxAmountPerTx, input.ttl, input.taskSummary);
      case "list":
        return await handleList(input.userId);
      case "status":
        return await handleStatus(input.userId, input.requestId);
      case "use":
        return await handleUse(input.userId, input.sessionId);
      default:
        return {
          success: false,
          output: `❌ Unknown action: ${input.action}`,
          exitCode: KiteExitCode.USAGE_ERROR,
        };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        userId: input.userId,
        action: input.action,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      },
      "skill:requestSession failed"
    );
    return {
      success: false,
      output: `❌ Session error: ${errorMsg}`,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

async function handleCreate(
  userId: number,
  maxAmountPerTx?: string,
  ttl?: string,
  taskSummary?: string
): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  // Validate inputs
  if (!maxAmountPerTx) {
    return {
      success: false,
      output: "❌ Please provide max\-amount\-per\-tx (e.g., 100 for 100 USDC)",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }
  if (!ttl) {
    return {
      success: false,
      output: "❌ Please provide TTL (e.g., 24h, 1h, 7d)",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  const amount = parseFloat(maxAmountPerTx);
  if (isNaN(amount) || amount <= 0) {
    return {
      success: false,
      output: "❌ Amount must be a positive number",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  try {
    const args = [
      "agent:session",
      "create",
      "--max-amount-per-tx", String(amount),
      "--ttl", ttl,
      "--output", "json",
    ];
    if (taskSummary) {
      args.push("--task-summary", taskSummary);
    }

    const output = await executeKpass(userId, args, "session-create");
    let responseData: Record<string, unknown> = {};
    let requestId = "";
    try {
      responseData = JSON.parse(output);
      requestId = (responseData.requestId || responseData.request_id || "") as string;
    } catch {
      // Continue even if parse fails
    }

    let message = `*✅ Session Initiated*\n`;
    message += `\`\`\`\n`;
    message += `Max per TX: ${amount} USDC\n`;
    message += `TTL:        ${ttl}\n`;
    message += `Request ID: ${requestId || "N/A"}\n`;
    message += `\`\`\`\n`;
    message += `Please approve this request in your *Kite Passport app*\.`;

    return {
      success: true,
      output: message,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("code 3")) {
      return {
        success: false,
        output: "❌ Not authenticated\. Please run \`/login\` first\.",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }
    return {
      success: false,
      output: `❌ Session creation failed: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleList(userId: number): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    const output = await executeKpass(
      userId,
      ["agent:session", "list", "--output", "json"],
      "session-list"
    );
    let responseData: Record<string, unknown> = {};
    let sessions: any[] = [];
    try {
      responseData = JSON.parse(output);
      sessions = (responseData.sessions || []) as any[];
    } catch {
      // Continue even if parse fails
    }

    let message = `📊 *Your Sessions*\n\n`;

    if (sessions.length > 0) {
      message += `\`\`\``;
      sessions.forEach((session: any, idx: number) => {
        const num = idx + 1;
        const id = session.id || "Unknown";
        const status = session.status || "unknown";
        const max = session.max_amount_per_tx || "N/A";
        const ttl = session.ttl || "N/A";

        // Cast explicitly to string using String() wrapper
        const statusString = String(status);

        message += `\n[${num}] ID: ${id}\n`;
        message += `    Status: ${statusString.toUpperCase()}\n`;
        message += `    Limit:  ${max} USDC\n`;
        message += `    TTL:    ${ttl}\n`;
      });
      message += `\`\`\``;
    } else {
      message = "ℹ️ No active sessions found\.";
    }

    return {
      success: true,
      output: message,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("code 3")) {
      return {
        success: false,
        output: "❌ Not authenticated\. Please run \`/login\` first\.",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }
    return {
      success: false,
      output: `❌ Failed to list sessions: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleStatus(userId: number, requestId?: string): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!requestId) {
    return {
      success: false,
      output: "❌ Please provide request ID",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  try {
    const output = await executeKpass(
      userId,
      ["agent:session", "status", "--request-id", requestId, "--output", "json"],
      "session-status"
    );
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
    } catch {
      // Continue even if parse fails
    }

    const status = responseData.status || "unknown";
    const sessionId = responseData.sessionId || responseData.session_id;

    let statusIcon = "⏳";
    if (status === "approved" || status === "active") {
      statusIcon = "✅";
    } else if (status === "rejected") {
      statusIcon = "❌";
    }

    // Cast explicitly to string using String() wrapper
    const statusString = String(status);

    let message = `${statusIcon} *Session Status*\n`;
    message += `\`\`\`\n`;
    message += `Status: ${statusString.toUpperCase()}\n`;
    if (sessionId) {
      message += `Session ID: ${sessionId}\n`;
    }
    message += `\`\`\``;

    return {
      success: true,
      output: message,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("code 4")) {
      return {
        success: false,
        output: "❌ Request not found\.",
        exitCode: KiteExitCode.NOT_FOUND,
      };
    }
    return {
      success: false,
      output: `❌ Failed to get session status: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleUse(userId: number, sessionId?: string): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!sessionId) {
    return {
      success: false,
      output: "❌ Please provide session ID",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  try {
    const output = await executeKpass(
      userId,
      ["agent:session", "use", "--session-id", sessionId, "--output", "json"],
      "session-use"
    );
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
    } catch {
      // Continue even if parse fails
    }

    return {
      success: true,
      output: `✅ Session \`${sessionId}\` activated\nReady for autonomous execution\.`,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("code 4")) {
      return {
        success: false,
        output: "❌ Session not found\.",
        exitCode: KiteExitCode.NOT_FOUND,
      };
    }
    if (errorMsg.includes("code 3")) {
      return {
        success: false,
        output: "❌ Session not approved yet\. Check status with \`/session-status\`",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }
    return {
      success: false,
      output: `❌ Failed to activate session: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}
