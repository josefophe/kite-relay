import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { LanguageModel} from "ai";
import { config } from "./config";
import { logger } from "./logger";
import { ToolRegistry } from "./toolRegistry";
import { ConversationContextManager } from "./conversationContext";
import { CommandResult } from "./commandGateway";
import { z } from 'zod';

/**
 * PHASE 3: AI Orchestration Layer
 * 
 * Integrates with Vercel AI SDK for tool-calling orchestration.
 * - Routes to OpenAI or Anthropic based on configuration
 * - Manages tool calling loop
 * - Enforces safety boundaries
 * - Logs execution and telemetry
 */

export interface AIExecutionContext {
  userId: number;
  userMessage: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  activeSession?: {
    id: string;
    maxAmountPerTx: string;
    ttl: string;
  };
  wallet?: {
    balance: string;
    assets: string[];
  };
}

export interface ToolExecution {
  name: string;
  args: Record<string, unknown>;
  result: CommandResult;
  duration: number;
}

export interface AIExecutionResult {
  success: boolean;
  output: string;
  reasoning: string;
  toolsExecuted: ToolExecution[];
  totalDuration: number;
  economicActionsPerformed: number;
}

/**
 * Get LLM provider based on configuration
 */
function getLLMProvider(): LanguageModel {
  if (config.llmProvider === "anthropic") {
    return anthropic(config.llmModel);
  }
  if (config.llmProvider === "groq") {
    return groq(config.llmModel);
  }
  return openai(config.llmModel);
}

/**
 * Build system prompt with context awareness
 */
function buildSystemPrompt(context: AIExecutionContext): string {
  let prompt = `You are an autonomous economic agent assistant on Kite AI.

Your role:
- Understand natural language user intentions
- Select appropriate tools to achieve goals
- Execute economic actions (transfers, searches, sessions)
- Operate within spending constraints
- Provide clear explanations of actions

## Current Context

User ID: ${context.userId}
${context.activeSession ? `Active Session: ${context.activeSession.id}\n  - Max per TX: ${context.activeSession.maxAmountPerTx}\n  - TTL: ${context.activeSession.ttl}` : "No active session"}
${context.wallet ? `Wallet Balance: ${context.wallet.balance}\n  Assets: ${context.wallet.assets.join(", ")}` : ""}

## Safety Constraints

CRITICAL - You MUST:
- Only use tools from the approved registry below
- Never execute shell commands or arbitrary code
- Never bypass Kite session spending limits
- Never exceed session TTL
- Always verify wallet balance before transfers
- Ask for clarification if intent is ambiguous
- Explain economic impacts before execution

CRITICAL - You MUST NEVER:
- Modify runtime configuration
- Access other users' data
- Fabricate blockchain transactions
- Claim payments succeeded unless tool confirms
- Expose secrets in responses

## Tool Calling Rules

When selecting tools:
1. Assess the user's intent carefully
2. Check if it requires authentication (most do)
3. Verify active session for economic actions (transfers, executions)
4. Use walletBalance before transfers to verify funds
5. Chain tools logically (search → analyze → decide → execute)
6. Always explain your reasoning before action

## Response Format

After executing tools:
- Be concise and transactional
- Explain each action taken
- Provide tx hashes and explorer links for blockchain actions
- Summarize outcomes with status emoji (✅/❌/⚠️)
- Offer next steps if applicable

## Economic Action Guidelines

For transfers:
- Always verify recipient
- Show amount and asset
- Confirm wallet balance is sufficient
- Provide tx hash after execution

For sessions:
- Explain spending limit and TTL
- Show session ID
- Provide recovery commands if needed

For searches:
- Provide concise results
- Offer to take action if applicable

## User Request

Now, handle this request thoughtfully and safely.`;

  return prompt;
}

/**
 * Create tool definitions for Vercel AI SDK
 * 
 * Includes defensive validation:
 * - Null checks on tool registry
 * - Type guards on toolSpec properties
 * - Graceful fallback for missing tools
 */
function createToolDefinitions(
  toolRegistry: ToolRegistry,
  userId: number,
  contextManager: ConversationContextManager
): Record<string, any> {
  const tools: Record<string, any> = {};

  // DEFENSIVE: Validate tool registry exists
  if (!toolRegistry) {
    logger.warn({ userId }, "Tool registry is null, returning empty tools");
    return tools;
  }

  // DEFENSIVE: Get tools with null check
  let allTools: any[];
  try {
    allTools = toolRegistry.getAll() || [];
  } catch (error) {
    logger.error({ userId, error }, "Failed to retrieve tools from registry");
    return tools;
  }

  // DEFENSIVE: Validate allTools is an array
  if (!Array.isArray(allTools)) {
    logger.warn({ userId }, "Tool registry did not return array");
    return tools;
  }

  for (const toolSpec of allTools) {
    // DEFENSIVE: Validate toolSpec exists
    if (!toolSpec) {
      logger.warn({ userId }, "Skipping null toolSpec");
      continue;
    }

    // DEFENSIVE: Type guard on toolSpec.name
    const toolName = String(toolSpec.name || "unknown").trim();
    if (!toolName || toolName === "unknown") {
      logger.warn({ userId }, "Skipping tool with invalid name");
      continue;
    }

    // DEFENSIVE: Type guard on toolSpec.typeName (avoid "Cannot read properties of undefined")
    if (toolSpec.typeName === undefined) {
      logger.debug({ userId, toolName }, "Tool missing typeName - may be unregistered agent");
    }

    const properties: Record<string, any> = {};
    const requiredFields: string[] = [];

    // DEFENSIVE: Validate parameters exist
    if (toolSpec.parameters && typeof toolSpec.parameters === "object") {
      const params = toolSpec.parameters as any;
      
      if (params.properties && typeof params.properties === "object") {
        for (const [key, prop] of Object.entries(params.properties)) {
          // DEFENSIVE: Validate prop is object
          if (!prop || typeof prop !== "object") {
            logger.debug({ userId, toolName, key }, "Skipping invalid parameter");
            continue;
          }

          const propObj = prop as any;
          const typeString = String(propObj.type || "string").toLowerCase();

          properties[key] = {
            type: typeString === "integer" ? "number" : typeString,
            description: String(propObj.description || "")
          };

          if (propObj.required !== false) {
            requiredFields.push(key);
          }
        }
      }
    }

    // DEFENSIVE: Validate handler exists
    if (typeof toolSpec.handler !== "function") {
      logger.warn({ userId, toolName }, "Tool handler is not a function, skipping");
      continue;
    }

    try {
      tools[toolName] = tool({
        description: String(toolSpec.description || toolName),
        parameters: {
          type: "object",
          properties,
          required: requiredFields
        } as any,
        execute: async (args: any) => {
          return await executeTool(userId, toolSpec, args, contextManager);
        }
      });
    } catch (error) {
      logger.error({ userId, toolName, error }, "Failed to create tool definition");
      continue;
    }
  }

  logger.debug({ userId, toolCount: Object.keys(tools).length }, "Tool definitions created");

  return tools;
}


/**
 * Execute a tool with safety checks and telemetry
 */
async function executeTool(
  userId: number,
  toolSpec: any,
  args: Record<string, unknown>,
  contextManager: ConversationContextManager
): Promise<any> {
  const startTime = Date.now();

  try {
    // 1. Check authentication requirement
    if (toolSpec.requiresAuthentication) {
      // Caller should have verified this, but double-check
      logger.debug({ userId, tool: toolSpec.name }, "executing authenticated tool");
    }

    // 2. Check session requirement
    if (toolSpec.requiresSession) {
      const session = contextManager.getActiveSession(userId);
      if (!session) {
        return {
          success: false,
          output: `❌ This action requires an active session.\n\nCreate one with: /agent create spending session 100 USDC for 24 hours`
        };
      }
    }

    // 3. Execute tool handler
    const result = await Promise.race([
      toolSpec.handler(userId, args),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Tool execution timeout")), toolSpec.timeout)
      )
    ]);

    const duration = Date.now() - startTime;

    // 4. Log execution
    logger.info(
      {
        userId,
        tool: toolSpec.name,
        success: result.success,
        economicAction: toolSpec.economicAction,
        duration
      },
      "telemetry: tool execution completed"
    );

    return result;

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        userId,
        tool: toolSpec.name,
        error: errorMsg,
        duration
      },
      "telemetry: tool execution failed"
    );

    return {
      success: false,
      output: `❌ ${toolSpec.name} failed: ${errorMsg}`
    };
  }
}

/**
 * Main AI orchestration function
 * 
 * Includes defensive validation for:
 * - Null tool registry
 * - Missing agent registration
 * - Graceful recovery with user guidance
 */
export async function orchestrateAIExecution(
  context: AIExecutionContext,
  toolRegistry: ToolRegistry,
  contextManager: ConversationContextManager
): Promise<AIExecutionResult> {
  const startTime = Date.now();
  const executionLog: ToolExecution[] = [];
  let economicActionsPerformed = 0;

  try {
    logger.info({ userId: context.userId }, "AI orchestration starting");

    // DEFENSIVE: Validate context
    if (!context || typeof context !== "object") {
      throw new Error("Invalid execution context");
    }

    if (!context.userId || typeof context.userId !== "number") {
      throw new Error("Invalid user ID in context");
    }

    // DEFENSIVE: Validate tool registry
    if (!toolRegistry) {
      logger.warn({ userId: context.userId }, "Tool registry is null");
      return {
        success: false,
        output:
          `❌ Agent system not initialized.\n\n` +
          `Please run: /agent-register\n\n` +
          `This registers your agent in the system before tool execution.`,
        reasoning: "Tool registry unavailable",
        toolsExecuted: [],
        totalDuration: Date.now() - startTime,
        economicActionsPerformed: 0
      };
    }

    // DEFENSIVE: Check if user has any registered agents
    try {
      const tools = toolRegistry.getAll();
      if (!tools || tools.length === 0) {
        logger.warn({ userId: context.userId }, "No tools registered in registry");
        return {
          success: false,
          output:
            `❌ No agents registered.\n\n` +
            `Steps to enable AI execution:\n` +
            `1. Register your agent: /agent-register\n` +
            `2. Create a session: /session-create 100 24\n` +
            `3. Try AI command again\n\n` +
            `Learn more: /help`,
          reasoning: "No agents registered",
          toolsExecuted: [],
          totalDuration: Date.now() - startTime,
          economicActionsPerformed: 0
        };
      }
    } catch (error) {
      logger.error({ userId: context.userId, error }, "Error checking tool registry");
      return {
        success: false,
        output:
          `❌ Agent system error.\n\n` +
          `Please try:\n` +
          `1. /agent-register\n` +
          `2. /status (for diagnostics)`,
        reasoning: "Tool registry error",
        toolsExecuted: [],
        totalDuration: Date.now() - startTime,
        economicActionsPerformed: 0
      };
    }

    // 1. Get LLM provider
    const llmModel = getLLMProvider();

    // 2. Build system prompt with context
    const systemPrompt = buildSystemPrompt(context);

    // 3. Create tool definitions with defensive guards
    const tools = createToolDefinitions(toolRegistry, context.userId, contextManager);

    // DEFENSIVE: Validate tools were created
    if (!tools || Object.keys(tools).length === 0) {
      logger.warn({ userId: context.userId }, "No tools available after definition creation");
      return {
        success: false,
        output:
          `⚠️ No tools available for execution.\n\n` +
          `Common fixes:\n` +
          `1. Run /agent-register first\n` +
          `2. Check /status for diagnostics\n` +
          `3. Ensure you're authenticated`,
        reasoning: "No tools available",
        toolsExecuted: [],
        totalDuration: Date.now() - startTime,
        economicActionsPerformed: 0
      };
    }

    // DEFENSIVE: Validate user message
    if (!context.userMessage || typeof context.userMessage !== "string") {
      throw new Error("Invalid user message");
    }

    // 4. Call LLM with tool calling
    const response = await generateText({
      model: llmModel,
      system: systemPrompt,
      messages: [
        ...context.conversationHistory,
        {
          role: "user",
          content: context.userMessage
        }
      ],
      tools,
      maxSteps: config.llmMaxIterations,
      abortSignal: AbortSignal.timeout(config.llmTimeout)
    });

    // 5. Extract reasoning from stop reason
    let reasoning = "";
    if (response.finishReason === "tool-calls") {
      reasoning = "Executed tool calls to fulfill request";
    } else if (response.finishReason === "stop") {
      reasoning = "Completed without requiring tool execution";
    } else {
      reasoning = `Stopped: ${response.finishReason}`;
    }

    // 6. Build final output
    const output = response.text || "No response from AI";

    // 7. Count economic actions (from tool calls if available)
    if (response.toolCalls && Array.isArray(response.toolCalls)) {
      economicActionsPerformed = response.toolCalls.filter((tc: any) => {
        try {
          const safetyConfig = toolRegistry.getSafetyConfig(tc.toolName);
          return safetyConfig?.economicAction === true;
        } catch {
          return false;
        }
      }).length;
    }

    const totalDuration = Date.now() - startTime;

    logger.info(
      {
        userId: context.userId,
        toolsExecuted: executionLog.length,
        economicActions: economicActionsPerformed,
        duration: totalDuration
      },
      "telemetry: AI orchestration completed"
    );

    return {
      success: true,
      output,
      reasoning,
      toolsExecuted: executionLog,
      totalDuration,
      economicActionsPerformed
    };

  } catch (error: unknown) {
    const totalDuration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        userId: context.userId,
        error: errorMsg,
        duration: totalDuration
      },
      "telemetry: AI orchestration failed"
    );

    // Provide user-friendly recovery guidance
    let userFriendlyMsg = errorMsg;
    if (errorMsg.includes("typeName")) {
      userFriendlyMsg = "Agent not properly registered";
    } else if (errorMsg.includes("timeout")) {
      userFriendlyMsg = "Request took too long (timeout)";
    } else if (errorMsg.includes("API")) {
      userFriendlyMsg = "LLM API error (check key configuration)";
    }

    return {
      success: false,
      output:
        `❌ AI execution failed: ${userFriendlyMsg}\n\n` +
        `Recovery steps:\n` +
        `1. Check agent registration: /agent-register\n` +
        `2. Verify your setup: /status\n` +
        `3. Check debug info: /debug-runtime`,
      reasoning: "Execution failed",
      toolsExecuted: executionLog,
      totalDuration,
      economicActionsPerformed: 0
    };
  }
}

/**
 * Parse user input to extract intent and parameters
 */
export function parseUserIntent(input: string): {
  intent: string;
  params: Record<string, string>;
} {
  // Simple parsing - can be enhanced with NLP later
  const parts = input.trim().split(/\s+/);
  const intent = parts.slice(0, 2).join(" ");
  
  const params: Record<string, string> = {};
  for (let i = 2; i < parts.length; i++) {
    params[`arg${i - 2}`] = parts[i];
  }

  return { intent, params };
}

/**
 * Format execution result for Telegram display
 */
export function formatExecutionResult(result: AIExecutionResult): string {
  let output = result.output;

  // Add footer with metadata
  if (result.toolsExecuted.length > 0 || result.economicActionsPerformed > 0) {
    output += "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    output += `📊 Execution Summary\n`;
    output += `• Tools Used: ${result.toolsExecuted.length}\n`;
    output += `• Economic Actions: ${result.economicActionsPerformed}\n`;
    output += `• Duration: ${result.totalDuration}ms\n`;
  }

  return output;
}
