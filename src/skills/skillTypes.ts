/**
 * SHARED TYPES FOR SKILL WRAPPERS
 * 
 * All Kite Passport skill wrappers use these types for consistent
 * input/output handling, error mapping, and telemetry.
 */

export interface SkillSetupResult {
  status: "ok" | "error";
  message: string;
  binaryPath?: string;
  version?: string;
}

export interface SkillExecutionInput {
  userId: number;
  command: string[];
  timeout?: number;
  shouldSetup?: boolean; // Run setup.sh before executing
}

export interface SkillExecutionOutput {
  success: boolean;
  output: string;
  exitCode?: number;
  error?: string;
  rawData?: Record<string, unknown>;
  duration?: number;
}

export interface SkillTelemetry {
  skillName: string;
  userId: number;
  command: string;
  exitCode: number;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

/**
 * Kite Passport exit code meanings (standard across all skills)
 */
export enum KiteExitCode {
  SUCCESS = 0,
  NETWORK_ERROR = 1,
  USAGE_ERROR = 2,
  AUTH_ERROR = 3,
  NOT_FOUND = 4,
  RATE_LIMITED = 5,
}

/**
 * Map exit code to user-friendly message
 */
export function mapExitCodeToMessage(code: number, command: string): string {
  switch (code) {
    case KiteExitCode.SUCCESS:
      return "Success";
    case KiteExitCode.NETWORK_ERROR:
      return `Network error. Please try again.`;
    case KiteExitCode.USAGE_ERROR:
      return `Command error: invalid arguments`;
    case KiteExitCode.AUTH_ERROR:
      return `Authentication error. Please run /login again.`;
    case KiteExitCode.NOT_FOUND:
      return `Resource not found. Please check parameters.`;
    case KiteExitCode.RATE_LIMITED:
      return `Rate limited. Please wait 30 seconds and try again.`;
    default:
      return `Error (code ${code})`;
  }
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  error?: string;
  sessionId?: string;
  maxAmountPerTx?: string;
  ttlRemaining?: string;
}

/**
 * Economic action validation result
 */
export interface EconomicValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
}

/**
 * Telegram response formatting context
 */
export interface TelegramResponseContext {
  userId: number;
  action: string; // e.g., "transfer", "session_create", "service_search"
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  suggestions?: string[];
}
