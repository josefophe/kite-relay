/**
 * SKILL WRAPPER: Request Session
 *
 * Wraps kpass agent:session commands with:
 * - Agent registration (MANDATORY first step)
 * - Session creation with delegation JSON (MANDATORY: must provide --delegation flag)
 * - Session listing with filtering
 * - Session status checking with polling support
 * - Session activation
 *
 * Per SKILL.md: Uses delegation model, not deprecated --max-amount-per-tx or --ttl flags.
 */
import { executeKpass } from "../userRuntime";
import { logger } from "../logger";
import { SkillExecutionOutput, KiteExitCode } from "./skillTypes";

export interface RequestSessionInput {
  userId: number;
  action: "register" | "create" | "list" | "status" | "use";
  // For create: delegation JSON string or object
  delegation?: string | Record<string, unknown>;
  // For status: request ID and optional wait flag
  requestId?: string;
  wait?: boolean;
  // For list: optional status filter (active, expired, etc)
  statusFilter?: string;
  // For use: session ID
  sessionId?: string;
}

/**
 * Manage spending sessions for autonomous agents
 *
 * Actions:
 * - register: Register agent identity (MANDATORY before creating sessions)
 * - create: Create new spending session with delegation JSON (REQUIRED: --delegation flag)
 * - list: List existing sessions (optional --status filter: active, expired)
 * - status: Check session approval status (supports --wait for polling)
 * - use: Activate a session for use
 */
export async function requestSessionSkill(input: RequestSessionInput): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    switch (input.action) {
      case "register":
        return await handleRegister(input.userId);
      case "create":
        return await handleCreate(input.userId, input.delegation);
      case "list":
        return await handleList(input.userId, input.statusFilter);
      case "status":
        return await handleStatus(input.userId, input.requestId, input.wait);
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
      { userId: input.userId, action: input.action, error: errorMsg, durationMs: Date.now() - startTime },
      "skill:requestSession failed"
    );
    const safeError = errorMsg.replace(/[._\-!]/g, '\\$&');
    return { success: false, output: `❌ Session error: ${safeError}`, error: errorMsg, duration: Date.now() - startTime };
  }
}

async function handleRegister(userId: number): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    // Per SKILL.md: Agent type should be 'claude' for Claude Code. Never ask the user.
    const output = await executeKpass(
      userId,
      ["agent:register", "--type", "claude", "--output", "json"],
      "agent-register"
    );
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
    } catch {
      // Continue even if parse fails
    }

    const agentId = responseData.agent_id || responseData.agentId || "unknown";
    const type = responseData.type || "claude";
    const hint = (responseData.hint as string) || "";

    let message = ``;
    if (hint.includes("already registered")) {
      message = `🤖 <b>Agent Already Registered</b>\n\n`;
      message += `🏷️  Type:     ${type}\n`;
      message += `🆔 Agent ID: ${agentId}\n`;
      message += `✅ Status:   Ready\n`;
    } else {
      message = `🤖 <b>Agent Registered</b>\n\n`;
      message += `🏷️  Type:     ${type}\n`;
      message += `🆔 Agent ID: ${agentId}\n`;
      message += `🔑 Token:    saved to project config\n\n`;
      message += `Your agent is ready. Create a spending session to start.`;
    }

    return {
      success: true,
      output: message,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.toLowerCase().includes("code 3")) {
      return { success: false, output: "❌ Not authenticated. Please run login first.", exitCode: KiteExitCode.AUTH_ERROR };
    }
    const safeError = errorMsg.replace(/[._\-!]/g, '\\$&');
    return { success: false, output: `❌ Agent registration failed: ${safeError}`, error: errorMsg, exitCode: KiteExitCode.NETWORK_ERROR };
  }
}

async function handleCreate(
  userId: number,
  delegation?: string | Record<string, unknown>
): Promise<SkillExecutionOutput> {
  const startTime = Date.now();

  // Per SKILL.md: --delegation flag is MANDATORY and must contain delegation JSON
  if (!delegation) {
    return {
      success: false,
      output: `❌ MANDATORY: Please provide delegation JSON (--delegation '<JSON>')\n\n` +
              `Delegation must include:\n` +
              `  - task.summary: Description of what you're authorizing\n` +
              `  - payment_policy.allowed_payment_approaches: ["x402"] or ["crossmint"]\n` +
              `  - payment_policy.assets: ["USDC"]\n` +
              `  - payment_policy.max_amount_per_tx: "1.00"\n` +
              `  - payment_policy.max_total_amount: "10.00"\n` +
              `  - payment_policy.ttl_seconds: 3600\n\n` +
              `See form-session-delegation skill for full schema.`,
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  try {
    // Convert delegation to JSON string if it's an object
    let delegationJson: string;
    if (typeof delegation === "string") {
      delegationJson = delegation;
      // Validate it's valid JSON
      try {
        JSON.parse(delegationJson);
      } catch {
        return {
          success: false,
          output: `❌ Invalid delegation JSON: ${delegation}`,
          exitCode: KiteExitCode.USAGE_ERROR,
        };
      }
    } else {
      delegationJson = JSON.stringify(delegation);
    }

    const args = [
      "agent:session",
      "create",
      "--delegation", delegationJson,
      "--output", "json",
    ];

    const output = await executeKpass(userId, args, "session-create");
    let responseData: Record<string, unknown> = {};
    let requestId = "";
    let approvalUrl = "";
    try {
      responseData = JSON.parse(output);
      requestId = (responseData.request_id || responseData.requestId || "") as string;
      approvalUrl = (responseData.approval_url || responseData.approvalUrl || "") as string;
    } catch {
      // Continue even if parse fails
    }

    let message = `🛡️ <b>Approval Required</b>\n\n`;
    message += `A spending session needs your approval:\n\n`;
    if (approvalUrl) {
      message += `🌐 ${approvalUrl}\n\n`;
    }
    message += `📋 Request ID: ${requestId || "N/A"}\n\n`;
    message += `👆 Open the link, review, and approve with passkey.\n`;
    message += `⏳ I'll wait automatically for your approval...`;

    return {
      success: true,
      output: message,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.toLowerCase().includes("code 3")) {
      return { success: false, output: "❌ Not authenticated. Please login first.", exitCode: KiteExitCode.AUTH_ERROR };
    }
    if (errorMsg.toLowerCase().includes("code 6")) {
      return { success: false, output: `❌ Session policy violation: ${errorMsg}\n\nCommon issues:\n- Wrong payment approach (use x402 or crossmint)\n- Unsupported asset\n- Endpoint mismatch\n\nSee error details for specifics.`, exitCode: KiteExitCode.NETWORK_ERROR };
    }
    const safeError = errorMsg.replace(/[._\-!]/g, '\\$&');
    return { success: false, output: `❌ Session creation failed: ${safeError}`, error: errorMsg, exitCode: KiteExitCode.NETWORK_ERROR };
  }
}


async function handleList(userId: number, statusFilter?: string): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    // Per SKILL.md: Support --status filter for active/expired/all sessions
    const args = ["agent:session", "list", "--output", "json"];
    if (statusFilter) {
      args.push("--status", statusFilter);
    }

    const output = await executeKpass(userId, args, "session-list");
    let responseData: Record<string, unknown> = {};
    let sessions: any[] = [];
    try {
      responseData = JSON.parse(output);
      sessions = (responseData.sessions || []) as any[];
    } catch {
      // Continue even if parse fails
    }

    let message = `📊 <b>Your Sessions</b>\n\n`;

    if (sessions.length > 0) {
      message += `Found ${sessions.length} session(s):\n\n`;
      sessions.forEach((session: any, idx: number) => {
        const num = idx + 1;
        const id = session.id || "Unknown";
        const status = session.status || "unknown";
        const expiresAt = session.expires_at || session.expiresAt || "N/A";
        const maxPerTx = session.delegation?.payment_policy?.max_amount_per_tx || "N/A";
        const maxTotal = session.delegation?.payment_policy?.max_total_amount || "N/A";
        const assets = session.delegation?.payment_policy?.assets?.join(",") || "N/A";
        const spent = session.usage?.spent_total || "0.00";

        const statusString = String(status).toUpperCase();
        const statusIcon = status === "active" ? "✅" : status === "expired" ? "⏰" : "⏳";

        message += `[${num}] ${statusIcon} ${statusString}\n`;
        message += `    ID:        ${id}\n`;
        message += `    Per-tx:    ${maxPerTx} ${assets}\n`;
        message += `    Budget:    ${maxTotal} ${assets}\n`;
        message += `    Spent:     ${spent}\n`;
        message += `    Expires:   ${expiresAt}\n\n`;
      });
    } else {
      message = `ℹ️ No sessions found${statusFilter ? ` with status '${statusFilter}'` : ""}`;
    }

    return { success: true, output: message, rawData: responseData, duration: Date.now() - startTime };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.toLowerCase().includes("code 3")) {
      return { success: false, output: "❌ Not authenticated. Please login first.", exitCode: KiteExitCode.AUTH_ERROR };
    }
    const safeError = errorMsg.replace(/[._\-!]/g, '\\$&');
    return { success: false, output: `❌ Failed to list sessions: ${safeError}`, error: errorMsg, exitCode: KiteExitCode.NETWORK_ERROR };
  }
}

async function handleStatus(userId: number, requestId?: string, wait?: boolean): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!requestId) {
    return {
      success: false,
      output: "❌ Please provide request ID (--request-id <ID>)",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  try {
    // Per SKILL.md: --wait flag for polling is MANDATORY for initial approval checks
    const args = [
      "agent:session",
      "status",
      "--request-id", requestId,
      "--output", "json",
    ];
    
    // Add --wait for polling (default: 3s intervals, 300s timeout = 5 minutes)
    if (wait !== false) {
      args.push("--wait");
    }

    const output = await executeKpass(userId, args, "session-status");
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
    } catch {
      // Continue even if parse fails
    }

    const status = responseData.status || "unknown";
    const sessionId = responseData.session_id || responseData.sessionId;
    const expiresAt = (responseData.expires_at as string | undefined) || (responseData.session as any)?.expires_at;
    const hint = (responseData.hint as string) || "";

    let statusIcon = "⏳";
    let message = ``;

    if (status === "approved" || status === "active" || status === "success") {
      statusIcon = "✅";
      message = `${statusIcon} <b>Session Approved -- Ready to Transact!</b>\n\n`;
      message += `🎫 Session:   ${sessionId}\n`;
      
      const delegation = (responseData.session as any)?.delegation;
      if (delegation) {
        const taskSummary = delegation.task?.summary || "N/A";
        const maxPerTx = delegation.payment_policy?.max_amount_per_tx || "N/A";
        const maxTotal = delegation.payment_policy?.max_total_amount || "N/A";
        const assets = delegation.payment_policy?.assets?.join(",") || "N/A";
        const spent = (responseData.session as any)?.usage?.spent_total || "0.00";
        
        message += `📝 Task:      ${taskSummary}\n`;
        message += `💰 Per-tx:    Up to ${maxPerTx} ${assets}\n`;
        message += `💰 Budget:    ${maxTotal} ${assets}\n`;
        message += `📊 Spent:     ${spent} / ${maxTotal}\n`;
      }
      
      if (expiresAt) {
        message += `⏰ Expires:   ${expiresAt}\n`;
      }
      message += `✅ Status:    Active\n\n`;
      message += `All set. I can now execute payments on your behalf.`;
    } else if (status === "pending") {
      statusIcon = "⏳";
      message = `${statusIcon} <b>Session Approval Pending</b>\n\n`;
      message += `📋 Request ID: ${requestId}\n`;
      if (expiresAt) {
        message += `⏰ Expires:    ${expiresAt}\n`;
      }
      message += `\nStill waiting for your approval. Please approve the session and I'll check again.`;
    } else if (status === "rejected") {
      statusIcon = "❌";
      message = `${statusIcon} <b>Session Rejected</b>\n\n`;
      message += `The session request was not approved.\n\n`;
      message += `Would you like me to create a new one, perhaps with different terms?`;
    } else if (status === "expired") {
      statusIcon = "⏰";
      message = `${statusIcon} <b>Session Request Expired</b>\n\n`;
      message += `The approval request timed out.\n\n`;
      message += `Would you like me to create a new session request?`;
    } else {
      message = `${statusIcon} <b>Session Status</b>\n\n`;
      message += `Status: ${String(status).toUpperCase()}\n`;
      if (sessionId) {
        message += `Session ID: ${sessionId}\n`;
      }
      message += `\n${hint}`;
    }

    return {
      success: status === "approved" || status === "active" || status === "success",
      output: message,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const normalizedError = errorMsg.toLowerCase();
    if (normalizedError.includes("code 4") || normalizedError.includes("not found")) {
      return { success: false, output: "❌ Request not found.", exitCode: KiteExitCode.NOT_FOUND };
    }
    if (normalizedError.includes("code 3")) {
      return { success: false, output: "❌ Not authenticated. Please login first.", exitCode: KiteExitCode.AUTH_ERROR };
    }
    const safeError = errorMsg.replace(/[._\-!]/g, '\\$&');
    return { success: false, output: `❌ Failed to get session status: ${safeError}`, error: errorMsg, exitCode: KiteExitCode.NETWORK_ERROR };
  }
}

async function handleUse(userId: number, sessionId?: string): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!sessionId) {
    return {
      success: false,
      output: "❌ Please provide session ID (--session-id <ID>)",
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

    const currentSessionId = responseData.current_session_id || responseData.currentSessionId || sessionId;

    return {
      success: true,
      output: `✅ <b>Session Activated</b>\n\n` +
              `🎫 Session: ${currentSessionId}\n` +
              `✅ Status:  Active\n\n` +
              `Ready for autonomous execution.`,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const normalizedError = errorMsg.toLowerCase();
    if (normalizedError.includes("code 4")) {
      return { success: false, output: "❌ Session not found.", exitCode: KiteExitCode.NOT_FOUND };
    }
    if (normalizedError.includes("code 3")) {
      return { success: false, output: "❌ Session not approved yet. Check status with session status command.", exitCode: KiteExitCode.AUTH_ERROR };
    }
    const safeError = errorMsg.replace(/[._\-!]/g, '\\$&');
    return { success: false, output: `❌ Failed to activate session: ${safeError}`, error: errorMsg, exitCode: KiteExitCode.NETWORK_ERROR };
  }
}
