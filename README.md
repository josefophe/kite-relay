# 🚀 KiteRelay: Autonomous Agent Operating System for Kite AI

**Production-ready Telegram-native AI agent infrastructure for the Kite AI Hackathon 2026**

Transform autonomous agents into real economic actors. KiteRelay is a full-stack agent OS that authenticates users, manages wallets, schedules tasks, and executes on-chain transactions — all through natural language in Telegram.

---

## 🎯 What This Is

A **complete agent-native platform** that turns Telegram into an autonomous operating system where:

- 🤖 **Agents autonomously execute** economic actions on Kite Passport
- 💰 **Real payments** settle on-chain via USDC/x402 protocol
- 🔐 **Identity-driven** with per-user wallet and session isolation
- 📅 **Scheduled execution** with persistent agent storage and retry logic
- 🛡️ **Safety-first** with spending limits, session-based authorization, and audit trails

**Built for**: Agentic Commerce, Agentic Trading, and AI-native economic workflows.

---

## ⚡ Core Capabilities

| Feature | What It Does | For Hackathon Judges |
|---------|-------------|----------------------|
| **Wallet Authentication** | Users sign in with Kite Passport JWT. Each user gets an isolated runtime. | ✅ Real identity, real payments |
| **Autonomous Scheduling** | Create agents with natural language ("check balance every hour"). Executes on time via Redis/BullMQ. | ✅ Agent autonomy score: persistent, scheduled |
| **Economic Actions** | Transfer tokens, check balances, query services, create spending sessions. | ✅ Real economic impact, settled on-chain |
| **Session-Based Spending** | Agents operate within pre-approved spending limits per session. | ✅ Programmable constraints, safety-first |
| **AI Orchestration** | Claude/GPT-powered natural language intent resolution + fast-path optimization. | ✅ Developer experience, intelligent routing |
| **Audit Trail** | Every action is logged with user, timestamp, parameters, result, and transaction hash. | ✅ Proof and auditability |

---

## 🏗️ Architecture

```
Telegram User                AI Intent                 Kite Chain
    │                            │                          │
    ├─ /agent "send 5 USDC"     │                          │
    │  /balance                  │                          │
    │  /agent-register trader    │                          │
    │                            │                          │
    └──────────────────┬─────────┴──────────────┬──────────┘
                       │                        │
                   KiteRelay Bot            Wallet Execute
                (Telegram Handler)         (LLM Orchestration)
                       │                        │
                       ├─ Auth Check           ├─ Intent Parsing
                       ├─ Runtime Isolate      ├─ Safety Validation
                       ├─ Job Queue            └─ x402 Payment
                       │
                ┌──────┴──────┐
                │             │
            Redis/BullMQ   Worker Pool
            (Scheduler)    (Job Executor)
                │             │
                └─────┬───────┘
                      │
                  User Data
              (SQLite + Wallet)
```

### Per-User Isolation

Each Telegram user gets:

```
/data/users/<telegram_id>/
├── .kite-passport/              # Wallet session (encrypted)
├── agents/                       # Scheduled agent definitions
├── sessions/                     # Approved spending sessions
└── logs/                         # Execution history + tx hashes
```

---

## 🚀 Quick Start

### 1. **Set Up Environment**

```bash
cp .env.example .env
# Edit .env with your:
# - TELEGRAM_BOT_TOKEN (from @BotFather)
# - ANTHROPIC_API_KEY or equivalent LLM
# - KITE_PASSPORT_BASE_URL (production)
```

### 2. **Build & Run**

```bash
# Build
npm install && npm run build

# Start relay (Telegram handler)
npm start

# In another terminal, start worker pool (agent executor)
npm run worker
```

### 3. **Test in Telegram**

Find your bot and send:
```
/start                          # Onboarding & setup
/login your@email.com           # Authenticate with Kite Passport
/balance                        # Check wallet
/agent monitor balance hourly   # Create an autonomous agent
/agent-list                     # See all your agents
```

### With Docker

```bash
docker compose up --build
```

---

## 📖 Documentation by Audience

### **Understanding the Problem & Solution**

See **[ABOUT_HACKATHON.md](./About-hackathon.md)** for full context.

**Problem**: Building autonomous agents is complex. Users need identity, wallets, scheduling, safety controls, and on-chain settlement — but no single platform integrates all of this.

**Solution**: KiteRelay merges Telegram (ubiquitous messaging), Kite Passport (identity + wallet), and AI orchestration (Claude/GPT) into one coherent system. Agents are first-class citizens with persistent storage, scheduling, and audit trails.

**Why It Matters**:
- **Accessibility**: Agents start in Telegram; no new app to learn
- **Real Economy**: Agents control real wallets and settle transactions on-chain
- **Developer Speed**: 3 commands to launch an autonomous agent; natural language, not APIs
- **Production-Ready**: Safety validation, rate limiting, encrypted storage, full audit logs

### **For Developers Building on KiteRelay**

| Document | Purpose |
|----------|---------|
| [PHASE5_DEMO.md](./PHASE5_DEMO.md) | Live demo walkthrough with user scenarios |
| [PHASE4_ARCHITECTURE.md](./PHASE4_ARCHITECTURE.md) | Deep architecture: relay/worker, isolation, safety |
| [Docs/AI-md/](./Docs/AI-md/) | AI orchestration, tool calling, intent resolution |
| [Docs/2-md/](./Docs/2-md/) | Autonomous agent scheduler and job execution |
| [PHASE3_QUICK_START.md](./PHASE3_QUICK_START.md) | Integration guide for skills and tools |

### **For Operations & Deployment**

- **Docker Compose for Linux/wsl2** (`docker-compose.yml`) — Full stack with Redis, SQLite, relay + workers
- **Docker Compose for mac users** [docker-compose-mac](./Docs/docker-compose-mac.txt) — Copy and paste this to your (`docker-compose.yml`)
- **Health checks** — `/health` endpoint available at `http://localhost:3000/health`
- **Logs** — Pino JSON logging to stdout; structured for observability

---

## 🎁 What's Delivered

### Core Features

✅ **Phase 1**: Per-user isolated runtime with CLI execution  
✅ **Phase 2**: Autonomous scheduled agents (Redis/BullMQ + SQLite)  
✅ **Phase 3**: AI orchestration with natural language intent  
✅ **Phase 4**: Safety framework, session-based spending, audit logging  
✅ **Phase 5**: User onboarding, first-time prompts, contextual help  

### Production-Ready

- **~3,500 lines** of TypeScript across 25+ modules
- **40+ Telegram commands** covering agent, wallet, and discovery operations
- **9 Kite Passport skills** integrated: auth, wallet, search, sessions, x402 execute
- **Full test suite** (30+ tests covering core flows)
- **Security**: encrypted storage, input validation, rate limiting, audit logs

---

## 🔗 Integration with Kite AI

This system integrates **9 Kite Passport skills**:

| Skill | What It Does | Agent Use Case |
|-------|-------------|-----------------|
| **authenticateUser** | Sign up, login, verify email | Agent proves user identity |
| **walletSend** | Direct token transfers | Agent transfers USDC/KITE |
| **kiteDiscovery** | Search service catalog | Agent finds APIs to integrate |
| **requestSession** | Create spending sessions | Agent requests budget approval |
| **x402Execute** | Pay for API calls | Agent calls paid endpoints |
| **manageAgents** | Register agent types | Agent self-registers |
| **activity** | View transaction history | Agent audits its own spending |

---

## 📊 For Judges: How to Evaluate

| Criterion | Evidence |
|-----------|----------|
| **Agent Autonomy** | Create agent with `/agent monitor balance hourly`. It runs without user interaction. Check `/agent-logs` for execution proof. |
| **Developer Experience** | No boilerplate. 3 commands to authenticate and create agent. Natural language (no slash-commands needed after setup). |
| **Real-World Impact** | View `/balance` to see real Kite chain wallet. Use `/wallet-send` to execute transaction on mainnet. |
| **Proof & Auditability** | Every action in SQLite: user, timestamp, tx hash, result. Export via `/agent-logs` or query database. |
| **Novel/Creative** | First production-grade agent OS where Telegram = agent runtime. Combines Kite identity + AI + scheduling in one place. |

---

## 🛠️ Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Scheduler**: BullMQ (Redis-backed)
- **Database**: SQLite (user data) + Redis (queues)
- **LLM**: Vercel AI SDK (Claude, GPT, Groq)
- **Telegram**: node-telegram-bot-api
- **Auth**: Kite Passport (JWT)
- **Container**: Docker + Docker Compose

---

## 📚 Repository Structure

```
kite-4/
├── src/
│   ├── app.ts                      # Main Telegram bot
│   ├── executionWorker.ts          # Job executor
│   ├── aiOrchestration.ts          # LLM integration
│   ├── scheduler.ts                # Cron/recurring logic
│   ├── agentStorage.ts             # Agent persistence
│   ├── telegramBot.ts              # Command router
│   ├── skills/                     # Kite Passport wrappers
│   └── ...
├── tests/                          # Test suite
├── Docs/                           # Detailed documentation
│   ├── 1md/                        # Phase 1
│   ├── 2-md/                       # Phase 2 (agents)
│   ├── 3-md/                       # Phase 3 (AI)
│   ├── AI-md/                      # AI integration
│   └── ...
├── docker-compose.yml              # Full stack
├── Dockerfile                      # Container image
└── README.md                       # This file
```

---

## 🚢 Deployment

**Single-command deployment:**

```bash
docker compose up -d --build
```

Starts:
- Telegram bot (port 3000)
- Redis (port 6379)
- SQLite (embedded)
- Worker pool (scaled as needed)

**Verify:**

```bash
curl http://localhost:3000/health
# {"status":"ok","uptime":"..."}
```

## 🎯 Next Steps

1. **Run the demo**: `docker compose up && /start in Telegram`
2. **Read the architecture**: [PHASE4_ARCHITECTURE.md](./PHASE4_ARCHITECTURE.md)
3. **Explore Docs**: [Docs/](./Docs/) for detailed guides
4. **Deploy**: Use docker-compose or follow [Deployment Guide](./Docs/2-md/PHASE2_DEPLOYMENT.md)

**Questions?** Check [ABOUT_HACKATHON.md](./About-hackathon.md) for the vision, or [PROJECT_STATUS.md](./PROJECT_STATUS.md) for implementation details.


---

## 🤝 Contributing

This is a hackathon submission. The codebase is production-ready with:

- Comprehensive error handling
- Structured logging (Pino)
- Input validation and sanitization
- Rate limiting and budgets
- Full audit trail

See [PHASE4_ARCHITECTURE.md](./PHASE4_ARCHITECTURE.md) for integration patterns.

---

## 🗺️ Future Roadmap

### Phase 6: Performance & Optimization
- Redis-backed distributed job queue for horizontal scaling
- Postgres for multi-tenant session management
- Agent execution analytics and insights dashboard

### Phase 7: Ecosystem Growth
- **Incentive Program for Testers**: Reward community members who report bugs, test new features, and validate stability
  - Weekly bounties for critical issue reports
  - Beta tester rewards (USDC or KITE tokens)
  - Public leaderboard for contributors

- **Tutorial & Learning Rewards**: Engage new developers with economic incentives
  - Complete onboarding tutorial → earn tokens
  - Build your first agent → unlock features + bonus balance
  - Publish agent templates → recurring royalties on community usage
  - Run 10 successful transactions → certificate + community badge

### Phase 8: Advanced Features
- Webhook-based event triggers and multi-agent orchestration
- Agent-to-agent communication and collaboration
- Web dashboard for identity, wallet, and execution history
- Template library for common agent patterns (monitoring, trading, discovery)

---



---

## 📝 License

Part of the Kite AI Global Hackathon 2026. Built with Kite Passport and Kite AI infrastructure.

