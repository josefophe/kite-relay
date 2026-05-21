/**
 * INTENT RESOLVER
 * 
 * Analyzes user natural language input and extracts:
 * - Action intent (transfer, search, create session, etc.)
 * - Entities (amounts, recipients, time periods)
 * - Urgency/priority
 * - Confidence score
 */

import { logger } from "./logger";

export interface Intent {
  action: string; // "transfer", "search", "create_session", "execute", "check_balance", etc.
  entities: Record<string, unknown>;
  confidence: number; // 0-1
  requiresConfirmation: boolean;
  description: string;
}

/**
 * Patterns for intent detection
 */
const INTENT_PATTERNS: Array<{
  name: string;
  patterns: RegExp[];
  action: string;
  requiresConfirmation: boolean;
}> = [
  // Transfer intents
  {
    name: "Send USDC/KITE",
    patterns: [
      /send\s+(?:@?[\w.]+)\s+(\d+(?:\.\d+)?)\s+(usdc|kite)/i,
      /transfer\s+(\d+(?:\.\d+)?)\s+(usdc|kite)\s+to\s+(@?[\w.]+)/i,
      /pay\s+(@?[\w.]+)\s+(\d+(?:\.\d+)?)\s+(usdc|kite)/i,
    ],
    action: "walletSend",
    requiresConfirmation: true,
  },

  // Service discovery intents
  {
    name: "Discover services",
    patterns: [
      /find\s+(?:me\s+)?(\w+)/i,
      /search\s+(?:for\s+)?([^?!.]+)/i,
      /discover\s+([^?!.]+)/i,
      /what\s+(?:are\s+)?([^?!.]+)/i,
    ],
    action: "kiteDiscovery",
    requiresConfirmation: false,
  },

  // Session creation intents
  {
    name: "Create spending session",
    patterns: [
      /create\s+(?:a\s+)?session\s+(?:for\s+)?(\d+)\s+(usdc|kite)\s+(?:for\s+)?(\d+[dhm])/i,
      /authorize\s+(\d+)\s+(usdc|kite)\s+(?:for\s+)?(\d+[dhm])/i,
      /spending\s+limit\s+of\s+(\d+)\s+(usdc|kite)/i,
    ],
    action: "requestSession",
    requiresConfirmation: true,
  },

  // API execution intents
  {
    name: "Execute API call",
    patterns: [
      /call\s+(?:api\s+)?(\S+)/i,
      /execute\s+(?:request\s+)?(?:to\s+)?(\S+)/i,
      /fetch\s+from\s+(\S+)/i,
    ],
    action: "x402Execute",
    requiresConfirmation: true,
  },

  // Check balance intent
  {
    name: "Check balance",
    patterns: [
      /(?:what|how much|check)\s+(?:is\s+)?(?:my\s+)?(?:balance|wallet)/i,
      /balance/i,
      /how much do i have/i,
    ],
    action: "walletBalance",
    requiresConfirmation: false,
  },

  // Login/Auth intents
  {
    name: "Authenticate",
    patterns: [
      /(?:sign\s+in|log\s+in|login)\s+(?:with|to|as)?\s*([^\s]+@[^\s]+)/i,
      /authenticate\s+(?:with|to|as)?\s*([^\s]+@[^\s]+)/i,
      /sign up\s+(?:with|to|as)?\s*([^\s]+@[^\s]+)/i,
    ],
    action: "authenticateUser",
    requiresConfirmation: false,
  },

  // Agent registration intents
  {
    name: "Register agent",
    patterns: [
      /register\s+(?:me\s+as\s+)?(?:an?\s+)?(\w+)\s+agent/i,
      /become\s+(?:an?\s+)?(\w+)/i,
    ],
    action: "manageAgents",
    requiresConfirmation: true,
  },
];

/**
 * Resolve user intent from natural language input
 */
export function resolveIntent(userMessage: string): Intent {
  const lowerMessage = userMessage.toLowerCase();

  for (const intentDef of INTENT_PATTERNS) {
    for (const pattern of intentDef.patterns) {
      const match = userMessage.match(pattern);
      if (match) {
        logger.info(
          {
            message: userMessage,
            intentName: intentDef.name,
            action: intentDef.action,
          },
          "Intent resolved"
        );

        return {
          action: intentDef.action,
          entities: extractEntities(userMessage, match),
          confidence: 0.8,
          requiresConfirmation: intentDef.requiresConfirmation,
          description: intentDef.name,
        };
      }
    }
  }

  // No specific pattern matched
  logger.debug({ message: userMessage }, "No specific intent pattern matched");

  return {
    action: "unknown",
    entities: {},
    confidence: 0,
    requiresConfirmation: false,
    description: "Could not determine intent",
  };
}

/**
 * Extract entities from user message
 */
function extractEntities(message: string, match: RegExpMatchArray): Record<string, unknown> {
  const entities: Record<string, unknown> = {};

  // Extract amount
  const amountMatch = message.match(/(\d+(?:\.\d+)?)\s+(usdc|kite)/i);
  if (amountMatch) {
    entities.amount = amountMatch[1];
    entities.asset = amountMatch[2].toUpperCase();
  }

  // Extract recipient
  const recipientMatch = message.match(/(?:to|for|@)\s+(@?[\w.]+)/i);
  if (recipientMatch) {
    entities.recipient = recipientMatch[1];
  }

  // Extract email/username
  const emailMatch = message.match(/([^\s]+@[^\s]+)/);
  if (emailMatch) {
    entities.email = emailMatch[1];
  }

  // Extract URL
  const urlMatch = message.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) {
    entities.url = urlMatch[1];
  }

  // Extract time period
  const timeMatch = message.match(/(\d+)([dhm])/i);
  if (timeMatch) {
    entities.ttl = `${timeMatch[1]}${timeMatch[2].toLowerCase()}`;
  }

  // Extract agent type
  const agentMatch = message.match(/(?:as\s+an?\s+|as\s+)?(\w+)\s+agent/i);
  if (agentMatch) {
    entities.agentType = agentMatch[1];
  }

  // Extract search query
  if (message.includes("search") || message.includes("find") || message.includes("discover")) {
    const queryMatch = message.match(/(?:search|find|discover)\s+(?:for\s+)?([^?!.]+)/i);
    if (queryMatch) {
      entities.query = queryMatch[1].trim();
    }
  }

  return entities;
}

/**
 * Validate intent has sufficient entities
 */
export function validateIntent(intent: Intent): { valid: boolean; error?: string } {
  switch (intent.action) {
    case "walletSend":
      if (!intent.entities.recipient || !intent.entities.amount) {
        return { valid: false, error: "Need recipient and amount" };
      }
      break;

    case "requestSession":
      if (!intent.entities.amount || !intent.entities.ttl) {
        return { valid: false, error: "Need amount and time period" };
      }
      break;

    case "x402Execute":
      if (!intent.entities.url) {
        return { valid: false, error: "Need API endpoint URL" };
      }
      break;

    case "kiteDiscovery":
      if (!intent.entities.query) {
        return { valid: false, error: "Need search query" };
      }
      break;

    case "manageAgents":
      if (!intent.entities.agentType) {
        return { valid: false, error: "Need agent type" };
      }
      break;

    case "authenticateUser":
      if (!intent.entities.email) {
        return { valid: false, error: "Need email address" };
      }
      break;
  }

  return { valid: true };
}
