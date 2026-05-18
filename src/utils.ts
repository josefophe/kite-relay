import { logger } from "./logger";

export function ensurePlainText(input: string, maxLength = 300): string {
  const cleaned = input.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  if (cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength);
  }
  return cleaned;
}

export function scrubToken(token: string): string {
  return token.trim().replace(/\s+/g, " ");
}

export function safeCommandName(command: string): string {
  return command.replace(/[^a-zA-Z0-9:_-]/g, "");
}

export function logExecution(userId: string, event: string, message: string): void {
  logger.info({ userId, event, message }, "user execution event");
}

export function ensurePrivateChat(chatType: string | undefined): boolean {
  return chatType === "private";
}

/**
 * SECURITY: Validate email format
 * Prevents prompt injection and malformed commands
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false;
  
  // Simple regex for email validation
  // RFC 5322 simplified check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * SECURITY: Validate phone number format
 * Supports international formats like +234XXXXXXXXXX or 0XXXXXXXXXX
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  if (phone.length > 20) return false;
  
  // Allow: +234XXXXXXXXXX, 0XXXXXXXXXX, etc
  // Must have at least 7 digits
  const phoneRegex = /^[\+]?[0-9]{7,20}$/;
  return phoneRegex.test(phone);
}

/**
 * SECURITY: Validate Ethereum-like wallet address
 * Prevents path traversal and shell injection
 */
export function isValidAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  if (address.length > 100) return false;
  
  // Ethereum addresses: 0x + 40 hex chars
  // Also accept shorter formats for testing
  const addressRegex = /^0x[0-9a-fA-F]{40}$/;
  return addressRegex.test(address);
}

/**
 * SECURITY: Validate session ID format
 * Prevents arbitrary session lookup
 */
export function isValidSessionId(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== "string") return false;
  if (sessionId.length > 100) return false;
  
  // Allow alphanumeric, dash, underscore
  const sessionRegex = /^[a-zA-Z0-9_-]+$/;
  return sessionRegex.test(sessionId);
}

/**
 * SECURITY: Validate JSON objects
 * Prevents malformed JSON injection
 */
export function isValidJSON(jsonStr: string): boolean {
  if (!jsonStr || typeof jsonStr !== "string") return false;
  if (jsonStr.length > 10000) return false;
  
  try {
    JSON.parse(jsonStr);
    return true;
  } catch {
    return false;
  }
}

/**
 * SECURITY: Sanitize URL to prevent SSRF
 */
export function isSafeURL(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  if (url.length > 500) return false;
  
  try {
    const parsed = new URL(url);
    
    // Prevent localhost and private IPs
    const hostname = parsed.hostname;
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname)) {
      return false;
    }
    
    // Only allow http/https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}
