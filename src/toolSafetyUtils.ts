import { logger } from "./logger";
import { ToolRegistry } from "./toolRegistry";
import { CommandResult } from "./commandGateway";

/**
 * Safe Tool Lookup Utility
 * 
 * Provides defensive access to tool registry with:
 * - Null/undefined checks
 * - Critical warnings on missing tools
 * - Fallback placeholder tools
 * - Telemetry for debugging
 */

export interface SafeToolResult {
  exists: boolean;
  name: string;
  typeName: string;
  handler: (userId: number, args: Record<string, unknown>) => Promise<CommandResult>;
  description: string;
  requiresAuthentication: boolean;
  requiresSession: boolean;
  economicAction: boolean;
  timeout: number;
}

/**
 * Creates a placeholder tool for missing/undefined tools
 * Prevents cascading failures in tool orchestration
 */
function createPlaceholderTool(toolName: string): SafeToolResult {
  const fallbackName = `placeholder_${toolName}`;
  
  logger.warn(
    { toolName, fallbackName },
    `[TOOL_SAFETY] Creating placeholder for missing tool - this will cause graceful failure`
  );

  return {
    exists: false,
    name: toolName,
    typeName: fallbackName, // Unique typeName to prevent lookups
    description: `[PLACEHOLDER] Tool "${toolName}" not found in registry`,
    requiresAuthentication: false,
    requiresSession: false,
    economicAction: false,
    timeout: 5000,
    handler: async (userId: number, args: Record<string, unknown>): Promise<CommandResult> => {
      return {
        success: false,
        output: `❌ Tool "${toolName}" is not available.\n\nThis tool may not be registered or properly initialized.\n\nPlease try:\n1. /agent-register\n2. /status (for diagnostics)\n3. /help (for supported commands)`
      };
    }
  };
}

/**
 * Safely get a tool from the registry
 * Returns placeholder if tool not found instead of undefined/null
 * 
 * @param toolRegistry - The tool registry instance
 * @param toolName - Name of the tool to retrieve
 * @param userId - User ID for logging context
 * @returns SafeToolResult with fallback placeholder if not found
 */
export function getToolSafely(
  toolRegistry: ToolRegistry | null | undefined,
  toolName: string | null | undefined,
  userId?: number
): SafeToolResult {
  const userContext = userId ? { userId } : {};

  // Validate inputs
  if (!toolRegistry) {
    logger.error(
      userContext,
      `[TOOL_SAFETY] Tool registry is null/undefined - returning placeholder for "${toolName}"`
    );
    return createPlaceholderTool(String(toolName || "unknown"));
  }

  if (!toolName || typeof toolName !== "string" || toolName.trim().length === 0) {
    logger.error(
      userContext,
      `[TOOL_SAFETY] Invalid tool name provided: "${toolName}" - returning placeholder`
    );
    return createPlaceholderTool(String(toolName || "unknown"));
  }

  try {
    // Attempt to get tool from registry
    const tool = toolRegistry.get(toolName.trim());

    if (!tool) {
      logger.warn(
        { ...userContext, toolName },
        `[TOOL_SAFETY] Tool not found in registry - returning placeholder`
      );
      return createPlaceholderTool(toolName);
    }

    // Validate tool structure
    if (!tool.typeName || typeof tool.typeName !== "string") {
      logger.error(
        { ...userContext, toolName, tool: JSON.stringify(tool).substring(0, 200) },
        `[TOOL_SAFETY] Tool has invalid typeName - returning placeholder`
      );
      return createPlaceholderTool(toolName);
    }

    if (typeof tool.handler !== "function") {
      logger.error(
        { ...userContext, toolName },
        `[TOOL_SAFETY] Tool handler is not a function - returning placeholder`
      );
      return createPlaceholderTool(toolName);
    }

    // Tool is valid - return it wrapped in SafeToolResult
    return {
      exists: true,
      name: tool.name,
      typeName: tool.typeName,
      description: tool.description,
      requiresAuthentication: tool.requiresAuthentication,
      requiresSession: tool.requiresSession,
      economicAction: tool.economicAction,
      timeout: tool.timeout,
      handler: tool.handler
    };

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { ...userContext, toolName, error: errorMsg },
      `[TOOL_SAFETY] Exception while looking up tool - returning placeholder`
    );
    return createPlaceholderTool(toolName);
  }
}

/**
 * Safely get tool safety configuration
 * Returns default safe config if tool not found
 */
export function getSafetyConfigSafely(
  toolRegistry: ToolRegistry | null | undefined,
  toolName: string | null | undefined,
  userId?: number
): {
  requiresSession: boolean;
  requiresAuthentication: boolean;
  economicAction: boolean;
  timeout: number;
  exists: boolean;
} {
  const userContext = userId ? { userId } : {};

  if (!toolRegistry || !toolName) {
    logger.warn(
      { ...userContext, toolName },
      `[TOOL_SAFETY] Cannot get safety config - registry or name is invalid`
    );
    return {
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 5000,
      exists: false
    };
  }

  try {
    const config = toolRegistry.getSafetyConfig(toolName);
    
    if (!config) {
      logger.warn(
        { ...userContext, toolName },
        `[TOOL_SAFETY] Safety config not found for tool`
      );
      return {
        requiresSession: false,
        requiresAuthentication: false,
        economicAction: false,
        timeout: 5000,
        exists: false
      };
    }

    return {
      ...config,
      exists: true
    };

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { ...userContext, toolName, error: errorMsg },
      `[TOOL_SAFETY] Exception getting safety config - returning defaults`
    );
    return {
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 5000,
      exists: false
    };
  }
}

/**
 * Validate all tools in registry have proper structure
 * Logs critical warnings for invalid tools
 */
export function validateToolRegistry(
  toolRegistry: ToolRegistry | null | undefined,
  userId?: number
): {
  valid: boolean;
  totalTools: number;
  validTools: number;
  invalidTools: string[];
} {
  const userContext = userId ? { userId } : {};

  if (!toolRegistry) {
    logger.error(userContext, `[TOOL_SAFETY] Tool registry is null/undefined`);
    return {
      valid: false,
      totalTools: 0,
      validTools: 0,
      invalidTools: []
    };
  }

  try {
    const allTools = toolRegistry.getAll();
    
    if (!Array.isArray(allTools)) {
      logger.error(
        userContext,
        `[TOOL_SAFETY] Tool registry getAll() did not return array`
      );
      return {
        valid: false,
        totalTools: 0,
        validTools: 0,
        invalidTools: ["registry.getAll() returned non-array"]
      };
    }

    let validCount = 0;
    const invalidTools: string[] = [];

    for (const tool of allTools) {
      if (!tool || typeof tool !== "object") {
        invalidTools.push(`(null/invalid object)`);
        continue;
      }

      const toolName = tool.name || "(unnamed)";

      // Check required fields
      if (!tool.name || typeof tool.name !== "string") {
        invalidTools.push(`${toolName}: missing name`);
        continue;
      }

      if (!tool.typeName || typeof tool.typeName !== "string") {
        invalidTools.push(`${toolName}: missing typeName`);
        continue;
      }

      if (tool.name !== tool.typeName) {
        invalidTools.push(`${toolName}: name/typeName mismatch`);
        continue;
      }

      if (typeof tool.handler !== "function") {
        invalidTools.push(`${toolName}: handler not function`);
        continue;
      }

      if (!tool.description || typeof tool.description !== "string") {
        invalidTools.push(`${toolName}: missing description`);
        continue;
      }

      validCount++;
    }

    const isValid = invalidTools.length === 0;

    if (!isValid) {
      logger.error(
        { ...userContext, validCount, invalidCount: invalidTools.length },
        `[TOOL_SAFETY] Tool registry validation failed - ${invalidTools.length} invalid tools detected`
      );
    } else {
      logger.info(
        { ...userContext, validCount },
        `[TOOL_SAFETY] ✓ Tool registry validation passed - all ${validCount} tools valid`
      );
    }

    return {
      valid: isValid,
      totalTools: allTools.length,
      validTools: validCount,
      invalidTools
    };

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { ...userContext, error: errorMsg },
      `[TOOL_SAFETY] Exception validating tool registry`
    );
    return {
      valid: false,
      totalTools: 0,
      validTools: 0,
      invalidTools: [errorMsg]
    };
  }
}
