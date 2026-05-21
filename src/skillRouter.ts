/**
 * SKILL ROUTER
 * 
 * Routes resolved intents to appropriate tools in the registry.
 * Handles:
 * - Intent → Tool mapping
 * - Entity → Parameter transformation
 * - Pre-execution safety checks
 * - Error handling
 */

import { Intent } from "./intentResolver";
import { getToolRegistry } from "./toolRegistry-skill-integrated";
import { logger } from "./logger";
import { CommandResult } from "./commandGateway";

export interface RoutingDecision {
  toolName: string;
  parameters: Record<string, unknown>;
  confidence: number;
  reason: string;
}

/**
 * Route an intent to the appropriate tool
 */
export async function routeIntentToTool(
  userId: number,
  intent: Intent
): Promise<{ decision: RoutingDecision; result?: CommandResult; error?: string }> {
  // 1. Validate intent
  if (!intent.action || intent.confidence < 0.5) {
    return {
      error: "Could not determine intent clearly. Please be more specific.",
      decision: { toolName: "", parameters: {}, confidence: 0, reason: "Low confidence" },
    };
  }

  // 2. Map intent action to tool name
  const decision = mapIntentToTool(intent);
  if (!decision) {
    return {
      error: `No tool available for action: ${intent.action}`,
      decision: { toolName: "", parameters: {}, confidence: 0, reason: "No matching tool" },
    };
  }

  // 3. Get tool from registry
  const registry = getToolRegistry();
  const tool = registry.getTool(decision.toolName);

  if (!tool) {
    logger.error(
      { toolName: decision.toolName },
      "[TOOL_SAFETY] CRITICAL: Tool not found in registry - verify tool registration and skillRouter routing"
    );
    return {
      error: `Tool "${decision.toolName}" not found - please try again or use /status to check registration`,
      decision,
    };
  }

  // 4. Validate tool can be used
  const validation = validateToolUsage(tool, userId, decision.parameters);
  if (!validation.valid) {
    return {
      error: validation.error,
      decision,
    };
  }

  // 5. Execute tool
  logger.info(
    {
      userId,
      toolName: decision.toolName,
      parameters: decision.parameters,
      intentAction: intent.action,
    },
    "Executing tool via intent routing"
  );

  try {
    const result = await tool.handler(userId, decision.parameters);
    return { decision, result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ toolName: decision.toolName, error: msg }, "Tool execution failed");
    return {
      error: `Tool execution failed: ${msg}`,
      decision,
    };
  }
}

/**
 * Map intent action to tool name in registry
 */
function mapIntentToTool(intent: Intent): RoutingDecision | null {
  // Direct mappings
  const intentToToolMap: Record<string, string> = {
    walletSend: "walletSend",
    walletBalance: "walletBalance",
    kiteDiscovery: "kiteDiscovery",
    requestSession: "requestSession",
    x402Execute: "x402Execute",
    manageAgents: "manageAgents",
    authenticateUser: "authenticateUser",
  };

  const toolName = intentToToolMap[intent.action];

  if (!toolName) {
    return null;
  }

  // Transform entities to parameters
  const parameters = transformEntitiesToParameters(toolName, intent.entities);

  return {
    toolName,
    parameters,
    confidence: intent.confidence,
    reason: intent.description,
  };
}

/**
 * Transform intent entities to tool parameters
 */
function transformEntitiesToParameters(
  toolName: string,
  entities: Record<string, unknown>
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  switch (toolName) {
    case "walletSend":
      params.toAddress = entities.recipient;
      params.amount = entities.amount;
      params.asset = entities.asset || "USDC";
      break;

    case "kiteDiscovery":
      params.action = "search";
      params.query = entities.query;
      break;

    case "requestSession":
      params.action = "create";
      params.maxAmountPerTx = entities.amount;
      params.ttl = entities.ttl;
      params.taskSummary = entities.description;
      break;

    case "x402Execute":
      params.url = entities.url;
      params.method = "POST";
      params.sessionId = entities.sessionId;
      break;

    case "manageAgents":
      params.action = "register";
      params.agentType = entities.agentType;
      break;

    case "authenticateUser":
      params.action = "login";
      params.email = entities.email;
      break;
  }

  // Filter out undefined parameters
  return Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined));
}

/**
 * Validate that user can use a tool
 */
function validateToolUsage(
  tool: any,
  userId: number,
  parameters: Record<string, unknown>
): { valid: boolean; error?: string } {
  // TODO: Implement full validation including:
  // - Authentication check if tool.requiresAuthentication
  // - Session check if tool.requiresSession
  // - Balance check if tool is economic
  // - Rate limit check

  return { valid: true };
}

/**
 * Get all available tools for discovery
 */
export function getAvailableTools(): Array<{ name: string; description: string }> {
  const registry = getToolRegistry();
  return registry
    .getAllTools()
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): Array<{ name: string; description: string }> {
  const registry = getToolRegistry();
  return registry
    .getToolsByCategory(category)
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
}
