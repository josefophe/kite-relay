#!/usr/bin/env node

/**
 * Tool Registry Diagnostic Script
 * 
 * Verifies all tools are properly registered and can be safely accessed.
 * Run this when you see "Agent not properly registered" errors.
 */

import { createToolRegistry } from "./toolRegistry";
import { config } from "./config";
import { logger } from "./logger";
import { validateToolRegistry } from "./toolSafetyUtils";

// Mock handlers for diagnostic purposes
const mockHandlers: Record<string, Function> = {
  handleBalance: async () => ({ success: true, output: "Mock balance" }),
  handleSearch: async () => ({ success: true, output: "Mock search" }),
  handleKsearchServicesList: async () => ({ success: true, output: "Mock services" }),
  handleKsearchServiceGet: async () => ({ success: true, output: "Mock service" }),
  handleWalletSend: async () => ({ success: true, output: "Mock send" }),
  handleSendToUsername: async () => ({ success: true, output: "Mock send-username" }),
  handleAgentRegister: async () => ({ success: true, output: "Mock register" }),
  handleAgentCreate: async () => ({ success: true, output: "Mock create agent" }),
  handleSessionCreate: async () => ({ success: true, output: "Mock session" }),
  handleSessionList: async () => ({ success: true, output: "Mock sessions list" }),
  handleSessionStatus: async () => ({ success: true, output: "Mock session status" }),
  handleSessionExecute: async () => ({ success: true, output: "Mock execute" }),
};

async function runDiagnostics() {
  console.log("🔍 Tool Registry Diagnostic Report");
  console.log("=====================================\n");

  try {
    const registry = createToolRegistry(mockHandlers);
    const validation = validateToolRegistry(registry);

    console.log(`Total Tools:    ${validation.totalTools}`);
    console.log(`Valid Tools:    ${validation.validTools}`);
    console.log(`Invalid Tools:  ${validation.invalidTools.length}\n`);

    if (validation.invalidTools.length > 0) {
      console.log("❌ Invalid Tools Detected:");
      validation.invalidTools.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`);
      });
      console.log();
    }

    if (validation.valid) {
      console.log("✅ Tool registry is healthy - all tools properly registered");
      console.log("\n📋 Tool Summary:");
      const tools = registry.getAll();
      tools.forEach((t) => {
        console.log(`   • ${t.name} (typeName: ${t.typeName})`);
      });
    } else {
      console.log("⚠️  Tool registry has issues - fix above problems first");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Diagnostic failed:", error);
    process.exit(1);
  }
}

runDiagnostics().catch(console.error);
