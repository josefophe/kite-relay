import { logger } from "./logger";

/**
 * PHASE 3: Conversation Context Manager
 * 
 * Maintains lightweight per-user conversation state for AI orchestration.
 * Preserves:
 * - Conversation history (last 20 messages)
 * - Active session information
 * - Recent wallet/agent state
 * - Execution history
 * 
 * All state is ephemeral (in-memory) and cleared on bot restart.
 * Persistent data stored in user profiles via storage.ts.
 */

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolsCalled?: string[];
}

export interface ActiveSession {
  id: string;
  maxAmountPerTx: string;
  ttl: string;
  createdAt: number;
  expiresAt: number;
}

export interface WalletState {
  balance: string;
  assets: string[];
  timestamp: number;
}

export interface AgentInfo {
  id: string;
  type: string;
  status: "running" | "stopped";
}

export interface UserContext {
  userId: number;
  
  // Conversation history (ephemeral)
  conversationHistory: Message[];
  
  // Active session tracking
  activeSession?: ActiveSession;
  
  // Cached wallet state
  lastWalletState?: WalletState;
  
  // Cached agent list
  lastAgentList?: {
    agents: AgentInfo[];
    timestamp: number;
  };
  
  // Execution tracking
  lastExecution?: {
    startTime: number;
    toolsCalled: string[];
    success: boolean;
  };
  
  // User preferences
  preferences: {
    autoConfirm: boolean;
    verbosity: "terse" | "normal" | "verbose";
  };
}

/**
 * Context Manager - Maintains per-user conversation state
 */
export class ConversationContextManager {
  private contexts: Map<number, UserContext> = new Map();
  private maxHistoryLength = 20;
  private contextTimeout = 60 * 60 * 1000; // 1 hour
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup stale contexts every 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleContexts();
    }, 30 * 60 * 1000);
  }

  /**
   * Get or create context for user
   */
  getContext(userId: number): UserContext {
    if (!this.contexts.has(userId)) {
      this.contexts.set(userId, {
        userId,
        conversationHistory: [],
        preferences: {
          autoConfirm: false,
          verbosity: "normal"
        }
      });
    }
    return this.contexts.get(userId)!;
  }

  /**
   * Add message to conversation history
   */
  addMessage(userId: number, role: "user" | "assistant", content: string, toolsCalled?: string[]) {
    const context = this.getContext(userId);
    
    context.conversationHistory.push({
      role,
      content,
      timestamp: Date.now(),
      toolsCalled
    });

    // Keep only last N messages to avoid memory bloat
    if (context.conversationHistory.length > this.maxHistoryLength) {
      context.conversationHistory = context.conversationHistory.slice(-this.maxHistoryLength);
    }

    logger.debug({ userId, role, contentLength: content.length }, "conversation message added");
  }

  /**
   * Get conversation history (for LLM context)
   */
  getHistory(userId: number): Message[] {
    const context = this.getContext(userId);
    return context.conversationHistory;
  }

  /**
   * Get conversation history in LLM format
   */
  getHistoryForLLM(userId: number): { role: string; content: string }[] {
    const context = this.getContext(userId);
    return context.conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Clear conversation history for user
   */
  clearHistory(userId: number) {
    const context = this.getContext(userId);
    const previousLength = context.conversationHistory.length;
    context.conversationHistory = [];
    logger.debug({ userId, messagesCleared: previousLength }, "conversation history cleared");
  }

  /**
   * Update active session
   */
  updateActiveSession(userId: number, session: Omit<ActiveSession, 'expiresAt'> & { expiresAt?: number }) {
    const context = this.getContext(userId);
    context.activeSession = {
      ...session,
      expiresAt: session.expiresAt || Date.now() + 24 * 60 * 60 * 1000
    };
    logger.debug({ userId, sessionId: session.id }, "active session updated");
  }

  /**
   * Get active session (if valid)
   */
  getActiveSession(userId: number): ActiveSession | undefined {
    const context = this.getContext(userId);
    if (!context.activeSession) return undefined;
    
    // Check if session expired
    if (Date.now() > context.activeSession.expiresAt) {
      delete context.activeSession;
      return undefined;
    }
    
    return context.activeSession;
  }

  /**
   * Clear active session
   */
  clearActiveSession(userId: number) {
    const context = this.getContext(userId);
    delete context.activeSession;
    logger.debug({ userId }, "active session cleared");
  }

  /**
   * Update cached wallet state
   */
  updateWalletState(userId: number, balance: string, assets: string[]) {
    const context = this.getContext(userId);
    context.lastWalletState = {
      balance,
      assets,
      timestamp: Date.now()
    };
    logger.debug({ userId, balance, assetCount: assets.length }, "wallet state updated");
  }

  /**
   * Get cached wallet state (if not stale)
   */
  getWalletState(userId: number, maxAge = 5 * 60 * 1000): WalletState | undefined {
    const context = this.getContext(userId);
    if (!context.lastWalletState) return undefined;
    
    // Return if cached state is fresh enough
    if (Date.now() - context.lastWalletState.timestamp < maxAge) {
      return context.lastWalletState;
    }
    
    return undefined;
  }

  /**
   * Update cached agent list
   */
  updateAgentList(userId: number, agents: AgentInfo[]) {
    const context = this.getContext(userId);
    context.lastAgentList = {
      agents,
      timestamp: Date.now()
    };
    logger.debug({ userId, agentCount: agents.length }, "agent list updated");
  }

  /**
   * Get cached agent list (if not stale)
   */
  getAgentList(userId: number, maxAge = 5 * 60 * 1000): AgentInfo[] | undefined {
    const context = this.getContext(userId);
    if (!context.lastAgentList) return undefined;
    
    if (Date.now() - context.lastAgentList.timestamp < maxAge) {
      return context.lastAgentList.agents;
    }
    
    return undefined;
  }

  /**
   * Record execution start
   */
  recordExecutionStart(userId: number, toolNames: string[]) {
    const context = this.getContext(userId);
    context.lastExecution = {
      startTime: Date.now(),
      toolsCalled: toolNames,
      success: false
    };
  }

  /**
   * Record execution completion
   */
  recordExecutionEnd(userId: number, success: boolean) {
    const context = this.getContext(userId);
    if (context.lastExecution) {
      context.lastExecution.success = success;
      logger.debug(
        { userId, success, duration: Date.now() - context.lastExecution.startTime },
        "execution completed"
      );
    }
  }

  /**
   * Get last execution info
   */
  getLastExecution(userId: number) {
    const context = this.getContext(userId);
    return context.lastExecution;
  }

  /**
   * Update user preferences
   */
  setPreferences(userId: number, prefs: Partial<UserContext['preferences']>) {
    const context = this.getContext(userId);
    context.preferences = { ...context.preferences, ...prefs };
    logger.debug({ userId, preferences: context.preferences }, "user preferences updated");
  }

  /**
   * Get user preferences
   */
  getPreferences(userId: number) {
    const context = this.getContext(userId);
    return context.preferences;
  }

  /**
   * Clear entire user context
   */
  clearContext(userId: number) {
    if (this.contexts.has(userId)) {
      this.contexts.delete(userId);
      logger.debug({ userId }, "user context cleared");
    }
  }

  /**
   * Get context summary (for debugging/telemetry)
   */
  getContextSummary(userId: number) {
    const context = this.getContext(userId);
    return {
      userId,
      historyLength: context.conversationHistory.length,
      hasActiveSession: !!context.activeSession,
      hasWalletState: !!context.lastWalletState,
      agentCount: context.lastAgentList?.agents.length || 0,
      preferences: context.preferences
    };
  }

  /**
   * Get all active contexts (for monitoring)
   */
  getAllContexts(): number[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Get total context memory usage (for monitoring)
   */
  getMemoryUsage() {
    let totalMessages = 0;
    let contextsWithSession = 0;
    let contextsWithWallet = 0;

    for (const context of this.contexts.values()) {
      totalMessages += context.conversationHistory.length;
      if (context.activeSession) contextsWithSession++;
      if (context.lastWalletState) contextsWithWallet++;
    }

    return {
      totalContexts: this.contexts.size,
      totalMessages,
      contextsWithActiveSession: contextsWithSession,
      contextsWithCachedWallet: contextsWithWallet
    };
  }

  /**
   * Cleanup stale contexts (older than 1 hour)
   */
  private cleanupStaleContexts() {
    let cleaned = 0;
    const now = Date.now();

    for (const [userId, context] of this.contexts.entries()) {
      if (context.conversationHistory.length === 0) {
        // Empty context - check if we should keep it
        const timeSinceCreation = context.lastExecution 
          ? now - context.lastExecution.startTime 
          : Infinity;
        
        if (timeSinceCreation > this.contextTimeout) {
          this.contexts.delete(userId);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, "stale contexts cleaned up");
    }
  }

  /**
   * Destroy manager and cleanup resources
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.contexts.clear();
    logger.info("conversation context manager destroyed");
  }
}

/**
 * Global context manager instance
 */
let globalContextManager: ConversationContextManager | null = null;

/**
 * Get or create global context manager
 */
export function getContextManager(): ConversationContextManager {
  if (!globalContextManager) {
    globalContextManager = new ConversationContextManager();
  }
  return globalContextManager;
}

/**
 * Initialize global context manager
 */
export function initializeContextManager(): ConversationContextManager {
  globalContextManager = new ConversationContextManager();
  logger.info("conversation context manager initialized");
  return globalContextManager;
}

/**
 * Shutdown global context manager
 */
export function shutdownContextManager() {
  if (globalContextManager) {
    globalContextManager.destroy();
    globalContextManager = null;
  }
}
