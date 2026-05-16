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
