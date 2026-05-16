/**
 * DEPRECATED: Session Manager
 * 
 * This file is deprecated and no longer used.
 * 
 * REASON: The authentication model has been refactored to use kpass's native
 * filesystem-based session management instead of custom JWT encryption.
 * 
 * MIGRATION:
 * - kpass now manages its own session state at HOME/.kpass/config.json
 * - Each Telegram user has an isolated HOME directory (/data/users/<id>)
 * - No custom token storage or encryption is needed
 * - All session operations go through kpass CLI
 * 
 * See src/commandGateway.ts for the new authentication flow:
 * - handleLoginInit: calls `kpass login init --email <email>`
 * - handleVerify: calls `kpass login verify --login-id <id> --code <otp>`
 * 
 * This file is kept for reference only. It should be safe to delete.
 */

// @deprecated - Do not use
export function saveSession(userId: number, token: string): void {
  throw new Error("saveSession is deprecated. Use kpass's native session management.");
}

// @deprecated - Do not use
export function loadSession(userId: number): unknown | null {
  throw new Error("loadSession is deprecated. Use kpass's native session management.");
}

// @deprecated - Do not use
export function clearSession(userId: number): void {
  throw new Error("clearSession is deprecated. Use kpass's native session management.");
}

// @deprecated - Do not use
export function encryptSecret(secret: string): unknown {
  throw new Error("encryptSecret is deprecated. Use kpass's native session management.");
}

// @deprecated - Do not use
export function decryptSecret(encrypted: unknown): string {
  throw new Error("decryptSecret is deprecated. Use kpass's native session management.");
}

// @deprecated - Do not use
export function hasActiveSession(userId: number): boolean {
  throw new Error("hasActiveSession is deprecated. Use kpass's native session management.");
}
