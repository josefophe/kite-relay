import dotenv from "dotenv";
import path from "path";

dotenv.config();

export interface AppConfig {
  // Service role detection
  isWorker: boolean;
  isRelay: boolean;
  
  // Telegram (optional for workers)
  telegramBotToken: string | null;
  enableTelegramPolling: boolean;
  
  appSecret: string;
  userDataRoot: string;
  kpassBinary: string;
  ksearchBinary: string;
  port: number;
  host: string;
  redisUrl?: string;
  
  // Database
  databaseUrl: string;
  dbType: "sqlite" | "postgres";
  
  // PHASE 3: LLM Configuration
  llmProvider: "openai" | "anthropic" | "groq";
  llmApiKey: string;
  llmModel: string;
  llmMaxIterations: number;
  llmTimeout: number;
}

// CRITICAL: Detect service role before validating environment
const isWorker = process.env.IS_WORKER === "true";
const isRelay = !isWorker;

// Required for ALL services
const requiredEnv = ["APP_SECRET"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Telegram required ONLY for relay
if (isRelay && !process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error(`Missing required environment variable for relay: TELEGRAM_BOT_TOKEN`);
}

// PHASE 3: LLM Configuration - default to OpenAI if not specified
const llmProvider = (process.env.LLM_PROVIDER || "openai") as "openai" | "anthropic" | "groq";

// Validate LLM provider
if (!["openai", "anthropic", "groq"].includes(llmProvider)) {
  throw new Error(`Invalid LLM_PROVIDER: ${llmProvider}. Must be one of: openai, anthropic, groq`);
}

const llmApiKey = process.env.LLM_API_KEY || "";
const llmModel = process.env.LLM_MODEL || (
  llmProvider === "openai" ? "gpt-4-turbo" : 
  llmProvider === "anthropic" ? "claude-sonnet" :
  "llama3-70b-8192"
);

// Database configuration
const databaseUrl = process.env.DATABASE_URL || "sqlite:///data/agents.db";
const dbType = (process.env.DB_TYPE || "sqlite") as "sqlite" | "postgres";

export const config: AppConfig = {
  // Service role
  isWorker,
  isRelay,
  
  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  enableTelegramPolling: isRelay && !isWorker,
  
  appSecret: process.env.APP_SECRET as string,
  userDataRoot: path.resolve(process.env.USER_DATA_ROOT || "/data"),
  kpassBinary: process.env.KPASS_BINARY || "kpass",
  ksearchBinary: process.env.KSEARCH_BINARY || "ksearch",
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  
  // Database
  databaseUrl,
  dbType,
  
  // PHASE 3: LLM Configuration
  llmProvider,
  llmApiKey,
  llmModel,
  llmMaxIterations: Number(process.env.LLM_MAX_ITERATIONS || 5),
  llmTimeout: Number(process.env.LLM_TIMEOUT || 30000),
};
