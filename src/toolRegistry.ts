import { CommandResult } from "./commandGateway";

/**
 * PHASE 3: Tool Registry for AI Orchestration
 * 
 * Strongly-typed tool definitions that the LLM can invoke.
 * Each tool is:
 * - Validated at schema level
 * - Authorized per-user
 * - Executed with timeout
 * - Logged for audit trail
 */

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
  category: "wallet" | "search" | "session" | "agent" | "telecom";
  
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
  // Check name exists
  if (!tool.name || typeof tool.name !== "string") {
    throw new Error(
      `INVALID_TOOL_DEFINITION: Tool missing 'name' field -> ${JSON.stringify(tool)}`
    );
  }

  // Check typeName exists
  if (!tool.typeName || typeof tool.typeName !== "string") {
    throw new Error(
      `INVALID_TOOL_DEFINITION: Tool '${tool.name}' missing 'typeName' field -> ${JSON.stringify(tool)}`
    );
  }

  // CRITICAL: name and typeName must match exactly
  if (tool.name !== tool.typeName) {
    throw new Error(
      `INVALID_TOOL_DEFINITION: Tool name='${tool.name}' but typeName='${tool.typeName}' - MUST MATCH EXACTLY`
    );
  }

  // Check description
  if (!tool.description || typeof tool.description !== "string") {
    throw new Error(
      `INVALID_TOOL_DEFINITION: Tool '${tool.name}' missing 'description'`
    );
  }

  // Check handler
  if (!tool.handler || typeof tool.handler !== "function") {
    throw new Error(
      `INVALID_TOOL_DEFINITION: Tool '${tool.name}' missing 'handler' function`
    );
  }

  // Check parameters schema
  if (!tool.parameters || typeof tool.parameters !== "object") {
    throw new Error(
      `INVALID_TOOL_DEFINITION: Tool '${tool.name}' missing 'parameters' schema`
    );
  }

  // Validation passed
  console.log(`[AUDIT] ✓ Tool validated: ${tool.name} (typeName: ${tool.typeName})`);
}

/**
 * Tool Registry - Central catalog of all available tools
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor(handlers: Record<string, Function>) {
    this.registerTools(handlers);
    
    // ════════════════════════════════════════════════════════════════
    // CRITICAL: Validate all tools immediately after registration
    // This prevents silent AI orchestration failures
    // ════════════════════════════════════════════════════════════════
    console.log(`[BOOT] Validating ${this.tools.size} registered tools...`);
    
    if (this.tools.size === 0) {
      throw new Error(
        "FATAL: Tool registry empty - no tools registered!"
      );
    }

    let validCount = 0;
    for (const [name, tool] of this.tools.entries()) {
      try {
        validateToolDefinition(tool);
        validCount++;
      } catch (validationError) {
        console.error(
          `[FATAL] Tool validation failed for '${name}':`,
          validationError
        );
        throw validationError;
      }
    }

    console.log(`[BOOT] ✓ All ${validCount} tools validated successfully`);
  }

  private registerTools(handlers: Record<string, Function>) {
    // ========== WALLET TOOLS ==========

    this.register({
      name: "walletBalance",
      typeName: "walletBalance",
      description: "Get current wallet balance across all assets",
      category: "wallet",
      parameters: {
        type: "object",
        properties: {},
        required: []
      },
      requiresSession: false,
      requiresAuthentication: true,
      economicAction: false,
      timeout: 10000,
      handler: async (userId: number) => {
        const handleBalance = handlers.handleBalance as Function;
        return handleBalance(userId);
      }
    });

    this.register({
      name: "walletSend",
      typeName: "walletSend",
      description: "Transfer funds to a recipient wallet address",
      category: "wallet",
      parameters: {
        type: "object",
        properties: {
          recipientAddress: {
            type: "string",
            description: "Recipient wallet address (0x... format)"
          },
          amount: {
            type: "string",
            description: "Amount to transfer (e.g., '100')"
          },
          asset: {
            type: "string",
            description: "Asset type",
            enum: ["USDC", "KITE"]
          }
        },
        required: ["recipientAddress", "amount", "asset"]
      },
      requiresSession: true,
      requiresAuthentication: true,
      economicAction: true,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleWalletSend = handlers.handleWalletSend as Function;
        return handleWalletSend(
          userId,
          String(args.recipientAddress || ""),
          String(args.amount || ""),
          String(args.asset || "")
        );
      }
    });

    this.register({
      name: "sendToUsername",
      typeName: "sendToUsername",
      description: "Send funds to another Telegram user by username",
      category: "wallet",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "Target Telegram username (with or without @)"
          },
          amount: {
            type: "string",
            description: "Amount to send (e.g., '5 USDC' or '5 KITE')"
          },
          asset: {
            type: "string",
            description: "Optional asset symbol if not included in amount"
          }
        },
        required: ["username", "amount"]
      },
      requiresSession: true,
      requiresAuthentication: true,
      economicAction: true,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleSendToUsername = handlers.handleSendToUsername as Function;
        return handleSendToUsername(
          userId,
          String(args.username || ""),
          String(args.amount || ""),
          args.asset ? String(args.asset) : undefined
        );
      }
    });

    // ========== SEARCH TOOLS ==========

    this.register({
      name: "ksearch",
      typeName: "ksearch",
      description: "Discover AI services using ksearch service catalog discovery",
      category: "search",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (e.g., 'cheapest AI image API', 'weather APIs', 'price comparison')",
            minLength: 3,
            maxLength: 500
          }
        },
        required: ["query"]
      },
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleSearch = handlers.handleSearch as Function;
        return handleSearch(userId, args.query as string);
      }
    });

    this.register({
      name: "ksearchServices",
      typeName: "ksearchServices",
      description: "List AI services based on a search query",
      category: "search",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term for service discovery",
            minLength: 3,
            maxLength: 500
          }
        },
        required: []
      },
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleKsearchServicesList = handlers.handleKsearchServicesList as Function;
        return handleKsearchServicesList(userId, args.query as string | undefined);
      }
    });

    this.register({
      name: "ksearchServiceDetails",
      typeName: "ksearchServiceDetails",
      description: "Fetch detailed metadata for a discovered service",
      category: "search",
      parameters: {
        type: "object",
        properties: {
          serviceId: {
            type: "string",
            description: "Service ID to inspect"
          }
        },
        required: ["serviceId"]
      },
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleKsearchServiceGet = handlers.handleKsearchServiceGet as Function;
        return handleKsearchServiceGet(userId, args.serviceId as string);
      }
    });

    this.register({
      name: "ksearchCompareServices",
      typeName: "ksearchCompareServices",
      description: "Compare pricing, payment model, and capabilities for multiple services",
      category: "search",
      parameters: {
        type: "object",
        properties: {
          serviceIds: {
            type: "string",
            description: "Comma-separated service IDs to compare"
          }
        },
        required: ["serviceIds"]
      },
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleKsearchServiceGet = handlers.handleKsearchServiceGet as Function;
        const raw = String(args.serviceIds || "").trim();
        const ids = raw.split(/\s*,\s*/).filter(Boolean);

        if (ids.length === 0) {
          return { success: false, output: "Provide one or more service IDs separated by commas." } as CommandResult;
        }

        let output = "";
        for (const id of ids) {
          const result = await handleKsearchServiceGet(userId, id);
          if (!result.success) {
            return result;
          }
          output += `\n${result.output}\n`;
        }

        return { success: true, output: `🔎 Service comparison results:\n${output.trim()}` } as CommandResult;
      }
    });

    this.register({
      name: "ksearchServicePricing",
      typeName: "ksearchServicePricing",
      description: "Inspect service pricing details for a specific service",
      category: "search",
      parameters: {
        type: "object",
        properties: {
          serviceId: {
            type: "string",
            description: "Service ID to inspect pricing"
          }
        },
        required: ["serviceId"]
      },
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleKsearchServiceGet = handlers.handleKsearchServiceGet as Function;
        const result = await handleKsearchServiceGet(userId, args.serviceId as string);
        if (!result.success) {
          return result;
        }
        return { success: true, output: result.output } as CommandResult;
      }
    });

    this.register({
      name: "ksearchServiceCategories",
      typeName: "ksearchServiceCategories",
      description: "Inspect service categories and tags for a specific service",
      category: "search",
      parameters: {
        type: "object",
        properties: {
          serviceId: {
            type: "string",
            description: "Service ID to inspect categories"
          }
        },
        required: ["serviceId"]
      },
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleKsearchServiceGet = handlers.handleKsearchServiceGet as Function;
        const result = await handleKsearchServiceGet(userId, args.serviceId as string);
        if (!result.success) {
          return result;
        }
        return { success: true, output: result.output } as CommandResult;
      }
    });

    // ========== SESSION TOOLS ==========

    this.register({
      name: "agentRegister",
      typeName: "agentRegister",
      description: "Register a new autonomous agent type for your wallet",
      category: "agent",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Agent type label (e.g., 'trader', 'research-agent')"
          }
        },
        required: ["type"]
      },
      requiresSession: false,
      requiresAuthentication: true,
      economicAction: false,
      timeout: 20000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleAgentRegister = handlers.handleAgentRegister as Function;
        return handleAgentRegister(userId, String(args.type || ""));
      }
    });

    this.register({
      name: "agentCreate",
      typeName: "agentCreate",
      description: "Create a scheduled autonomous agent with a natural language goal",
      category: "agent",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Description of what the agent should do"
          }
        },
        required: ["description"]
      },
      requiresSession: false,
      requiresAuthentication: false,
      economicAction: false,
      timeout: 20000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleAgentCreate = handlers.handleAgentCreate as Function;
        return handleAgentCreate(userId, String(args.description || ""));
      }
    });

    this.register({
      name: "sessionCreate",
      typeName: "sessionCreate",
      description: "Create a spending session with per-transaction limit and TTL",
      category: "session",
      parameters: {
        type: "object",
        properties: {
          maxAmountPerTx: {
            type: "string",
            description: "Maximum spending per transaction (e.g., '100' USDC)"
          },
          ttl: {
            type: "string",
            description: "Time-to-live for session (e.g., '24h', '1w', '30d')"
          },
          taskSummary: {
            type: "string",
            description: "Optional description of intended use"
          }
        },
        required: ["maxAmountPerTx", "ttl"]
      },
      requiresSession: false,
      requiresAuthentication: true,
      economicAction: false,
      timeout: 20000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleSessionCreate = handlers.handleSessionCreate as Function;
        return handleSessionCreate(userId, args.maxAmountPerTx as string, args.ttl as string, args.taskSummary as string | undefined);
      }
    });

    this.register({
      name: "sessionList",
      typeName: "sessionList",
      description: "List all active and past sessions",
      category: "session",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status",
            enum: ["active", "expired", "completed"]
          }
        },
        required: []
      },
      requiresSession: false,
      requiresAuthentication: true,
      economicAction: false,
      timeout: 10000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleSessionList = handlers.handleSessionList as Function;
        return handleSessionList(userId, args.status as string | undefined);
      }
    });

    this.register({
      name: "sessionExecute",
      typeName: "sessionExecute",
      description: "Execute an economic action within an active session",
      category: "session",
      parameters: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description: "Session ID to execute within"
          },
          action: {
            type: "string",
            description: "Action to execute (varies by session type)"
          }
        },
        required: ["sessionId", "action"]
      },
      requiresSession: true,
      requiresAuthentication: true,
      economicAction: true,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleSessionExecute = handlers.handleSessionExecute as Function;
        return handleSessionExecute(userId, args.sessionId as string, args.action as string);
      }
    });

    // ========== AGENT TOOLS ==========

    this.register({
      name: "agentList",
      typeName: "agentList",
      description: "List all registered autonomous agents for this user",
      category: "agent",
      parameters: {
        type: "object",
        properties: {},
        required: []
      },
      requiresSession: false,
      requiresAuthentication: true,
      economicAction: false,
      timeout: 10000,
      handler: async (userId: number) => {
        const handleAgentList = handlers.handleAgentList as Function;
        return handleAgentList(userId);
      }
    });

    // ========== TELECOM TOOLS (STUB) ==========
    // Airtime purchase tool — wired to real handler when available
    this.register({
      name: "airtimePurchase",
      typeName: "airtimePurchase",
      description: "Purchase airtime using stablecoin settlement (Phase 4)",
      category: "telecom",
      parameters: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            description: "Telecom provider code (e.g., 'MTN', 'GLO', 'AIRTEL')"
          },
          phoneNumber: {
            type: "string",
            description: "Phone number to receive airtime (E.164 or local)"
          },
          amountNGN: {
            type: "number",
            description: "Amount in NGN to purchase"
          }
        },
        required: ["provider", "phoneNumber", "amountNGN"]
      },
      requiresSession: true,
      requiresAuthentication: true,
      economicAction: true,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleBuyAirtime = handlers.handleBuyAirtime as Function;
        // call handleBuyAirtime(userId, phoneNumber, amountStr, providerCode)
        return handleBuyAirtime(userId, String(args.phoneNumber), String(args.amountNGN), String(args.provider));
      }
    });

    // Data purchase tool — wired to real handler
    this.register({
      name: "dataPurchase",
      typeName: "dataPurchase",
      description: "Purchase mobile data using stablecoin settlement (Phase 4)",
      category: "telecom",
      parameters: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            description: "Telecom provider code (e.g., 'MTN', 'GLO', 'AIRTEL')"
          },
          recipient: {
            type: "string",
            description: "Phone number or @username to receive data"
          },
          amountNGN: {
            type: "number",
            description: "Amount in NGN to pay for data"
          }
        },
        required: ["provider", "recipient", "amountNGN"]
      },
      requiresSession: true,
      requiresAuthentication: true,
      economicAction: true,
      timeout: 30000,
      handler: async (userId: number, args: Record<string, unknown>) => {
        const handleBuyData = handlers.handleBuyData as Function;
        return handleBuyData(userId, String(args.recipient), String(args.amountNGN), String(args.provider));
      }
    });
  }

  private register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  private assertToolIntegrity(tool: Tool, context: string): void {
    if (!tool || typeof tool !== "object") {
      throw new Error(`TOOL_REGISTRY_CORRUPTED: ${context} returned invalid tool object`);
    }

    if (!tool.name || typeof tool.name !== "string") {
      throw new Error(`TOOL_REGISTRY_CORRUPTED: ${context} returned tool with invalid name -> ${JSON.stringify(tool)}`);
    }

    if (!tool.typeName || typeof tool.typeName !== "string") {
      throw new Error(`TOOL_REGISTRY_CORRUPTED: Tool '${tool.name}' has undefined or invalid typeName`);
    }
  }

  private assertToolsHealthy(tools: Tool[], context: string): void {
    if (!Array.isArray(tools)) {
      throw new Error(`TOOL_REGISTRY_CORRUPTED: ${context} did not return an array of tools`);
    }

    for (const tool of tools) {
      this.assertToolIntegrity(tool, context);
    }
  }

  /**
   * Get a specific tool by name
   */
  get(name: string): Tool | undefined {
    if (!name || typeof name !== "string") {
      throw new Error("TOOL_REGISTRY_INVALID_ARGUMENT: Tool name must be a non-empty string");
    }

    const tool = this.tools.get(name);
    if (tool) {
      this.assertToolIntegrity(tool, `get('${name}')`);
    }

    return tool;
  }

  /**
   * Get all registered tools
   * GUARD: Validates that all tools have valid typeName
   */
  getAll(): Tool[] {
    const allTools = Array.from(this.tools.values());
    this.assertToolsHealthy(allTools, "getAll()");
    return allTools;
  }

  /**
   * Backward-compatible alias for older consumer code
   */
  getAllTools(): Tool[] {
    return this.getAll();
  }

  /**
   * Get tools filtered by category
   */
  getByCategory(category: string): Tool[] {
    if (!category || typeof category !== "string") {
      throw new Error("TOOL_REGISTRY_INVALID_ARGUMENT: Category must be a non-empty string");
    }

    const tools = Array.from(this.tools.values()).filter(t => t.category === category);
    this.assertToolsHealthy(tools, `getByCategory('${category}')`);
    return tools;
  }

  /**
   * Convert tools to Vercel AI SDK format
   * Used by LLM provider when defining available tools
   */
  toVercelFormat(): Record<string, any> {
    const result: Record<string, any> = {};
    const allTools = Array.from(this.tools.values());
    this.assertToolsHealthy(allTools, "toVercelFormat()");

    for (const tool of allTools) {
      result[tool.name] = {
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties: tool.parameters.properties,
          required: tool.parameters.required
        }
      };
    }
    
    return result;
  }

  /**
   * Get tool safety configuration
   */
  getSafetyConfig(toolName: string): {
    requiresSession: boolean;
    requiresAuthentication: boolean;
    economicAction: boolean;
    timeout: number;
  } | null {
    const tool = this.tools.get(toolName);
    if (!tool) return null;
    
    return {
      requiresSession: tool.requiresSession,
      requiresAuthentication: tool.requiresAuthentication,
      economicAction: tool.economicAction,
      timeout: tool.timeout
    };
  }

  /**
   * List all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get summary of all tools
   */
  getSummary(): string {
    const categories = new Set<string>();
    const toolsByCategory: Record<string, string[]> = {};
    
    for (const tool of this.tools.values()) {
      categories.add(tool.category);
      if (!toolsByCategory[tool.category]) {
        toolsByCategory[tool.category] = [];
      }
      toolsByCategory[tool.category].push(`• ${tool.name}: ${tool.description}`);
    }
    
    let summary = "📋 Available Tools\n";
    summary += "━━━━━━━━━━━━━━━━━━━━━━\n\n";
    
    for (const category of Array.from(categories).sort()) {
      summary += `**${category.toUpperCase()}**\n`;
      summary += (toolsByCategory[category] || []).join("\n");
      summary += "\n\n";
    }
    
    return summary;
  }
}

/**
 * Create and return a fully initialized tool registry
 */
export function createToolRegistry(handlers: Record<string, Function>): ToolRegistry {
  return new ToolRegistry(handlers);
}
