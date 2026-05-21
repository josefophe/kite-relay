/**
 * SKILL WRAPPER: Manage Agents
 * 
 * Wraps kpass agent commands with:
 * - Agent registration
 * - Agent listing
 * - Agent type validation
 * - Output formatting
 */
import { executeKpass } from "../userRuntime";
import { logger } from "../logger";
import { SkillExecutionOutput, KiteExitCode } from "./skillTypes";

export interface ManageAgentsInput {
  userId: number;
  action: "register" | "list";
  agentType?: string; // trader, farmer, collector, etc.
}

/**
 * Register and manage autonomous agents
 * 
 * Actions:
 * - register: Register new agent type
 * - list: List user's registered agents
 */
export async function manageAgentsSkill(input: ManageAgentsInput): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    switch (input.action) {
      case "register":
        return await handleRegister(input.userId, input.agentType);
      case "list":
        return await handleList(input.userId);
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
      output: `❌ Agent management error: ${errorMsg}`,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

async function handleRegister(userId: number, agentType?: string): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!agentType || agentType.trim().length === 0) {
    return {
      success: false,
      output: "❌ Please specify agent type (e.g., trader, farmer, collector)",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  const type = agentType.toLowerCase().trim();
  
  // Validate agent type
  const validTypes = ["trader", "farmer", "collector", "monitor", "autonomous"];
  if (!validTypes.includes(type)) {
    return {
      success: false,
      output: `❌ Unknown agent type: ${type}\nValid types: ${validTypes.join(", ")}`,
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  try {
    const output = await executeKpass(
      userId,
      ["agent:register", "--type", type, "--output", "json"],
      "agent-register"
    );

    let responseData: Record<string, unknown> = {};
    let agentId = "";
    try {
      responseData = JSON.parse(output);
      agentId = (responseData.agentId || responseData.agent_id || "") as string;
    } catch {
      // Continue even if parse fails
    }

    // Wrapped inside a clear Markdown container layout block
    let message = `*✅ Agent Registered*\n`;
    message += `\`\`\`\n`;
    message += `Type:     ${type}\n`;
    message += `Agent ID: ${agentId || "N/A"}\n`;
    message += `\`\`\``;

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
    if (errorMsg.includes("code 4")) {
      return {
        success: false,
        output: `❌ Agent type not supported: ${type}`,
        exitCode: KiteExitCode.NOT_FOUND,
      };
    }
    return {
      success: false,
      output: `❌ Agent registration failed: ${errorMsg}`,
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

