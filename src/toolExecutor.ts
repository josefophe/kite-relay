import { logger } from "./logger";
import { CommandResult } from "./commandGateway";

/**
 * PHASE 3: Tool Executor
 * 
 * Maps AI tool calls to existing command handlers.
 * Enforces:
 * - Per-user isolation
 * - Safety boundaries
 * - Input validation
 * - Timeout handling
 * - Error recovery
 */

export interface ExecutionContext {
  userId: number;
  toolName: string;
  parameters: Record<string, unknown>;
  timeout: number;
}

/**
 * Safety check before executing tool
 */
function validateToolExecution(context: ExecutionContext): {
  valid: boolean;
  error?: string;
} {
  // Validate user ID
  if (!Number.isInteger(context.userId) || context.userId <= 0) {
    return { valid: false, error: "Invalid user ID" };
  }

  // Validate tool name is alphanumeric with underscores
  if (!/^[a-zA-Z0-9_]+$/.test(context.toolName)) {
    return { valid: false, error: "Invalid tool name" };
  }

  // Validate parameters are objects
  if (typeof context.parameters !== "object" || context.parameters === null) {
    return { valid: false, error: "Invalid parameters" };
  }

  // Validate timeout is reasonable
  if (context.timeout < 1000 || context.timeout > 60000) {
    return { valid: false, error: "Invalid timeout" };
  }

  return { valid: true };
}

/**
 * Execute tool with timeout and error handling
 */
export async function executeToolWithTimeout(
  context: ExecutionContext,
  handler: (userId: number, args: Record<string, unknown>) => Promise<CommandResult>
): Promise<CommandResult> {
  // 1. Validate execution context
  const validation = validateToolExecution(context);
  if (!validation.valid) {
    return {
      success: false,
      output: `❌ Validation error: ${validation.error}`
    };
  }

  // 2. Log execution start
  const startTime = Date.now();
  logger.debug(
    { userId: context.userId, tool: context.toolName },
    "tool execution starting"
  );

  try {
    // 3. Execute tool with timeout
    const result = await Promise.race([
      handler(context.userId, context.parameters),
      new Promise<CommandResult>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool timeout (${context.timeout}ms)`)),
          context.timeout
        )
      )
    ]);

    // 4. Log successful execution
    const duration = Date.now() - startTime;
    logger.info(
      {
        userId: context.userId,
        tool: context.toolName,
        success: result.success,
        duration
      },
      "telemetry: tool execution succeeded"
    );

    return result;

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    // 5. Log failed execution
    logger.error(
      {
        userId: context.userId,
        tool: context.toolName,
        error: errorMsg,
        duration
      },
      "telemetry: tool execution failed"
    );

    // 6. Return user-friendly error
    if (errorMsg.includes("timeout")) {
      return {
        success: false,
        output: `⏱️ Tool execution timed out after ${context.timeout}ms. Please try again.`
      };
    }

    return {
      success: false,
      output: `❌ Tool execution failed: ${errorMsg}`
    };
  }
}

/**
 * Validate tool parameters against schema
 */
export function validateToolParameters(
  schema: { properties: Record<string, any>; required: string[] },
  parameters: Record<string, unknown>
): {
  valid: boolean;
  errors?: string[];
} {
  const errors: string[] = [];

  // Check required fields
  for (const required of schema.required) {
    if (!(required in parameters)) {
      errors.push(`Missing required parameter: ${required}`);
    }
  }

  // Check parameter types
  for (const [key, value] of Object.entries(parameters)) {
    if (!(key in schema.properties)) {
      errors.push(`Unknown parameter: ${key}`);
      continue;
    }

    const propSchema = schema.properties[key];

    // Type validation
    if (propSchema.type) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (actualType !== propSchema.type) {
        errors.push(
          `Parameter ${key}: expected ${propSchema.type}, got ${actualType}`
        );
      }
    }

    // Enum validation
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      errors.push(
        `Parameter ${key}: value must be one of ${propSchema.enum.join(", ")}`
      );
    }

    // String validations
    if (typeof value === "string") {
      if (propSchema.minLength && value.length < propSchema.minLength) {
        errors.push(
          `Parameter ${key}: minimum length is ${propSchema.minLength}`
        );
      }
      if (propSchema.maxLength && value.length > propSchema.maxLength) {
        errors.push(
          `Parameter ${key}: maximum length is ${propSchema.maxLength}`
        );
      }
      if (propSchema.pattern && !new RegExp(propSchema.pattern).test(value)) {
        errors.push(`Parameter ${key}: does not match required pattern`);
      }
    }

    // Number validations
    if (typeof value === "number") {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        errors.push(`Parameter ${key}: minimum value is ${propSchema.minimum}`);
      }
      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        errors.push(`Parameter ${key}: maximum value is ${propSchema.maximum}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Sanitize parameters for logging (remove sensitive data)
 */
export function sanitizeParametersForLogging(
  parameters: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parameters)) {
    // Hide sensitive data
    if (
      key.toLowerCase().includes("key") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("password") ||
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("address") ||
      key.toLowerCase().includes("seed")
    ) {
      sanitized[key] = "***REDACTED***";
    } else if (typeof value === "string" && value.length > 100) {
      sanitized[key] = value.substring(0, 50) + "...";
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Format error response for user
 */
export function formatErrorResponse(
  toolName: string,
  error: string,
  suggestedRecovery?: string
): CommandResult {
  let output = `❌ ${toolName} failed\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `Error: ${error}\n`;

  if (suggestedRecovery) {
    output += `\n💡 Try: ${suggestedRecovery}`;
  }

  return { success: false, output };
}

/**
 * Format success response for user
 */
export function formatSuccessResponse(
  toolName: string,
  output: string,
  metadata?: Record<string, any>
): CommandResult {
  let result = `✅ ${toolName} successful\n`;
  result += `━━━━━━━━━━━━━━━━━━━━━\n`;
  result += output;

  if (metadata) {
    result += "\n\n📊 Details:";
    for (const [key, value] of Object.entries(metadata)) {
      result += `\n• ${key}: ${value}`;
    }
  }

  return { success: true, output: result };
}

/**
 * Extract error message from command result
 */
export function extractErrorMessage(result: CommandResult): string {
  if (result.success) {
    return "";
  }

  // Try to extract first line of error
  const lines = result.output.split("\n");
  for (const line of lines) {
    if (line.includes("❌") || line.includes("Error") || line.includes("error")) {
      return line.replace(/[❌✅⚠️]/g, "").trim();
    }
  }

  return result.output.substring(0, 100);
}

/**
 * Parse economic action from result
 */
export function parseEconomicAction(result: CommandResult): {
  type?: string;
  amount?: string;
  recipient?: string;
  txHash?: string;
  explorer?: string;
} {
  const action: {
    type?: string;
    amount?: string;
    recipient?: string;
    txHash?: string;
    explorer?: string;
  } = {};

  // Extract transaction hash
  const txMatch = result.output.match(/TX[:\s]+([0x][a-fA-F0-9]+)/i);
  if (txMatch) {
    action.txHash = txMatch[1];
  }

  // Extract explorer link
  const explorerMatch = result.output.match(/https:\/\/[^\s]+\/?/);
  if (explorerMatch) {
    action.explorer = explorerMatch[0];
  }

  // Extract amount
  const amountMatch = result.output.match(/(\d+(?:\.\d+)?)\s+(USDC|KITE|USD)/i);
  if (amountMatch) {
    action.amount = `${amountMatch[1]} ${amountMatch[2]}`;
  }

  return action;
}

/**
 * Retry handler with exponential backoff
 */
export async function executeWithRetry(
  context: ExecutionContext,
  handler: (userId: number, args: Record<string, unknown>) => Promise<CommandResult>,
  maxRetries: number = 3
): Promise<CommandResult> {
  let lastError: CommandResult | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await executeToolWithTimeout(context, handler);

      if (result.success) {
        return result;
      }

      lastError = result;

      // Check if error is retryable
      const errorMsg = result.output.toLowerCase();
      if (
        errorMsg.includes("timeout") ||
        errorMsg.includes("rate limit") ||
        errorMsg.includes("temporarily")
      ) {
        // Exponential backoff
        const delayMs = Math.pow(2, attempt) * 1000;
        logger.warn(
          { userId: context.userId, attempt: attempt + 1, delayMs },
          "retrying after delay"
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      // Non-retryable error
      return result;

    } catch (error) {
      lastError = {
        success: false,
        output: `Attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // All retries exhausted
  return (
    lastError || {
      success: false,
      output: "Tool execution failed after all retry attempts"
    }
  );
}
