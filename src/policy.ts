import { ensurePlainText } from "./utils";

// Allowed commands in the command gateway
// Authentication (login/verify/logout/signup)
// Wallet (balance, send)
// Search (search)
// Status & diagnostics (status, telemetry)
// Agent Sessions (register, create, list, status, use, execute)
export const allowedCommands = new Set([
  // Authentication
  "login",
  "verify",
  "logout",
  "signup",
  // Account
  "status",
  "version",
  "me",
  // Testnet
  "faucet",
  // Wallet
  "balance",
  "wallet-send",
  // Search
  "search",
  "ksearch-health",
  "services",
  "service",
  "catalog-export",
  // Agent Infrastructure
  "agent-register",
  "session-create",
  "session-list",
  "session-status",
  "session-use",
  "session-execute",
]);

export function isCommandAllowed(command: string): boolean {
  return allowedCommands.has(command);
}

export function sanitizeSearchQuery(query: string): string {
  const sanitized = ensurePlainText(query, 300);
  if (sanitized.length === 0) {
    throw new Error("Search query cannot be empty.");
  }
  return sanitized;
}
