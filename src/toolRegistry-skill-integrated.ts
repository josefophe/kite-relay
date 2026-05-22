/**
 * SKILL-INTEGRATED TOOL REGISTRY
 * 
 * Central catalog of all available tools, integrated from:
 * - Kite Passport skills (authenticateUser, kiteDiscovery, requestSession, etc.)
 * - Wallet operations (walletSend, balance checks)
 * - Session management (session creation, approval)
 * - Commerce operations (airtime, data purchase)
 * 
 * Each tool is:
 * - Validated at schema level
 * - Authorized per-user
 * - Executed with timeout
 * - Logged for audit trail
 */
import { CommandResult } from "./commandGateway";
import { authenticateUserSkill } from "./skills/authenticateUser";
import { walletBalanceSkill } from "./skills/walletBalance";
import { walletSendSkill } from "./skills/walletSend";
import { kiteDiscoverySkill } from "./skills/kiteDiscovery";
import { requestSessionSkill } from "./skills/requestSession";
import { x402ExecuteSkill } from "./skills/x402Execute";
import { manageAgentsSkill } from "./skills/manageAgents";
import { logger } from "./logger";

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface ToolSchema {
  type: "object";
  properties: Record<string, ToolParameter>;
  required: string[];
  additionalProperties?: boolean;
}

export interface Tool {
  // Metadata - CRITICAL: name and typeName MUST match exactly
  name: string;
  typeName: string;  // REQUIRED: Must equal name for AI orchestration
  description: string;
  category: "wallet" | "search" | "session" | "agent" | "telecom" | "auth";
  
  // Parameters schema (JSON Schema)
  parameters: ToolSchema;
  
  // Safety configuration
  requiresSession: boolean;
  requiresAuthentication: boolean;
  economicAction: boolean;
  timeout: number; // milliseconds
  
  // Handler function
  handler: (userId: number, args: Record<string, unknown>) => Promise<CommandResult>;
}

/**
 * RUNTIME VALIDATION: Ensure all tool definitions are valid
 * CRITICAL: Prevents silent AI orchestration failures
 */
function validateToolDefinition(tool: Tool): void {
  if (!tool.name || typeof tool.name !== "string") {
    throw new Error(`INVALID_TOOL_DEFINITION: Tool missing 'name' field`);
  }

  if (!tool.typeName || typeof tool.typeName !== "string") {
    throw new Error(`INVALID_TOOL_DEFINITION: Tool '${tool.name}' missing 'typeName'`);
  }

  // CRITICAL: name and typeName must match exactly
  if (tool.name !== tool.typeName) {
    throw new Error(
      `INVALID_TOOL_DEFINITION: Tool name='${tool.name}' but typeName='${tool.typeName}' - MUST MATCH EXACTLY`
    );
  }

  if (!tool.description || typeof tool.description !== "string") {
    throw new Error(`INVALID_TOOL_DEFINITION: Tool '${tool.name}' missing 'description'`);
  }

  if (!tool.handler || typeof tool.handler !== "function") {
    throw new Error(`INVALID_TOOL_DEFINITION: Tool '${tool.name}' missing 'handler'`);
  }

  if (!tool.parameters || typeof tool.parameters !== "object") {
    throw new Error(`INVALID_TOOL_DEFINITION: Tool '${tool.name}' missing 'parameters'`);
  }

  logger.debug({ tool: tool.name, typeName: tool.typeName }, "Tool validated");
}

/**
 * Tool Registry - Central catalog of all available tools
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.registerSkillBasedTools();
    this.validateAllTools();
  }

  /**
   * Register all skill-based tools
   */
  private registerSkillBasedTools(): void {
    // ════════════════════════════════════════════════════════════════
    // AUTHENTICATION TOOLS
    // ════════════════════════════════════════════════════════════════

    this.register({
      name: "authenticateUser",
      typeName: "authenticateUser",
      description: "Sign up or log in to Kite Passport",
      category: "auth",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action to perform",
            enum: ["login", "signup", "logout", "verify", "me"],
          },
          email: {
            type: "string",
            description: "Email address for login/signup",
          },
          code: {
            type: "string",
            description: "OTP verification code",
          },
        },
        required: ["action"],
      },
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        try {
          const result = await authenticateUserSkill({
            userId,
            action: (args.action as "login" | "signup" | "logout" | "verify" | "me") || "login",
            email: args.email ? (args.email as string) : undefined,
            code: args.code ? (args.code as string) : undefined,
          });

          return {
            success: result.success,
            output: result.output,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { success: false, output: `Authentication error: ${msg}` };
        }
      },
    });

    // ════════════════════════════════════════════════════════════════
    // WALLET TOOLS
    // ════════════════════════════════════════════════════════════════

    this.register({
      name: "walletBalance",
      typeName: "walletBalance",
      description: "Get current wallet balance across all assets",
      category: "wallet",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      requiresSession: false,
      requiresAuthentication: true,
      economicAction: false,
      timeout: 10000,
      handler: async (userId: number) => {
        try {
          const result = await walletBalanceSkill({ userId });


          return {
            success: result.success,
            output: result.output,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { success: false, output: `Balance check failed: ${msg}` };
        }
      },
    });

    this.register({
      name: "walletSend",
      typeName: "walletSend",
      description: "Send USDC or KITE to a wallet address",
      category: "wallet",
      parameters: {
        type: "object",
        properties: {
          toAddress: {
            type: "string",
            description: "Recipient wallet address (0x format)",
          },
          amount: {
            type: "string",
            description: "Amount to send (e.g., '5' for 5 USDC)",
          },
          asset: {
            type: "string",
            description: "Asset to send",
            enum: ["USDC", "KITE"],
          },
        },
        required: ["toAddress", "amount"],
      },
      requiresSession: false,
      requiresAuthentication: true,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        try {
          const result = await walletSendSkill({
            userId,
            toAddress: (args.toAddress as string) || "",
            amount: (args.amount as string) || "",
            asset: args.asset ? (args.asset as string) : "USDC",
          });

          return {
            success: result.success,
            output: result.output,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { success: false, output: `Transfer failed: ${msg}` };
        }
      },
    });

    // ════════════════════════════════════════════════════════════════
    // DISCOVERY TOOLS
    // ════════════════════════════════════════════════════════════════

    this.register({
      name: "kiteDiscovery",
      typeName: "kiteDiscovery",
      description: "Search and discover AI services in Kite catalog",
      category: "search",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action to perform",
            enum: ["list", "search", "get"],
          },
          query: {
            type: "string",
            description: "Search query",
          },
          serviceId: {
            type: "string",
            description: "Service ID to get details for",
          },
        },
        required: ["action"],
      },
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        try {
          const result = await kiteDiscoverySkill({
            userId,
            action: (args.action as "list" | "search" | "get") || "list",
            query: args.query ? (args.query as string) : undefined,
            serviceId: args.serviceId ? (args.serviceId as string) : undefined,
          });

          return {
            success: result.success,
            output: result.output,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { success: false, output: `Discovery error: ${msg}` };
        }
      },
    });

    // ════════════════════════════════════════════════════════════════
    // SESSION TOOLS
    // ════════════════════════════════════════════════════════════════

    this.register({
      name: "requestSession",
      typeName: "requestSession",
      description: "Create and manage spending sessions for autonomous agents",
      category: "session",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action to perform",
            enum: ["register", "create", "list", "status", "use"],
          },
          delegation: {
            type: "object",
            description: "Delegation JSON with payment policy (required for create action)",
          },
          requestId: {
            type: "string",
            description: "Request ID for status check",
          },
          wait: {
            type: "boolean",
            description: "Wait for approval when checking status",
          },
          statusFilter: {
            type: "string",
            description: "Filter sessions by status (active, expired, etc)",
          },
          sessionId: {
            type: "string",
            description: "Session ID to activate",
          },
        },
        required: ["action"],
      },
      requiresSession: false,
      requiresAuthentication: true,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        try {
          const result = await requestSessionSkill({
            userId,
            action: (args.action as "register" | "create" | "list" | "status" | "use") || "list",
            delegation: args.delegation ? (args.delegation as string | Record<string, unknown>) : undefined,
            requestId: args.requestId ? (args.requestId as string) : undefined,
            wait: args.wait ? (args.wait as boolean) : undefined,
            statusFilter: args.statusFilter ? (args.statusFilter as string) : undefined,
            sessionId: args.sessionId ? (args.sessionId as string) : undefined,
          });

          return {
            success: result.success,
            output: result.output,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { success: false, output: `Session error: ${msg}` };
        }
      },
    });

    // ════════════════════════════════════════════════════════════════
    // PAYMENT EXECUTION TOOLS
    // ════════════════════════════════════════════════════════════════

    this.register({
      name: "x402Execute",
      typeName: "x402Execute",
      description: "Execute paid API request through active spending session",
      category: "session",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "API endpoint URL (https://...)",
          },
          method: {
            type: "string",
            description: "HTTP method",
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
          },
          headers: {
            type: "object",
            description: "HTTP headers as JSON object",
          },
          body: {
            type: "object",
            description: "Request body as JSON object",
          },
          sessionId: {
            type: "string",
            description: "Active session ID",
          },
        },
        required: ["url"],
      },
      requiresSession: true,
      requiresAuthentication: true,
      economicAction: true,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        try {
          const result = await x402ExecuteSkill({
            userId,
            url: (args.url as string) || "",
            method: args.method ? (args.method as string) : "POST",
            headers: args.headers ? (args.headers as Record<string, string>) : undefined,
            body: args.body ? (args.body as Record<string, unknown>) : undefined,
            sessionId: args.sessionId ? (args.sessionId as string) : undefined,
          });

          return {
            success: result.success,
            output: result.output,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { success: false, output: `Execution failed: ${msg}` };
        }
      },
    });

    // ════════════════════════════════════════════════════════════════
    // AGENT MANAGEMENT TOOLS (READ-ONLY)
    // ════════════════════════════════════════════════════════════════

    this.register({
      name: "manageAgents",
      typeName: "manageAgents",
      description: "List agents and sessions, check user authentication (READ-ONLY)",
      category: "agent",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Read-only action to perform",
            enum: ["list-agents", "list-sessions", "check-user"],
          },
          statusFilter: {
            type: "string",
            description: "Filter sessions by status (active or expired)",
            enum: ["active", "expired"],
          },
        },
        required: ["action"],
      },
      requiresSession: false,
      requiresAuthentication: true,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        try {
          const result = await manageAgentsSkill({
            userId,
            action: (args.action as "list-agents" | "list-sessions" | "check-user") || "check-user",
            statusFilter: args.statusFilter ? (args.statusFilter as "active" | "expired") : undefined,
          });

          return {
            success: result.success,
            output: result.output,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { success: false, output: `Management error: ${msg}` };
        }
      },
    });
  }

  /**
   * Register a tool
   */
  private register(tool: Tool): void {
    validateToolDefinition(tool);
    this.tools.set(tool.name, tool);
  }

  /**
   * Validate all registered tools
   */
  private validateAllTools(): void {
    logger.info({ count: this.tools.size }, "Validating tool registry");

    if (this.tools.size === 0) {
      throw new Error("FATAL: Tool registry empty - no tools registered!");
    }

    let validCount = 0;
    for (const [name, tool] of this.tools.entries()) {
      try {
        validateToolDefinition(tool);
        validCount++;
      } catch (error) {
        logger.error({ tool: name, error }, "Tool validation failed");
        throw error;
      }
    }

    logger.info(
      { validCount, totalCount: this.tools.size },
      "All tools validated successfully"
    );
  }

  /**
   * Get tool by name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get handler for tool
   */
  getHandler(name: string): ((userId: number, args: Record<string, unknown>) => Promise<CommandResult>) | undefined {
    const tool = this.tools.get(name);
    return tool?.handler;
  }

  /**
   * Get all tools as array
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): Tool[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category);
  }

  /**
   * Format tools for Vercel AI SDK
   */
  toVercelAIFormat(): any[] {
    return this.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object" as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    }));
  }
}

// Global instance
let globalRegistry: ToolRegistry | null = null;

/**
 * Get or create global tool registry
 */
export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

/**
 * Create new tool registry instance
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
