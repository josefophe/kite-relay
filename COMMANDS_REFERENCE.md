# 📋 Complete Commands Reference

All available commands in KiteRelay, organized by category.

---

## 🔐 Authentication Commands

### `/login <email>`
Sign in with your email address.

```
/login user@example.com
```

- Bot sends verification code to your email
- You reply with the code to complete login
- Your session is active for 24 hours

**See also:** `/signup`, `/logout`

### `/signup <email>`
Create a new account with your email.

```
/signup user@example.com
```

- Creates account and registers your passkey
- Follow on-screen prompts to complete
- You can log in immediately after signup

**See also:** `/login`, `/logout`

### `/logout`
Log out and clear your session.

```
/logout
```

- Clears your JWT token
- You'll need to `/login` again to use paid features
- Free commands like `/help` still work

**See also:** `/login`, `/status`

---

## 💰 Wallet & Balance Commands

### `/balance`
Check your account balance.

```
/balance
```

**Shows:**
- Total USDC balance
- Total KITE balance
- Wallet address (0x format)

**Example output:**
```
💰 Your Wallet
Address: 0x1234...5678
USDC: 100.50
KITE: 50.00
```

### `/me`
Get full account details.

```
/me
```

**Shows:**
- User ID
- Wallet address
- Account status (verified/pending)
- Session info
- Creation date

### `/send <recipient> <amount> <asset>`
Send tokens to another user.

```
/send @john 5 USDC
/send 0x1234...5678 10 KITE
```

**Parameters:**
- `<recipient>` — Username (@john) or wallet address (0x...)
- `<amount>` — Number of tokens to send (e.g., 5, 10.5)
- `<asset>` — USDC or KITE (default: USDC)

**⚠️ Important:**
- Transfers are **permanent** — cannot be reversed
- Double-check address before confirming
- Transaction appears in `/activity` immediately

### `/activity`
View transaction history.

```
/activity
/activity 10          # Last 10 transactions
/activity --filter sent   # Only sent transfers
```

**Shows:**
- All sent and received transfers
- Timestamps
- Transaction status
- Transaction hash (for blockchain verification)

---

## 🤖 Agent Commands

### `/agent-register <type>`
Register a new autonomous agent.

```
/agent-register trader
/agent-register collector
/agent-register farmer
```

**Agent Types:**
- `trader` — Execute transfers and payments
- `collector` — Gather data from multiple sources
- `farmer` — Perform scheduled farming tasks
- `custom` — Custom agent for specific use case

**Returns:**
- Agent ID
- Status
- Ready to create a session

### `/agent-list`
List all your registered agents.

```
/agent-list
```

**Shows:**
- Agent ID
- Agent type
- Status (active/inactive)
- Associated session status
- Creation date

### `/agent-create <description>`
Create and start a new scheduled agent using natural language.

```
/agent-create Check my balance every hour
/agent-create Send 5 USDC to @charity daily at 9am
/agent-create Monitor KITE price changes
```

**How it works:**
1. You describe what you want in natural language
2. Bot parses your intent
3. Creates and registers the agent
4. Starts scheduling (if applicable)
5. Returns agent ID and status

### `/agent-start <agent-id>`
Start or resume an agent.

```
/agent-start trader-001
```

**Returns:**
- Confirmation
- Agent status
- Next scheduled execution

### `/agent-stop <agent-id>`
Pause or stop an agent.

```
/agent-stop trader-001
```

**Returns:**
- Confirmation
- Any pending tasks are cancelled
- Can restart anytime with `/agent-start`

### `/agent-delete <agent-id>`
Permanently delete an agent.

```
/agent-delete trader-001
```

**⚠️ Warning:**
- This cannot be undone
- Associated sessions are also deleted
- Pending tasks are cancelled

### `/agent-logs <agent-id>`
View execution logs for an agent.

```
/agent-logs trader-001
/agent-logs trader-001 --last 20
```

**Shows:**
- Execution history
- Results and status
- Errors (if any)
- Timestamps

### `/agent-run <agent-id> "<command>"`
Manually trigger an agent to execute a command.

```
/agent-run trader "send 5 USDC to @john"
/agent-run collector "get balance"
```

---

## 💳 Session Commands

### `/session-create <options>`
Request authorization for an agent to spend your money.

```
/session-create --agent trader --max 100 --ttl 24h
/session-create --max 500 --ttl 7d
```

**Options:**
- `--agent <id>` — Link to specific agent
- `--max <amount>` — Maximum per transaction (e.g., 100)
- `--ttl <time>` — How long session stays active (e.g., 24h, 7d)

**Session TTLs:**
- `1h` — 1 hour
- `24h` — 1 day
- `7d` — 1 week
- `30d` — 1 month

**Returns:**
- Session ID
- Status (pending approval)
- Instructions to approve on phone

### `/session-approve <session-id>`
Approve a spending session via passkey.

```
/session-approve sess-001
```

**Requires:**
- Passkey on your phone
- Session to be in pending state

**Returns:**
- Confirmation
- Session now active for agents

### `/session-list`
List all your sessions.

```
/session-list
/session-list --status active
/session-list --status expired
```

**Shows:**
- Session ID
- Associated agent
- Status (pending/active/expired)
- Spending limit
- Time remaining
- Created date

### `/session-status <session-id>`
Check status of a specific session.

```
/session-status sess-001
```

**Shows:**
- Current status
- Spending limit
- Remaining limit
- Created/expires
- Associated agent

### `/session-revoke <session-id>`
Revoke/cancel an active session.

```
/session-revoke sess-001
```

**⚠️ Effects:**
- Agent can no longer spend with this session
- Can create a new session anytime

---

## 🔍 Discovery & Search Commands

### `/discover`
Browse all available paid services and APIs.

```
/discover
/discover --category weather
/discover --category apis
```

**Service Categories:**
- Image generation (DALL-E, Midjourney, etc.)
- Voice & audio (TTS, voice recognition, music)
- Data (weather, news, prices, geocoding)
- Compute (LLM, translation, transcription, OCR)
- Commerce (shopping, comparison, deals)

**Shows:**
- Service name
- Description
- Price per call
- Documentation link

### `/discover search <keyword>`
Search for specific services.

```
/discover search weather
/discover search "image generation"
/discover search LLM
```

**Returns:**
- Matching services
- Descriptions
- Pricing
- Availability

### `/discover details <service-id>`
Get detailed information about a service.

```
/discover details weather-api-001
```

**Shows:**
- Full description
- Pricing model
- Example use cases
- Documentation
- How to use with agents

---

## 🛒 Shopping Commands

### `/shop`
Open shopping interface.

```
/shop
/shop search "laptop"
/shop search "phone" --price-range 100-500
```

**Returns:**
- List of products
- Prices in USD and crypto equivalent
- Product images and descriptions

### `/shop add <product-id>`
Add product to shopping cart.

```
/shop add prod-12345
```

**Returns:**
- Confirmation
- Product added
- Current cart total

### `/shop cart`
View your shopping cart.

```
/shop cart
```

**Shows:**
- Items in cart
- Prices
- Total
- Options to edit or checkout

### `/shop remove <product-id>`
Remove item from cart.

```
/shop remove prod-12345
```

### `/shop checkout`
Pay for items in cart with crypto.

```
/shop checkout --asset USDC
```

**Options:**
- `--asset USDC` or `--asset KITE` — Which token to use

**Returns:**
- Payment confirmation
- Order confirmation
- Transaction hash
- Estimated delivery

---

## 📚 Learning & Onboarding Commands

### `/start`
Initialize onboarding journey.

```
/start
```

**For new users:**
- Guides through account setup
- Shows available learning paths
- Tracks progress

### `/setup <flow>`
Start a specific setup flow.

```
/setup auth         # Authentication setup
/setup profile      # Profile & wallet
/setup transfer     # First transfer
/setup agents       # Agent registration
/setup session      # Session creation
/setup api          # Paid APIs
```

**Each flow:**
- 3-5 steps
- ~10 minutes total
- Step-by-step guidance
- Tips and best practices

### `/tutorial <type>`
Enroll in video tutorials.

```
/tutorial full          # 60-min complete walkthrough
/tutorial transfers     # 10-min transfers guide
/tutorial agents        # 8-min agents guide
/tutorial sessions      # 10-min sessions guide
/tutorial wallet        # 5-min wallet basics
```

**Includes:**
- Video lessons
- Interactive quizzes
- Certificate on completion

### `/progress`
Check your onboarding progress.

```
/progress
```

**Shows:**
- Completed flows
- Active tutorials
- Recommended next steps
- Overall completion %

### `/help`
Get help and command reference.

```
/help
/help commands
/help transfers
/help agents
/help sessions
```

**Help topics:**
- `commands` — All available commands
- `transfers` — How to send tokens
- `agents` — Creating and managing agents
- `sessions` — Spending authorization
- `services` — Using paid APIs
- `shopping` — Product search and checkout

### `/guide <topic>`
Access detailed guides.

```
/guide getting-started
/guide first-transfer
/guide agent-automation
/guide paid-services
```

---

## 🔧 System & Debug Commands

### `/status`
Check overall system status.

```
/status
```

**Shows:**
- Authentication status
- Wallet status
- Session status
- Bot version
- System health

### `/version`
Display bot version.

```
/version
```

**Shows:**
- Current version
- Latest version
- Update status

### `/debug health`
Run health check.

```
/debug health
```

**Checks:**
- Database connection
- Wallet service
- Session service
- API connectivity

### `/debug logs <count>`
View recent bot logs.

```
/debug logs 10
```

---

## 🎯 Utility Commands

### `/cancel`
Cancel current operation.

```
/cancel
```

- Cancels pending transfers
- Clears pending authorizations
- Returns to main menu

### `/config`
View your configuration.

```
/config
```

**Shows:**
- Default asset (USDC/KITE)
- Default agent type
- Notifications on/off
- Language preference

### `/faucet`
Get test tokens (testnet only).

```
/faucet
```

**On testnet:**
- Receive 10 USDC test tokens
- Can use once every 24 hours
- Great for trying out features

---

## 💬 Interactive Examples

### Example 1: Send Money
```
User: /balance
Bot: 💰 Your balance: 100 USDC, 50 KITE

User: /send @charity 5 USDC
Bot: Confirm sending 5 USDC to @charity?
      [Confirm]  [Cancel]

User: [Confirm]
Bot: ✅ Sent 5 USDC to @charity (tx hash: 0x...)
     Your new balance: 95 USDC
```

### Example 2: Create Agent
```
User: /agent-create "Check balance daily at 9am"
Bot: 🤖 Creating agent...
     Agent ID: trader-12345
     Status: Active
     Next check: Tomorrow 9:00 AM

User: /agent-logs trader-12345
Bot: 📝 Agent logs:
     ✅ 2024-01-15 09:00 - Balance: 95 USDC
     ✅ 2024-01-14 09:00 - Balance: 100 USDC
```

### Example 3: Session & Payment
```
User: /discover search weather
Bot: 🌤️ Weather API - $0.01 per call
     [View Details]

User: /session-create --max 1 --ttl 24h
Bot: 💳 Session created: sess-12345
     Approve on your phone...
     
[User approves on phone]

Bot: ✅ Session approved
     Ready to use weather API
```

---

## ❓ Quick Help

### Forgot a command?
```
/help
```

### Need details on a topic?
```
/help <topic>
```

### Stuck or error?
```
/debug health
```

### Want to learn properly?
```
/tutorial full
```

### See your activity?
```
/activity
```

---

## Command Cheat Sheet

| Goal | Command |
|------|---------|
| Sign in | `/login email@example.com` |
| Check balance | `/balance` |
| Send money | `/send @user 5 USDC` |
| See transactions | `/activity` |
| Create agent | `/agent-create "description"` |
| Create session | `/session-create --max 100` |
| Search services | `/discover search keyword` |
| Shop | `/shop search "product"` |
| Learn | `/tutorial full` |
| Get help | `/help` |

---

**Need more help?** See [GETTING_STARTED.md](GETTING_STARTED.md) for tutorials or [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues.
