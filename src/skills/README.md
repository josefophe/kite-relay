# Kite Passport Skills Layer

This directory contains TypeScript wrapper implementations for all Kite Passport skills, integrating them into KiteRelay's autonomous AI execution pipeline.

## Directory Structure

```
src/skills/
├── skillTypes.ts              # Shared types and enums
├── authenticateUser.ts        # kpass login/signup wrapper
├── walletSend.ts              # kpass wallet send wrapper
├── kiteDiscovery.ts           # ksearch services wrapper
├── requestSession.ts          # kpass session management wrapper
├── x402Execute.ts             # kpass paid API execution wrapper
└── manageAgents.ts            # kpass agent registration wrapper
```

## Quick Start

### Using a Skill Directly

```typescript
import { walletSendSkill } from "./skills/walletSend";

const result = await walletSendSkill({
  userId: 12345,
  toAddress: "0x...",
  amount: "100",
  asset: "USDC"
});

if (result.success) {
  console.log(result.output);
} else {
  console.error(result.error);
}
```

### Through Tool Registry (Recommended)

```typescript
import { getToolRegistry } from "./toolRegistry-skill-integrated";

const registry = getToolRegistry();
const tool = registry.getTool("walletSend");

const result = await tool.handler(userId, {
  toAddress: "0x...",
  amount: "100",
  asset: "USDC"
});
```

### Through AI Orchestration (Fully Autonomous)

```typescript
import { resolveIntent } from "./intentResolver";
import { routeIntentToTool } from "./skillRouter";

// User says: "Send 100 USDC to 0x..."
const intent = resolveIntent("Send 100 USDC to 0x...");
const { result } = await routeIntentToTool(userId, intent);
```

## Skill Reference

### authenticateUser.ts
**Purpose**: Sign up or log in to Kite Passport

**Supported Actions**:
- `login` - Initiate login with email
- `signup` - Initiate signup with email
- `verify` - Complete auth with OTP code
- `logout` - Clear session
- `me` - Check current user

**Example**:
```typescript
await authenticateUserSkill({
  userId: 123,
  action: "login",
  email: "user@example.com"
});
```

### walletSend.ts
**Purpose**: Transfer USDC/KITE to a wallet address

**Safety Checks**:
- ✅ Validates recipient address format
- ✅ Checks wallet balance before transfer
- ✅ Validates positive amount
- ✅ Verifies asset exists

**Example**:
```typescript
await walletSendSkill({
  userId: 123,
  toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f...",
  amount: "100",
  asset: "USDC"
});
```

### kiteDiscovery.ts
**Purpose**: Search and discover AI services

**Supported Actions**:
- `list` - Show all services
- `search` - Find services by query
- `get` - Get details for specific service

**Example**:
```typescript
await kiteDiscoverySkill({
  userId: 123,
  action: "search",
  query: "image generation API"
});
```

### requestSession.ts
**Purpose**: Create and manage spending sessions

**Supported Actions**:
- `create` - Create new spending session
- `list` - List user's sessions
- `status` - Check approval status
- `use` - Activate a session

**Example**:
```typescript
await requestSessionSkill({
  userId: 123,
  action: "create",
  maxAmountPerTx: "100",
  ttl: "24h"
});
```

### x402Execute.ts
**Purpose**: Execute paid API requests through active session

**Safety Checks**:
- ✅ Validates URL format
- ✅ Validates HTTP method
- ✅ Verifies authentication
- ✅ Checks session is active

**Example**:
```typescript
await x402ExecuteSkill({
  userId: 123,
  url: "https://api.example.com/data",
  method: "POST",
  sessionId: "session_123"
});
```

### manageAgents.ts
**Purpose**: Register and list autonomous agents

**Supported Actions**:
- `register` - Register new agent type
- `list` - List user's agents

**Example**:
```typescript
await manageAgentsSkill({
  userId: 123,
  action: "register",
  agentType: "trader"
});
```

## Error Handling

All skills use a standard error mapping for Kite Passport exit codes:

| Code | Meaning | Recovery |
|------|---------|----------|
| 0 | Success | Continue |
| 1 | Network error | Retry with backoff |
| 2 | Usage error | Fix command syntax |
| 3 | Auth error | Run /login again |
| 4 | Not found | Create resource or check parameters |
| 5 | Rate limited | Wait 30s and retry |

Example error handling:
```typescript
const result = await walletSendSkill({...});

if (!result.success) {
  if (result.exitCode === 3) {
    // Re-authenticate
  } else if (result.exitCode === 4) {
    // Show "not found" message
  }
}
```

## Supporting Infrastructure

### skillTypes.ts
Shared type definitions used by all wrappers:
- `SkillExecutionOutput` - Standard output format
- `KiteExitCode` - Enum of exit codes
- `SessionValidationResult` - For session checks
- `EconomicValidationResult` - For safety validation
- `TelegramResponseContext` - For formatting

### skillSetup.ts
Manages CLI installation and setup:
```typescript
import { getSkillSetupManager } from "./skillSetup";

const manager = getSkillSetupManager();
const isReady = manager.isSkillReady("authenticate-user");
```

### economicSafety.ts
Pre-execution validation for economic actions:
```typescript
import { validateEconomicAction } from "./economicSafety";

const validation = await validateEconomicAction({
  userId: 123,
  actionType: "transfer",
  amount: 100,
  currency: "USDC"
});

if (!validation.valid) {
  console.error(validation.error);
}
```

### telegramFormatter.ts
Formats skill outputs as polished Telegram messages:
```typescript
import { formatTelegramResponse } from "./telegramFormatter";

const response = formatTelegramResponse(skillOutput, {
  userId: 123,
  action: "transfer",
  success: true
});

bot.sendMessage(chatId, response.text, { parse_mode: response.parseMode });
```

## Integration Points

### In Tool Registry
```typescript
// toolRegistry-skill-integrated.ts imports all skills
import { walletSendSkill } from "./skills/walletSend";

this.register({
  name: "walletSend",
  typeName: "walletSend",
  handler: async (userId, args) => {
    const result = await walletSendSkill({...});
    return { success: result.success, output: result.output };
  }
});
```

### In AI Orchestration
Skills are available to Groq LLM as tools:
```
User: "Send 100 USDC to alice"
↓
Groq detects intent: walletSend
↓
AI calls: walletSend(toAddress="alice", amount="100", asset="USDC")
↓
Skill executes and returns result
```

### In Intent Router
```typescript
// skillRouter.ts maps intents to skills
const decision = mapIntentToTool(intent);
// intent.action = "walletSend" → toolName = "walletSend"
```

## Testing

### Direct Skill Testing
```typescript
// Test individual skill
const result = await walletSendSkill({
  userId: 999,
  toAddress: "0x...",
  amount: "5",
  asset: "USDC"
});

assert(result.success === true);
assert(result.output.includes("✅"));
```

### Mock Testing
```typescript
// Mock executeKpass to test without real CLI
jest.mock("./userRuntime", () => ({
  executeKpass: jest.fn().mockResolvedValue(JSON.stringify({
    wallet_address: "0x...",
    assets: [{ symbol: "USDC", balance: "100" }]
  }))
}));

const result = await walletSendSkill({...});
```

### Integration Testing
```typescript
// Test full flow through registry
const registry = getToolRegistry();
const handler = registry.getHandler("walletSend");
const result = await handler(userId, { toAddress: "0x...", amount: "100" });
```

## Performance Characteristics

| Skill | Typical Latency | Timeout |
|-------|-----------------|---------|
| authenticateUser | 2-5s | 30s |
| walletSend | 5-10s | 30s |
| kiteDiscovery | 2-3s | 30s |
| requestSession | 1-2s | 30s |
| x402Execute | 5-15s | 30s |
| manageAgents | 1-2s | 30s |

## Common Patterns

### Chaining Skills
```typescript
// Create session, then execute paid API
const sessionResult = await requestSessionSkill({
  userId, action: "create", maxAmountPerTx: "100", ttl: "24h"
});

const { sessionId } = sessionResult.rawData;

const execResult = await x402ExecuteSkill({
  userId, url: "https://api.example.com", sessionId
});
```

### Error Recovery
```typescript
try {
  const result = await walletSendSkill({...});
  
  if (!result.success && result.exitCode === 3) {
    // Auto-redirect to login
    await authenticateUserSkill({
      userId, action: "login", email: userEmail
    });
  }
} catch (error) {
  // Log and notify
}
```

### Rate Limiting
```typescript
// Skills respect rate limits automatically
// If hit limit (code 5), skill returns with error
const result = await kiteDiscoverySkill({...});

if (result.exitCode === 5) {
  // Wait and retry
  setTimeout(() => retry(), 30000);
}
```

---

**Skills Layer Status**: ✅ Phase 2 Complete  
**Integration Status**: Ready for Phase 3 (AI orchestration wiring)  
**Test Coverage**: Stubs in place, unit tests pending  
**Documentation**: ✅ Complete
