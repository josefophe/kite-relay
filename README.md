# KiteRelay: Autonomous Agent Operating System

Production-grade Telegram-native autonomous agent infrastructure for Kite Passport.

## Mission

Transform Telegram into an **autonomous AI agent operating system** where users create persistent, scheduled agents that execute real economic actions using authenticated wallet sessions.

## What this delivers

### Phase 1: ✅ Complete
- Per-telegram-user isolated runtime
- Secure CLI subprocess execution (kpass, ksearch)
- Encrypted session storage
- Wallet balance & transfer capabilities
- Programmable spending sessions

### Phase 2: 🆕 Autonomous Scheduled Agents
- **BullMQ + Redis** job scheduling
- **SQLite** persistent agent storage
- **Worker pool** for parallel execution
- **Real CLI execution** with full isolation
- **Execution history** with audit trails
- **Telegram commands**: `/agent-create`, `/agent-list`, `/agent-logs`, `/agent-run`, etc.

**Now users can create agents like**:
```
/agent-create Monitor KITE balance every hour
/agent-create Search for AI grants daily  
/agent-create Check API pricing every 6 hours
```

Agent executes on schedule → Real kpass/ksearch commands → User notified via Telegram

---

## Architecture

```
┌─────────────────────────────────────────────┐
│ Telegram                                    │
│ /agent-create "Balance every hour"         │
└────────────────┬────────────────────────────┘
                 │
                 v
         ┌───────────────────┐
         │ kite-relay Bot    │ (handles messages, queues jobs)
         │ (port 3000)       │
         └───────┬───────────┘
                 │
                 v
         ┌───────────────────┐
         │ BullMQ + Redis    │ (job queue, scheduling)
         │ (port 6379)       │
         └───────┬───────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    v                         v
┌─────────────┐         ┌─────────────┐
│   Worker 1  │  . . .  │   Worker N  │ (execute jobs in isolation)
│ Exec Pool   │         │ Exec Pool   │
└─────────────┘         └─────────────┘
    │                         │
    └────────────┬────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    v                         v
/data/users/<userId>/    SQLite Database
├── .kite-passport       ├── agents
├── workspace            ├── agent_runs
└── ...                  └── agent_execution_logs
```

### User isolation per-agent-job

```
/data/users/<telegram_user_id>/
├── .kite-passport/         # Wallet session (isolated)
├── workspace/              # Agent execution working dir
├── sessions/               # Session tokens
├── logs/                   # Execution logs
└── profile.json            # User metadata
```

Each job runs with:
```
HOME=/data/users/<userId>/
XDG_CONFIG_HOME=/data/users/<userId>/.config
TMPDIR=/data/users/<userId>/temp
```

## Quick Start

1. Copy `.env.example` to `.env` and update values.
2. Build the project:
   ```bash
   npm install
   npm run build
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open the Telegram bot and run `/start`.

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

## Documentation

### For Users
- **[AGENT_COMMANDS.md](./AGENT_COMMANDS.md)** — Command reference with examples for every `/agent-*` command
- **[AGENT_FRAMEWORK.md](./AGENT_FRAMEWORK.md)** — Features, use cases, troubleshooting

### For Developers
- **[PHASE2_QUICKREF.md](./PHASE2_QUICKREF.md)** — Quick lookup for classes, methods, database schema, common operations
- **[PHASE2_DEVELOPER_GUIDE.md](./PHASE2_DEVELOPER_GUIDE.md)** — Architecture walkthrough, data flows, debugging, extending Phase 2
- **[PHASE2_DEPLOYMENT.md](./PHASE2_DEPLOYMENT.md)** — Step-by-step deployment and operations
- **[SCHEDULER.md](./SCHEDULER.md)** — Deep dive into scheduler algorithm and design decisions
- **[PHASE2_INDEX.md](./PHASE2_INDEX.md)** — Navigation guide and FAQ

## Telegram Commands

### Phase 2: Autonomous Agents
* `/agent-create <description>` – Create an autonomous agent (e.g., "monitor balance every hour")
* `/agent-list` – Show all your agents
* `/agent-start <id>` – Enable agent
* `/agent-stop <id>` – Disable agent
* `/agent-delete <id>` – Delete agent
* `/agent-logs <id>` – View execution history
* `/agent-run <id>` – Execute immediately

### Phase 1: Core Features
* `/start` – initialize and explain the runtime
* `/login <email>` – authenticate with Kite Passport
* `/logout` – clear the session
* `/balance` – fetch wallet balance
* `/search <query>` – run a secure KSearch lookup
* `/ksearch-health` – check the KSearch backend health
* `/services [query]` – list available AI services
* `/service <service-id>` – inspect a specific service
* `/catalog-export` – export the service catalog to Markdown
* `/status` – show current runtime state
* `/help` – show all available commands

## Deployment Guide for Ubuntu

1. Install Docker and Docker Compose.
2. Create `/opt/kite-relay` and clone this repository.
3. Place `.env` with valid `TELEGRAM_BOT_TOKEN` and `APP_SECRET`.
4. Run `docker compose up -d --build`.
5. Verify `http://<server>:3000/health` returns `ok`.

## Security Notes

* Each Telegram user has a dedicated file system sandbox under `USER_DATA_ROOT`.
* The process never runs CLI commands through a shell.
* Credentials are encrypted on disk using `APP_SECRET`.
* Only allowlisted commands are executed.
* Input is sanitized and maximum query lengths are enforced.
* Audit logging is emitted for every execution attempt.

## Scalability Notes

* The service scales horizontally behind a load balancer if shared state is moved to Redis/Postgres.
* `docker-compose.yml` includes optional Redis for future queue and session persistence.
* The system is designed to accept additional frontends: Discord, Slack, REST API, and autonomous agents.

## Future Roadmap

* Add Redis-backed distributed user queues.
* Add Postgres or SQLite for long-lived identity metadata.
* Add agent orchestration and scheduling engine.
* Add webhook-based event execution and approval flows.
* Add a web dashboard for identity, wallet, and execution history.
* Add USDC/x402 payment flow simulation and transaction approval scopes.

## Notes

This project is intentionally built around per-user isolation. It demonstrates how each Telegram account can interact with Kite Passport and KSearch as if operating a local instance on its own machine.
