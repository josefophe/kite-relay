# 🚀 KiteRelay: Telegram-Native Autonomous Agent Infrastructure

**Winner-Ready Platform for Kite AI Global Hackathon 2026**

> Transform every Telegram user into an autonomous economic agent with real wallet execution, programmable spending constraints, and AI-powered tool orchestration.

---

## 🎯 Core Narrative

**KiteRelay is Telegram-native autonomous agent infrastructure powered by Kite AI.**

- ✅ **AI agents** execute economic actions in natural language
- ✅ **Autonomous payments** within user-defined spending constraints
- ✅ **Real wallet execution** via Kite Passport CLI (kpass)
- ✅ **On-chain auditability** with TX hashes and explorer links
- ✅ **Per-user isolation** - zero cross-tenant contamination
- ✅ **Production-grade** - multi-user, multi-phase, battle-tested

---

## 📋 What This Delivers

### Phase 1: ✅ Agent Sessions
Real per-user isolated runtime with secure wallet operations.

**Features**:
- Telegram user authentication via Kite Passport
- Per-user isolated HOME: `/data/users/<user_id>/`
- Agent registration with automatic identity creation
- Session-based spending constraints (max amount per TX, TTL)
- Real wallet balance queries
- Real wallet transfers to addresses and Telegram users
- TX hash extraction and kitescan.ai explorer links
- Multi-user isolation with zero cross-user state leakage

**User Commands**:
```
/login <email>                           → Authenticate via Kite
/verify <login-id> <code>               → Complete auth
/balance                                → Check wallet balance
/agent-register trader                  → Create agent identity
/session-create 100 USDC 24h            → Create spending session
/session-list                           → Show active sessions
/session-status <session-id>            → Check session details
/wallet-send 0x<addr> 10 KITE          → Transfer to address
/send @username 5 KITE                  → Transfer to user
/debug-runtime                          → Show isolation state
```

---

### Phase 2: ✅ Autonomous Scheduled Agents
Real autonomous agents that execute tasks on schedule.

**Features**:
- Natural language agent creation: "Monitor KITE balance every hour"
- BullMQ + Redis job scheduling (real queue, not mocks)
- SQLite persistent agent storage
- Worker pool for parallel execution
- Real CLI execution with per-user isolation
- Execution history with full audit trails
- Telegram notifications on task completion/failure

**User Commands**:
```
/agent-create Monitor KITE balance every hour       → Create agent
/agent-list                                        → Show all agents
/agent-run <agent-id>                             → Trigger now
/agent-logs <agent-id> [limit]                    → Show history
/agent-start <agent-id>                           → Enable
/agent-stop <agent-id>                            → Pause
/agent-delete <agent-id>                          → Remove
```

---

### Phase 3: 🆕 Real AI Tool-Calling Orchestration
Autonomous AI agents that reason about goals and select from an approved tool registry.

**Features**:
- **Vercel AI SDK** integration (universal LLM abstraction)
- **OpenAI & Anthropic** provider support (configurable)
- **8 Strongly-typed tools** with JSON Schema validation:
  - `walletBalance` - Get balance
  - `walletSend` - Transfer to address
  - `sendToUsername` - Transfer to Telegram user
  - `ksearch` - Search information
  - `sessionCreate` - Create spending session
  - `sessionList` - List active sessions
  - `sessionExecute` - Execute within session
  - `agentList` - List user's agents
  - `airtimePurchase` - Coming Phase 4

- **Multi-turn conversations** with per-user context (20-message history)
- **Safety boundaries**: No shell execution, session-enforced, timeout-protected
- **Real execution only** - No mocks, no simulations
- **Per-user isolation** - Separate context per user, zero cross-user access

**User Commands**:
```
/agent check my balance
/agent find cheapest AI image API
/agent send 1 KITE to @alice
/agent create 100 USDC session for 24 hours
/agent search Kite Passport documentation
/agent compare stablecoin yields
```

---

## 🏗️ Architecture

### Multi-Layer Design

```
┌─────────────────────────────────────────┐
│  Telegram Bot Layer (telegramBot.ts)    │ ← User commands
│  - /agent command routing               │
│  - /wallet commands                     │
│  - /session commands                    │
│  - /agent-* commands                    │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  AI Orchestration Layer                 │ ← Phase 3
│  (aiOrchestration.ts)                   │
│  - Vercel AI SDK integration            │
│  - Tool selection & execution           │
│  - Multi-turn conversation              │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Tool Registry (toolRegistry.ts)        │ ← 8 Approved Tools
│  - JSON Schema validation               │
│  - Safety config (auth, session, timeout)
│  - Tool definitions for LLM             │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Command Gateway (commandGateway.ts)    │ ← Real Handlers
│  - Handler implementations              │
│  - Kpass CLI execution                  │
│  - ksearch integration                  │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Per-User Isolated Runtime              │ ← Isolation Layer
│  /data/users/<user_id>/                 │
│  - HOME override                        │
│  - .kite-passport config                │
│  - Session storage                      │
│  - Workspace                            │
└─────────────────────────────────────────┘
```

---

## 🔒 Security & Isolation

### Per-User Isolation Model

Every Telegram user gets their own:
- **Isolated HOME**: `/data/users/<user_id>/`
- **Isolated Config**: `.kite-passport/config.json` (per-user)
- **Isolated Sessions**: Unique session IDs per user
- **Isolated Wallet**: Separate balance tracking
- **Isolated Agents**: User can only see/manage own agents

**Verification**:
```bash
/debug-runtime
→ Shows your isolated runtime state
→ User ID
→ Runtime path
→ Registered agents
→ Active sessions
```

### Safety Boundaries

- ✅ **No shell execution** - Tool allowlist only
- ✅ **No arbitrary code** - Typed parameters with JSON Schema
- ✅ **Session enforcement** - Economic tools require active session
- ✅ **Timeout protection** - 10-30 second per-tool timeouts
- ✅ **Spending limits** - Session max amount per TX enforced
- ✅ **Audit logging** - All operations logged with user ID and TX hash

---

## 📚 Full Command Reference

### Authentication

**`/login <email>`**
- **Purpose**: Initiate Kite Passport authentication
- **Example**: `/login josefophe@gmail.com`
- **Success Output**:
  ```
  ✅ Login initiated
  Check your email for verification code
  ```
- **Failure Output**:
  ```
  ❌ Invalid email format
  Usage: /login your@email.com
  ```
- **Recovery**: Ensure email is valid, check spam folder
- **Auth Required**: No
- **Next Step**: Wait for email, then `/verify`

---

**`/verify <login-id> <code>`**
- **Purpose**: Complete authentication with Kite
- **Example**: `/verify abc123 456789`
- **Success Output**:
  ```
  ✅ Verified!
  Wallet ready. Use /balance to check funds.
  ```
- **Failure Output**:
  ```
  ❌ Invalid verification code
  Check email and try again
  ```
- **Recovery**: Re-run `/login`, request new code
- **Auth Required**: No (but login must be initiated)
- **Next Step**: `/balance` or `/agent-register`

---

**`/logout`**
- **Purpose**: Clear authentication and end session
- **Example**: `/logout`
- **Success Output**:
  ```
  ✅ Logged out
  Your session is cleared
  ```
- **Auth Required**: Yes
- **Next Step**: `/login` if you need to reconnect

---

### Wallet Operations

**`/balance`**
- **Purpose**: Check current wallet balance
- **Example**: `/balance`
- **Success Output**:
  ```
  💰 Wallet Balance
  KITE: 100.50
  USDC: 500.00
  ```
- **Failure Output**:
  ```
  ❌ Not authenticated
  Run: /login your@email.com
  ```
- **Auth Required**: Yes
- **Next Step**: Check balance before transfers

---

**`/wallet-send <address> <amount> <asset>`**
- **Purpose**: Transfer to a blockchain address
- **Syntax**: `/wallet-send 0xabc123... 10 KITE`
- **Example**: `/wallet-send 0x1234567890abcdef 10 KITE`
- **Success Output**:
  ```
  ✅ Transfer Confirmed
  Amount: 10 KITE
  Recipient: 0x1234567890abcdef
  TX Hash: 0xabcd...
  Explorer: https://kitescan.ai/tx/0xabcd...
  Status: Confirmed
  Balance: 90.50 KITE
  ```
- **Failure Outputs**:
  ```
  ❌ Invalid address format
  ❌ Insufficient balance (need 100, have 50)
  ❌ Invalid amount (must be positive)
  ```
- **Recovery Steps**:
  1. Check /balance
  2. Verify recipient address
  3. Ensure amount is positive
  4. Retry
- **Auth Required**: Yes
- **Session Required**: No (but recommended via /session-create for safety)
- **Next Step**: Check TX status on explorer link

---

**`/send @username <amount> <asset>`**
- **Purpose**: Transfer to another Telegram user
- **Syntax**: `/send @alice 5 KITE`
- **Example**: `/send @alice 5 KITE`
- **Success Output**:
  ```
  ✅ Transfer to @alice Confirmed
  Amount: 5 KITE
  TX Hash: 0x5678...
  Explorer: https://kitescan.ai/tx/0x5678...
  Status: Confirmed
  @alice has been notified
  Balance: 95.50 KITE
  ```
- **Failure Outputs**:
  ```
  ❌ User not found: @alice
  ❌ Insufficient balance
  ❌ Cannot send to yourself
  ```
- **Recovery Steps**:
  1. Verify username is correct
  2. Check /balance
  3. Ensure recipient has Telegram ID registered
  4. Retry
- **Auth Required**: Yes
- **Session Required**: No
- **Next Step**: Recipient can use /balance to confirm

---

### Agent Operations

**`/agent-register <type>`**
- **Purpose**: Create an agent identity (required for sessions)
- **Syntax**: `/agent-register trader`
- **Example**: `/agent-register trader`
- **Success Output**:
  ```
  ✅ Agent Registered
  Type: trader
  Agent ID: agent_abc123
  Status: Active
  
  You can now create spending sessions for this agent.
  ```
- **Failure Outputs**:
  ```
  ❌ Not authenticated
  ❌ Agent already registered
  ❌ Invalid agent type
  ```
- **Auth Required**: Yes
- **Recovery Steps**:
  1. Run /login and /verify if needed
  2. Check if already registered: /agent-list
  3. Valid types: trader, searcher, executor, monitor
- **Next Step**: `/session-create` to set spending limit

---

### Session Management

**`/session-create <amount> <asset> <ttl>`**
- **Purpose**: Create a spending session with budget limit
- **Syntax**: `/session-create 100 USDC 24h`
- **Example**: `/session-create 1000 USDC 7d`
- **Success Output**:
  ```
  ✅ Session Created
  ID: sess_xyz789
  Budget: 1000 USDC
  TTL: 7 days
  Expires: 2026-05-22 14:47:00 UTC
  
  Use: /session-use sess_xyz789
  ```
- **Failure Outputs**:
  ```
  ❌ No Agent Registered
  Run: /agent-register trader
  
  ❌ Invalid amount (must be positive)
  ❌ Invalid TTL format (use: 1h, 24h, 7d, 30d)
  ```
- **Auth Required**: Yes
- **Agent Required**: Yes (must register first)
- **Recovery Steps**:
  1. Verify agent: `/debug-runtime`
  2. If missing, run: `/agent-register trader`
  3. Verify amount is positive
  4. Verify TTL format (e.g., 24h, 7d)
  5. Retry: `/session-create 100 USDC 24h`
- **Next Step**: `/session-use` or `/session-execute`

---

**`/session-list`**
- **Purpose**: Show all active spending sessions
- **Example**: `/session-list`
- **Success Output**:
  ```
  📋 Active Sessions
  1. sess_abc123 - 100 USDC (Expires: 2026-05-16 14:47 UTC)
  2. sess_xyz789 - 1000 USDC (Expires: 2026-05-22 14:47 UTC)
  ```
- **Failure Output**:
  ```
  No active sessions yet.
  Create one: /session-create 100 USDC 24h
  ```
- **Auth Required**: Yes
- **Next Step**: `/session-status <session-id>` for details

---

**`/session-status <session-id>`**
- **Purpose**: Check session details and remaining balance
- **Syntax**: `/session-status sess_abc123`
- **Example**: `/session-status sess_xyz789`
- **Success Output**:
  ```
  📊 Session Status
  ID: sess_xyz789
  Budget: 1000 USDC
  Used: 250 USDC
  Remaining: 750 USDC
  Expires: 2026-05-22 14:47:00 UTC
  Status: Active
  ```
- **Failure Output**:
  ```
  ❌ Session not found: sess_xyz789
  ```
- **Auth Required**: Yes
- **Next Step**: `/session-execute` to use session

---

**`/session-use <session-id>`**
- **Purpose**: Set session as active context
- **Syntax**: `/session-use sess_abc123`
- **Example**: `/session-use sess_xyz789`
- **Success Output**:
  ```
  ✅ Session Active
  ID: sess_xyz789
  Budget: 1000 USDC
  Remaining: 750 USDC
  
  Economic actions now use this session.
  ```
- **Auth Required**: Yes
- **Next Step**: `/wallet-send` will use this session's budget

---

**`/session-execute <command>`**
- **Purpose**: Execute economic action within session
- **Syntax**: `/session-execute send @alice 50 USDC`
- **Example**: `/session-execute transfer 100 USDC to 0x123`
- **Success Output**:
  ```
  ✅ Executed in Session
  Action: Transfer 100 USDC
  TX Hash: 0x9999...
  Session Remaining: 650 USDC
  ```
- **Failure Outputs**:
  ```
  ❌ Exceeds session limit (request: 1000, limit: 100)
  ❌ Session expired
  ```
- **Auth Required**: Yes
- **Session Required**: Yes
- **Recovery**: Check /session-status and retry with valid amount

---

### AI-Powered Commands

**`/agent <natural language>`**
- **Purpose**: Execute tasks using AI reasoning and tool calling
- **Syntax**: `/agent <your intent>`
- **Examples**:
  ```
  /agent check my balance
  /agent find cheapest stablecoin exchange
  /agent send 1 KITE to @alice
  /agent search best GPU cloud pricing
  /agent create 100 USDC spending session
  /agent compare yield farming protocols
  ```

- **Success Output Example** (balance check):
  ```
  💰 Your Balance
  KITE: 100.50
  USDC: 500.00
  
  ━━━━━━━━━━━━━━━━━━━━━━━
  📊 Execution Summary
  • Tools Used: 1
  • Economic Actions: 0
  • Duration: 234ms
  ```

- **Success Output Example** (transfer):
  ```
  ✅ Transfer to @alice Confirmed
  Amount: 1 KITE
  TX Hash: 0xabcd...
  Explorer: https://kitescan.ai/tx/0xabcd...
  Status: Confirmed
  
  ━━━━━━━━━━━━━━━━━━━━━━━
  📊 Execution Summary
  • Tools Used: 2
  • Economic Actions: 1
  • Duration: 1234ms
  ```

- **Failure Outputs**:
  ```
  ❌ This action requires an active session.
  Create one: /agent create 100 USDC session
  
  ❌ Insufficient balance (need 100, have 50)
  
  ❌ AI orchestration failed: timeout after 30s
  ```

- **Auth Required**: Yes
- **Tool Details**:
  - `walletBalance` - Check balance (no session needed)
  - `walletSend` - Send to address (no session needed)
  - `sendToUsername` - Send to user (no session needed)
  - `ksearch` - Search information (no session needed)
  - `sessionCreate` - Create session (no session needed)
  - `sessionList` - List sessions (no session needed)
  - `sessionExecute` - Execute in session (SESSION REQUIRED)
  - `agentList` - Show agents (no session needed)

- **Safety Notes**:
  - AI can ONLY use approved tools
  - AI CANNOT execute shell commands
  - AI respects session spending limits
  - Economic actions require session

- **Next Step**: Check TX hash on explorer or retry

---

### Autonomous Agent Management (Phase 2)

**`/agent-create <description>`**
- **Purpose**: Create an autonomous agent that runs on schedule
- **Syntax**: `/agent-create <description>`
- **Examples**:
  ```
  /agent-create Monitor KITE balance every hour
  /agent-create Search for AI grants daily
  /agent-create Check API pricing every 6 hours
  ```
- **Success Output**:
  ```
  ✅ Agent Created
  ID: agent_xyz789
  Description: Monitor KITE balance every hour
  Schedule: Every 1 hour
  Status: Active
  Next Run: 2026-05-15 15:47:00 UTC
  ```
- **Auth Required**: Yes
- **Recovery**: Natural language parsing requires exact keywords

---

**`/agent-list`**
- **Purpose**: Show all your autonomous agents
- **Example**: `/agent-list`
- **Success Output**:
  ```
  🤖 Your Agents
  1. Monitor KITE Balance
     ID: agent_abc123
     Status: Active
     Next: 2026-05-15 15:47 UTC
  
  2. Search AI Grants
     ID: agent_def456
     Status: Paused
     Next: 2026-05-16 09:00 UTC
  ```
- **Auth Required**: Yes

---

**`/agent-run <agent-id>`**
- **Purpose**: Execute an agent immediately (don't wait for schedule)
- **Syntax**: `/agent-run agent_abc123`
- **Success Output**:
  ```
  ✅ Agent Executed
  ID: agent_abc123
  Result: [command output]
  Next Scheduled: 2026-05-15 15:47 UTC
  ```
- **Auth Required**: Yes

---

**`/agent-logs <agent-id> [limit]`**
- **Purpose**: View execution history
- **Syntax**: `/agent-logs agent_abc123 10`
- **Success Output**:
  ```
  📋 Agent Logs (last 10)
  1. 2026-05-15 14:47:00 - ✅ Success
  2. 2026-05-15 13:47:00 - ✅ Success
  3. 2026-05-15 12:47:00 - ❌ Failed: timeout
  ```
- **Auth Required**: Yes

---

**`/agent-stop <agent-id>`**
- **Purpose**: Pause an agent (keeps history)
- **Syntax**: `/agent-stop agent_abc123`
- **Success Output**:
  ```
  ⏸️ Agent Paused
  ID: agent_abc123
  Status: Paused
  To resume: /agent-start agent_abc123
  ```
- **Auth Required**: Yes

---

**`/agent-start <agent-id>`**
- **Purpose**: Resume a paused agent
- **Syntax**: `/agent-start agent_abc123`
- **Success Output**:
  ```
  ▶️ Agent Resumed
  ID: agent_abc123
  Status: Active
  Next Run: 2026-05-15 15:47 UTC
  ```
- **Auth Required**: Yes

---

**`/agent-delete <agent-id>`**
- **Purpose**: Permanently delete an agent
- **Syntax**: `/agent-delete agent_abc123`
- **Success Output**:
  ```
  ✅ Agent Deleted
  ID: agent_abc123
  Status: Removed
  History: Preserved (view with /agent-logs if backup exists)
  ```
- **Auth Required**: Yes
- **Warning**: This is permanent

---

### Diagnostics

**`/debug-runtime`**
- **Purpose**: Show your isolated runtime state
- **Example**: `/debug-runtime`
- **Success Output**:
  ```
  🔍 Runtime Diagnostics
  
  User ID: 2114747878
  Runtime: /data/users/2114747878/
  
  ✅ Filesystem
  - workspace/: exists
  - config/: exists
  - logs/: exists
  
  ✅ Authentication
  - .kite-passport/config.json: valid
  
  ✅ Agents
  - Registered: 1 (trader)
  
  ✅ Sessions
  - Active: 1 (sess_xyz789)
  - Expired: 0
  
  No issues detected ✅
  ```
- **Failure Output** (if issues):
  ```
  ⚠️ Runtime Diagnostics
  
  Issues Found:
  ❌ No agent registered
  
  Recovery:
  1. Run: /agent-register trader
  2. Then: /session-create 100 USDC 24h
  3. Verify: /debug-runtime
  ```
- **Auth Required**: Yes
- **When to Use**: Troubleshooting failed commands

---

**`/telemetry`** (if implemented)
- **Purpose**: Show platform metrics
- **Example**: `/telemetry`
- **Success Output**:
  ```
  📊 Platform Metrics
  Users: 18
  Sessions: 43
  Active Agents: 67
  Transactions: 28
  AI Calls: 121
  Success Rate: 97.8%
  Avg Response: 234ms
  ```
- **Auth Required**: No (public stats)

---

## 🎬 Demo Flow for Hackathon Judges

**Time**: 5 minutes  
**Goal**: Show real multi-tenant autonomous agent infrastructure

### Minute 1: Setup & Authentication
```
"Hi judges! This is KiteRelay - Telegram-native autonomous agents.
Every Telegram user gets an isolated runtime with real wallet execution."

/login josefophe@gmail.com
→ Show email received
→ Copy verification code

/verify <login-id> <code>
→ Show: "✅ Verified! Wallet ready."

/balance
→ Show: "💰 Wallet Balance: 100 KITE, 500 USDC"
```

### Minute 2: Agent Registration & Session Setup
```
"First, I'll register an agent identity."

/agent-register trader
→ Show: "✅ Agent Registered: agent_abc123"

/session-create 100 USDC 24h
→ Show: "✅ Session Created: sess_xyz789, Budget: 100 USDC"

/debug-runtime
→ Show: Isolated runtime, agent registered, session active
```

### Minute 3: Real Transaction with TX Hash
```
"Now I'll send a real transaction using the session."

/wallet-send 0x1234567890abcdef 10 KITE
→ Show full output:
  ✅ Transfer Confirmed
  TX Hash: 0x1234567890abcdef...
  Explorer: https://kitescan.ai/tx/0x1234...
  Status: Confirmed
  
"Notice the explorer link - this is a real blockchain transaction."
```

### Minute 4: AI Tool-Calling
```
"Now the AI part. I'll ask the AI to find pricing information."

/agent find cheapest stablecoin for 1000 USDC
→ Show LLM reasoning
→ Show tool calls: [ksearch executed]
→ Show results: "USDC via Curve: 0.9999, USDT via 1inch: 0.9998"
```

### Minute 5: Multi-User Isolation Demo
```
"Here's the key differentiator: true multi-tenant isolation.

Show User A /debug-runtime:
  User ID: 2114747878
  Agents: 1 (trader)
  Sessions: 1 (sess_xyz789)
  
Explain: User B would have completely separate:
  - User ID: different
  - Agents: separate list
  - Sessions: separate
  - Wallet: separate balance
  - Runtime: /data/users/<user_b_id>/

Zero cross-user contamination."

/agent list my agents
→ Show: Only current user's agents
```

### Wrap-Up
```
"KiteRelay transforms any Telegram user into an autonomous economic agent:

✅ Real multi-tenant architecture
✅ Real AI reasoning with tool calling
✅ Real wallet execution with TX hashes
✅ On-chain auditability
✅ Production-ready with BullMQ + Redis scheduling

This is Telegram-native autonomous agent infrastructure for Kite AI."
```

---

## 🔧 Troubleshooting Guide

### Common Issues

#### Issue: "/session-create exits with code 3"

**Root Cause**: No agent registered (agents are prerequisites for sessions).

**Solution**:
```
1. Check: /debug-runtime
2. Look for: "Agents: 0"
3. Run: /agent-register trader
4. Verify: /debug-runtime shows "Agents: 1"
5. Retry: /session-create 100 USDC 24h
```

---

#### Issue: "/balance returns 'Not authenticated'"

**Root Cause**: Authentication not completed or token expired.

**Solution**:
```
1. Re-authenticate: /login your@email.com
2. Check email for code
3. Verify: /verify <login-id> <code>
4. Retry: /balance
```

---

#### Issue: "/agent send fails with 'Session required'"

**Root Cause**: AI tool-calling requires active session for transfers.

**Solution**:
```
1. Create session: /session-create 100 USDC 24h
2. Check status: /session-list
3. Retry: /agent send @alice 1 KITE
```

---

#### Issue: "Transfer fails with 'Insufficient balance'"

**Root Cause**: Wallet doesn't have enough funds.

**Solution**:
```
1. Check: /balance
2. Request deposit via Kite wallet
3. Wait for funds
4. Retry with smaller amount
```

---

#### Issue: "/agent command times out"

**Root Cause**: LLM took >30 seconds, network latency, or API issue.

**Solution**:
```
1. Check network connection
2. Retry with simpler query: /agent balance
3. If persists, set: export LLM_TIMEOUT=60000
4. Restart bot: docker-compose restart kite-relay
```

---

#### Issue: "Cross-user data leakage suspected"

**Root Cause**: User seeing another user's data (should not happen).

**Solution**:
```
1. Run: /debug-runtime for each user
2. Verify: User IDs are different
3. Verify: Runtime paths are separate
4. If leakage confirmed, restart: docker-compose restart kite-relay
5. Contact support with user IDs
```

---

### Recovery Steps

**Full Reset for Single User**:
```bash
# Remove user's runtime
rm -rf /data/users/<user_id>/

# User must re-authenticate
/login
/verify <code>
/agent-register trader
/session-create 100 USDC 24h
```

**Full Reset (All Users)**:
```bash
# WARNING: This wipes ALL user data
rm -rf /data/users/

# Restart services
docker-compose restart kite-relay

# Users must re-authenticate
```

---

## 🛣️ Future Roadmap

### Phase 4: Advanced Telecom Integration
- `airtimePurchase` tool - Buy airtime for any phone (Twilio)
- SMS reminders for large transactions
- Push notifications for agents
- Telegram inline buttons for quick actions

### Phase 5: On-Chain Attestations
- Store agent execution proofs on-chain
- Verify agent history via blockchain
- Trustless inter-agent payments
- Decentralized agent reputation

### Phase 6: Agent Marketplace
- Publish agents for other users
- Monetize agent execution
- Revenue sharing for popular agents
- Agent rating system

### Phase 7: Advanced Autonomy
- Agent-to-agent collaboration
- Multi-signer transactions
- Time-locked spending
- Emergency pause mechanisms

---

## 📦 Installation & Deployment

### Prerequisites
```bash
# Node.js
node --version  # v18+

# Docker
docker --version
docker-compose --version

# Environment
export TELEGRAM_BOT_TOKEN=your_bot_token
export LLM_PROVIDER=openai  # or anthropic
export LLM_API_KEY=sk-...
export LLM_MODEL=gpt-4-turbo
```

### Quick Start
```bash
# Clone repo
git clone https://github.com/your-org/kite-relay.git
cd kite-relay

# Install
npm install

# Configure (create .env file)
cat > .env << EOF
TELEGRAM_BOT_TOKEN=your_bot_token
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LOG_LEVEL=info
EOF

# Build & Run
npm run build
docker-compose up -d

# Verify
docker-compose logs | grep "listening"
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| TELEGRAM_BOT_TOKEN | Yes | - | Telegram Bot Token from @BotFather |
| LLM_PROVIDER | No | openai | LLM provider: openai or anthropic |
| LLM_API_KEY | Yes | - | API key for chosen LLM provider |
| LLM_MODEL | No | gpt-4-turbo | Model name for provider |
| LOG_LEVEL | No | info | Logging level: debug, info, warn, error |
| REDIS_URL | No | redis://localhost:6379 | Redis connection (Phase 2) |
| DATABASE_URL | No | ./agents.db | SQLite database path (Phase 2) |

---

## 🏆 Hackathon Positioning

**Category**: Infrastructure / AI Agents / Web3

**Key Differentiators**:
1. **Real Infrastructure** - Not a demo, not mocks. Real multi-user isolation.
2. **Real AI** - Vercel AI SDK with real LLM providers (OpenAI/Anthropic).
3. **Real Transactions** - Blockchain TX hashes, explorer links, real wallet execution.
4. **Production Ready** - Battle-tested with BullMQ, Redis, SQLite.
5. **Telegram-Native** - 100% Telegram-first, no website, no app store.

**Pitch** (30 seconds):
> "KiteRelay transforms every Telegram user into an autonomous economic agent. Agents execute real transactions with real spending constraints, guided by real AI reasoning. True multi-tenant isolation with zero cross-user contamination. Production-grade infrastructure for autonomous economies on Kite AI."

---

## 📞 Support

**Telegram Group**: [@KiteRelaySupport](https://t.me/KiteRelaySupport)  
**GitHub Issues**: [kite-relay/issues](https://github.com/your-org/kite-relay/issues)  
**Email**: support@kite-relay.ai  

**Response Times**:
- Critical (broken for >1 user): 1 hour
- High (blocking single user): 4 hours
- Medium (degraded): 24 hours
- Low (enhancement): 1 week

---

## 📋 Documentation Index

- **[QA_VALIDATION_PLAN.md](./QA_VALIDATION_PLAN.md)** - Comprehensive testing procedures
- **[PHASE3_ARCHITECTURE.md](./PHASE3_ARCHITECTURE.md)** - System design and components
- **[PHASE3_DEPLOYMENT.md](./PHASE3_DEPLOYMENT.md)** - Deployment procedures
- **[AI_TOOL_REGISTRY.md](./AI_TOOL_REGISTRY.md)** - Tool specifications
- **[TOOL_CALLING_EXAMPLES.md](./TOOL_CALLING_EXAMPLES.md)** - Real-world examples
- **[MULTITENANT_DEBUG_GUIDE.md](./MULTITENANT_DEBUG_GUIDE.md)** - Debugging multi-user issues
- **[PHASE3_SUMMARY.md](./PHASE3_SUMMARY.md)** - Executive summary

---

## 📄 License

MIT License - See LICENSE file

---

## 🎉 Built for Kite AI Global Hackathon 2026

**Team**: [Your Team Name]  
**Submission Date**: May 2026  
**Status**: ✅ Production Ready  

---

*Real Telegram-native autonomous agent infrastructure. Real AI. Real transactions.*
