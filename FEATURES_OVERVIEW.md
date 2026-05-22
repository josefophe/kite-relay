# ✨ Features Overview

Comprehensive guide to all KiteRelay capabilities.

---

## 🎯 Core Features

### 1. Wallet & Payments

**What:** Send and receive USDC and KITE tokens directly through Telegram.

**How to use:**
```
/balance                      # Check your balance
/send @user 5 USDC           # Send tokens
/activity                     # View transaction history
```

**Best for:**
- Quick payments to friends
- Receiving funds
- Checking your balance
- Transferring tokens to other addresses

**Key benefits:**
✅ Instant transfers (no fees for basic transfers)  
✅ Global — works across borders  
✅ Track every transaction  
✅ Send to @username or wallet address  

**Limits:**
- Maximum per transaction: Limited by your session
- Minimum: 0.01 USDC/KITE
- Requires authentication

---

### 2. Autonomous Agents

**What:** Create bots that work on your behalf, executing tasks autonomously.

**How to use:**
```
/agent-register trader           # Register an agent
/agent-create "send 5 USDC daily" # Create scheduled agent
/agent-list                       # See your agents
/agent-logs trader-001           # View agent activity
```

**Best for:**
- Recurring payments
- Regular transfers
- Automated trading
- Scheduled notifications
- Background monitoring

**Agent types:**
- `trader` — Execute payments and transfers
- `collector` — Gather data from services
- `farmer` — Perform scheduled farming tasks
- `custom` — Your own custom logic

**How it works:**
1. Register an agent with a type
2. Create a spending session (authorize limits)
3. Agent executes based on your rules
4. Check logs to see what it did

**Key benefits:**
✅ Set it and forget it  
✅ Works 24/7 without your involvement  
✅ Respects spending limits you set  
✅ Full audit trail in logs  
✅ Can stop anytime  

**Example scenarios:**
- "Check if KITE price drops below $10, then buy"
- "Send 5 USDC to @charity at 9am daily"
- "Monitor weather and notify if rain expected"

---

### 3. Spending Sessions & Budget Control

**What:** Authorize agents to spend your money within limits you define.

**How to use:**
```
/session-create --agent trader --max 100 --ttl 24h
/session-list                    # See all your sessions
/session-status sess-001         # Check session details
/session-revoke sess-001         # Revoke/cancel session
```

**Best for:**
- Safe agent authorization
- Testing new agents
- Limiting risk
- Temporary permissions
- Auditing agent spending

**Session parameters:**
- `--max <amount>` — Highest per-transaction amount (e.g., --max 100)
- `--ttl <time>` — Session duration (e.g., --ttl 24h, --ttl 7d)
- `--agent <id>` — Link to specific agent

**How it works:**
1. Create session with your limits
2. Approve on your phone (via passkey)
3. Agent can now spend up to your limit
4. Session expires after TTL
5. Session or limit can be revoked anytime

**Key benefits:**
✅ Full control over spending  
✅ Set per-transaction limits  
✅ Set time limits (1h to 30d)  
✅ Revoke anytime  
✅ Separate sessions per agent  
✅ See all active sessions  

**Example:**
- "Allow trader agent 100 USDC/transaction for 24 hours"
- "Give collector agent 50 USDC max for 7 days"

---

### 4. Service Discovery & Paid APIs

**What:** Browse and use hundreds of paid services (weather, AI, image generation, etc.) with crypto.

**How to use:**
```
/discover                        # Browse all services
/discover search "weather"       # Find weather APIs
/discover details service-id     # See service details
# Create session, then use the service
```

**Available services:**
- 🎨 **Image generation** — DALL-E, Midjourney, Stable Diffusion
- 🎤 **Voice & audio** — TTS, voice recognition, music generation
- 📊 **Data** — Weather, news, prices, exchange rates, geocoding
- 🧠 **AI & compute** — LLM APIs, translation, transcription, OCR
- 🛍️ **Shopping** — Amazon, product comparison, price tracking
- 📱 **Communication** — Email, SMS, Telegram notifications

**How it works:**
1. Use `/discover` to find a service
2. Create a session with spending limit
3. Approve session on your phone
4. Use the service (agent calls it)
5. Payments settle automatically

**Key benefits:**
✅ Hundreds of APIs available  
✅ Pay only what you use  
✅ Budgets enforced automatically  
✅ No credit card needed  
✅ Global, instant settlements  
✅ Can revoke access anytime  

**Example use cases:**
- Generate images for social media
- Get weather data for your location
- Translate documents
- Transcribe audio files
- Price compare across stores

---

### 5. Shopping with Crypto

**What:** Browse products and checkout using USDC or KITE tokens.

**How to use:**
```
/shop search "laptop"            # Search products
/shop add product-id             # Add to cart
/shop cart                        # View cart
/shop checkout --asset USDC      # Pay with crypto
```

**Best for:**
- Buying products online
- Accessing exclusive merchant deals
- Using crypto for e-commerce
- Integration with agents

**Supported merchants:**
- Amazon (more coming)
- Direct partner stores
- Exclusive crypto deals

**How it works:**
1. Search for product
2. Add to cart
3. Checkout (specify USDC or KITE)
4. Payment processes instantly
5. Receive order confirmation + tracking

**Key benefits:**
✅ Use crypto for real-world purchases  
✅ No additional conversion steps  
✅ Instant order confirmation  
✅ Full order history  
✅ Track shipment  

**Example:**
```
/shop search "programming books"
/shop add 12345
/shop checkout --asset USDC
```

---

### 6. Scheduling & Automation

**What:** Create agents that execute tasks on a schedule (daily, hourly, weekly, etc.).

**How to use:**
```
/agent-create "Check balance every hour"
/agent-create "Send 5 USDC to @charity at 9am daily"
/agent-create "Monitor price every 15 minutes"
```

**Best for:**
- Daily/weekly payments
- Recurring checks
- Alerts and notifications
- Automation workflows
- Background monitoring

**Schedule formats:**
- "every hour" — Hourly
- "every 6 hours" — Every 6 hours
- "daily at 9am" — Daily at specific time
- "daily" — Daily at random time
- "weekly on Monday" — Weekly
- "every 15 minutes" — Custom intervals

**How it works:**
1. Use natural language to describe schedule
2. Bot parses and creates agent
3. Agent runs automatically on schedule
4. See results in logs
5. Adjust or cancel anytime

**Key benefits:**
✅ Natural language (no coding needed)  
✅ Runs automatically 24/7  
✅ Respects spending limits  
✅ Full execution logs  
✅ Can modify anytime  

**Example triggers:**
- "Check if USDC price > $1, then buy"
- "If balance > 100, send 10 USDC to @charity"
- "Every Monday, send weekly report"

---

### 7. User Onboarding & Guidance

**What:** Interactive tutorials and step-by-step guides for new users.

**How to use:**
```
/start                           # Begin onboarding
/tutorial full                   # 60-min complete walkthrough
/setup auth                      # Authentication guide
/help                            # Command reference
```

**Learning paths:**
- 📚 **Quick Tutorials** (5-15 min each)
  - Wallet basics
  - Making transfers
  - Using agents
  - Spending sessions
  - Budget management

- 📚 **Setup Flows** (10 min each)
  - Authentication
  - Profile setup
  - First transfer
  - Agent registration
  - Session creation

- 📚 **Complete Walkthrough** (60 min)
  - Full platform orientation
  - All features explained
  - Real examples
  - Best practices
  - Certificate on completion

**How it works:**
1. Start with `/start` or `/tutorial full`
2. Follow step-by-step instructions
3. Complete quizzes
4. Get guidance at each stage
5. Earn completion certificate

**Key benefits:**
✅ Learn at your own pace  
✅ No prerequisites  
✅ Interactive with real examples  
✅ Quizzes to test knowledge  
✅ Always available  
✅ Skip flows you know  

---

### 8. Activity & Transaction History

**What:** Complete audit trail of everything you've done.

**How to use:**
```
/activity                        # All transactions
/activity 20                     # Last 20 transactions
/activity --filter sent          # Only sent transfers
/activity --filter received      # Only received transfers
/agent-logs agent-001            # Agent execution logs
```

**Shows:**
- Sent and received transfers
- Agent execution history
- Session approvals
- API calls made
- Timestamps
- Transaction hashes
- Status (completed/failed)

**Best for:**
- Verifying payments
- Tax records
- Debugging issues
- Monitoring agent activity
- Compliance audits

**Key benefits:**
✅ Complete history forever  
✅ Filter by type, date, amount  
✅ Export for tax purposes  
✅ Transaction hashes for verification  
✅ See exactly what happened  

---

### 9. Account & Profile Management

**What:** Manage your account information, preferences, and settings.

**How to use:**
```
/me                              # Full account details
/login email@example.com         # Sign in
/logout                          # Sign out
/config                          # View settings
```

**Account info includes:**
- User ID
- Email address
- Wallet address
- Account creation date
- Authentication status
- All active agents
- All active sessions

**Key benefits:**
✅ Always see your status  
✅ Verify authentication  
✅ Review all active permissions  
✅ Control your privacy  

---

### 10. Help & Support

**What:** Comprehensive help system with topics, examples, and troubleshooting.

**How to use:**
```
/help                            # General help
/help commands                   # All commands
/help transfers                  # Specific topic help
/help agents                     # Agent help
/debug health                    # System check
```

**Available topics:**
- commands
- transfers
- agents
- sessions
- services
- shopping
- troubleshooting

**Key benefits:**
✅ Always available  
✅ Topic-specific help  
✅ Examples included  
✅ Links to full docs  
✅ Emergency support guidance  

---

## 🔑 Feature Comparison Table

| Feature | Free | Auth Required | Cost | Limits |
|---------|------|---------------|------|--------|
| Wallet balance check | ✅ | No | Free | Unlimited |
| Send tokens | ✅ | Yes | Free* | Per session |
| View history | ✅ | Yes | Free | Unlimited |
| Create agent | ✅ | Yes | Free | 5 agents |
| Create session | ✅ | Yes | Free | Per agent |
| Use paid services | ✅ | Yes | $0.01-$1.00 | Per session |
| Shop products | ✅ | Yes | Purchase price | Per transaction |
| View help | ✅ | No | Free | Unlimited |

*Base transfers free; fees may apply for certain services

---

## 🎓 Recommended Learning Path

### Day 1: Foundation (30 min)
1. `/login` — Sign in
2. `/balance` — Check wallet
3. `/help commands` — Learn commands
4. `/tutorial wallet` — Wallet basics

### Day 2: Transactions (30 min)
1. `/setup transfer` — Learn transfers
2. `/send @user 1 USDC` — Make first transfer
3. `/activity` — Verify transaction
4. `/tutorial transfers` — Deep dive

### Day 3: Agents (45 min)
1. `/setup agents` — Agent basics
2. `/agent-register trader` — Create agent
3. `/setup session` — Learn sessions
4. `/session-create --max 10` — Create session
5. `/tutorial agents` — Agent guide

### Day 4+: Advanced (varies)
1. `/discover` — Explore services
2. Create agents with services
3. `/shop search` — Try shopping
4. `/tutorial full` — Complete mastery

---

## 💡 Pro Tips

1. **Start small** — Use minimal spending limits until you're comfortable
2. **Test first** — Try new agents with 1 USDC before going bigger
3. **Check logs** — Always review `/agent-logs` to see what happened
4. **Revoke unused sessions** — Keep security tight with `/session-revoke`
5. **Use `/help`** — It's always there when you're stuck
6. **Read `/activity`** — Verify everything went as expected

---

## 🚀 What's Coming

- Machine learning-based agent recommendations
- Multi-signature spending authorization
- Advanced scheduling with conditions
- Custom integration APIs
- Agent templates and marketplace

---

See [GETTING_STARTED.md](GETTING_STARTED.md) to start using features today!
