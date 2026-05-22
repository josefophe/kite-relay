/**
 * SKILL WRAPPER: Manage Agents (READ-ONLY)
 * 
 * Wraps kpass user management commands with:
 * - Agent listing (kpass user agents)
 * - Session listing (kpass user sessions)
 * - User verification (kpass me)
 * 
 * NOTE: This skill is READ-ONLY. Agent registration is handled by request-session skill.
 */
import { executeKpass } from "../userRuntime";
import { logger } from "../logger";
import { SkillExecutionOutput, KiteExitCode } from "./skillTypes";

export interface ManageAgentsInput {
  userId: number;
  action: "list-agents" | "list-sessions" | "check-user";
  statusFilter?: "active" | "expired"; // Only for list-sessions
}

/**
 * List and inspect agents and sessions (READ-ONLY)
 * 
 * Actions:
 * - list-agents: List user's registered agents
 * - list-sessions: List user's spending sessions
 * - check-user: Verify current authentication
 */
export async function manageAgentsSkill(input: ManageAgentsInput): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    switch (input.action) {
      case "list-agents":
        return await handleListAgents(input.userId);
      case "list-sessions":
        return await handleListSessions(input.userId, input.statusFilter);
      case "check-user":
        return await handleCheckUser(input.userId);
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
      "skill:manageAgents failed"
    );
    return {
      success: false,
      output: `❌ Management error: ${errorMsg}`,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

async function handleCheckUser(userId: number): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    const output = await executeKpass(
      userId,
      ["me", "--output", "json"],
      "user-check"
    );

    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
    } catch {
      // Continue even if parse fails
    }

    const message = `*✅ User Verified*\n\`\`\`\nUser ID: ${(responseData.user_id || "N/A")}\nEmail: ${(responseData.email || "N/A")}\n\`\`\``;

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
        output: "❌ Not authenticated. Please run /login first",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }
    return {
      success: false,
      output: `❌ User check failed: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleListAgents(userId: number): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    const output = await executeKpass(
      userId,
      ["user", "agents", "--output", "json"],
      "agents-list"
    );

    let responseData: Record<string, unknown> = {};
    let agents: any[] = [];
    try {
      responseData = JSON.parse(output);
      agents = (responseData.agents || []) as any[];
    } catch {
      // Continue even if parse fails
    }

    let message = `*🤖 Your Registered Agents*\n\n`;

    if (agents.length > 0) {
      // Protect agent lists using structured text alignment blocks
      message += `\`\`\``;
      agents.forEach((agent: any, idx: number) => {
        const num = idx + 1;
        const type = agent.type || "Unknown";
        const id = agent.id || "N/A";
        const status = agent.status || "active";

        message += `\n[${num}] ${type.toUpperCase()}\n`;
        message += `    ID:     ${id}\n`;
        message += `    Status: ${status}\n`;
      });
      message += `\`\`\``;
    } else {
      // Fixed the URL-encoded emoji fragment and escaped the trailing dot safely
      message = "ℹ️ No agents registered yet\. Use `/agent-register` to create one\.";
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
      output: `❌ Failed to list agents: ${errorMsg.replace(/[._\-!]/g, '\\$&')}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleListSessions(userId: number, statusFilter?: "active" | "expired"): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    const args = ["user", "sessions", "--output", "json"];
    if (statusFilter) {
      args.push("--status", statusFilter);
    }

    const output = await executeKpass(userId, args, "sessions-list");

    let responseData: Record<string, unknown> = {};
    let sessions: any[] = [];
    try {
      responseData = JSON.parse(output);
      sessions = (responseData.sessions || []) as any[];
    } catch {
      // Continue even if parse fails
    }

    let message = `*📋 Your Spending Sessions*\n\n`;

    if (sessions.length > 0) {
      message += `\`\`\``;
      sessions.forEach((session: any, idx: number) => {
        const num = idx + 1;
        const status = session.status || "unknown";
        const agentType = session.agent_type || "N/A";
        const id = session.id || "N/A";
        const spent = session.usage?.spent_total || "0.00";
        const budget = session.delegation?.payment_policy?.max_total_amount || "unlimited";

        message += `\n[${num}] ${agentType.toUpperCase()} (${status})\n`;
        message += `    ID:     ${id}\n`;
        message += `    Spent:  ${spent} / ${budget}\n`;
      });
      message += `\`\`\``;
    } else {
      message = "ℹ️ No sessions found\. Use `request-session` to create one\.";
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
      output: `❌ Failed to list sessions: ${errorMsg.replace(/[._\-!]/g, '\\$&')}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

