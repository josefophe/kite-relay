/**
 * SKILL WRAPPER: Kite Discovery
 *
 * Wraps ksearch services commands with:
 * - Service listing
 * - Service search
 * - Service detail fetching
 * - Output formatting
 */
import { executeKsearch } from "../userRuntime";
import { logger } from "../logger";
import { SkillExecutionOutput, KiteExitCode } from "./skillTypes";

export interface KiteDiscoveryInput {
  userId: number;
  action: "list" | "get" | "search";
  query?: string;
  serviceId?: string;
  limit?: number;
}

/**
 * Search and discover services in Kite catalog
 *
 * Actions:
 * - list: Show all services
 * - search: Find services by query
 * - get: Get details for a specific service
 */
export async function kiteDiscoverySkill(input: KiteDiscoveryInput): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    switch (input.action) {
      case "list":
        return await handleList(input.userId, input.limit);
      case "search":
        return await handleSearch(input.userId, input.query, input.limit);
      case "get":
        return await handleGet(input.userId, input.serviceId);
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
      "skill:kiteDiscovery failed"
    );
    return {
      success: false,
      output: `❌ Service discovery error: ${errorMsg}`,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

async function handleList(userId: number, limit: number = 10): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    const output = await executeKsearch(
      userId,
      [
        "services",
        "list",
        "--payment-approach", "x402",
        "--asset", "USDC",
        "--limit", String(limit),
        "--output", "json",
      ],
      "services-list"
    );
    
    let responseData: Record<string, unknown> = {};
    let services: any[] = [];
    try {
      responseData = JSON.parse(output);
      services = (responseData.services || []) as any[];
    } catch {
      // Continue even if parse fails
    }

    let message = `🔍 *Available Services*\n\n`;
    
    if (services.length > 0) {
      message += `\`\`\``;
      services.slice(0, 5).forEach((service: any, idx: number) => {
        const num = idx + 1;
        const name = service.name || "Unknown";
        const id = service.id || "N/A";
        const price = service.price_per_call || "N/A";
        
        message += `\n[${num}] ${name}\n`;
        message += `    ID:    ${id}\n`;
        message += `    Price: ${price} USDC/call\n`;
      });
      message += `\`\`\`\n`;
      message += `_Showing ${Math.min(5, services.length)} of ${services.length} services_`;
    } else {
      message = "ℹ️ No services found\.";
    }

    return {
      success: true,
      output: message,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: `❌ Failed to list services: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleSearch(
  userId: number,
  query?: string,
  limit: number = 10
): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!query || query.trim().length === 0) {
    return {
      success: false,
      output: "❌ Please provide a search query",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  // Clean the user query from triggering parsing bugs
  const escapedQuery = query.replace(/[*_`\[\]()]/g, "");

  try {
    const args = [
      "services",
      "list",
      "--payment-approach", "x402",
      "--asset", "USDC",
      "--query", escapedQuery,
      "--limit", String(limit),
      "--output", "json",
    ];
    
    const output = await executeKsearch(userId, args, "services-search");
    let responseData: Record<string, unknown> = {};
    let services: any[] = [];
    try {
      responseData = JSON.parse(output);
      services = (responseData.services || []) as any[];
    } catch {
      // Continue even if parse fails
    }

    let message = `🔍 *Services matching "${escapedQuery}"*\n\n`;
    
    if (services.length > 0) {
      message += `\`\`\``;
      services.slice(0, 5).forEach((service: any, idx: number) => {
        const num = idx + 1;
        const name = service.name || "Unknown";
        const id = service.id || "N/A";
        const desc = service.description || "No description";
        
        message += `\n[${num}] ${name}\n`;
        message += `    ID:   ${id}\n`;
        message += `    Desc: ${desc}\n`;
      });
      message += `\`\`\`\n`;
      message += `_Found ${services.length} matching services_`;
    } else {
      message = `ℹ️ No services found matching "${escapedQuery}"\.`;
    }

    return {
      success: true,
      output: message,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: `❌ Search failed: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleGet(userId: number, serviceId?: string): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!serviceId || serviceId.trim().length === 0) {
    return {
      success: false,
      output: "❌ Please provide a service ID",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  try {
    const output = await executeKsearch(
      userId,
      ["services", "get", "--service-id", serviceId, "--output", "json"],
      "services-get"
    );
    
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
    } catch {
      // Continue even if parse fails
    }

    const service = (responseData.service || responseData) as any;
    
    let message = `📋 *Service Details*\n`;
    message += `\`\`\`\n`;
    message += `Name:   ${service.name || "Unknown"}\n`;
    message += `ID:     ${service.id || "N/A"}\n`;
    message += `Desc:   ${service.description || "No description"}\n`;
    message += `Price:  ${service.price_per_call || "N/A"} USDC per call\n`;
    message += `Status: ${service.status || "active"}\n`;
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
        output: "❌ Service not found\.",
        exitCode: KiteExitCode.NOT_FOUND,
      };
    }
    return {
      success: false,
      output: `❌ Failed to get service: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}
