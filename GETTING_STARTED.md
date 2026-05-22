# 🚀 Getting Started with KiteRelay

Welcome to KiteRelay! This guide will help you get up and running in 5-10 minutes.

## What is KiteRelay?

KiteRelay is a **Telegram-native AI agent platform** that lets you:

- 💰 **Send & receive payments** in USDC and KITE tokens
- 🤖 **Create autonomous agents** that execute tasks on your behalf
- 🔐 **Manage spending limits** with session-based authorization
- 🛒 **Shop online** and make purchases with crypto
- 📅 **Schedule automated tasks** that run on their own
- 🔍 **Discover paid services** and APIs for your needs

Everything works through **Telegram** — no complex interfaces to learn.

---

## 📱 Quick Start (5 minutes)

### Step 1: Open Telegram & Find the Bot

Start a conversation with the KiteRelay bot in Telegram. Your admin will provide the bot link.

### Step 2: Authenticate (2 minutes)

```
/login your-email@example.com
```

- Check your email for a verification code
- Send the code to the bot (just copy & paste it)
- Done! You're authenticated ✅

### Step 3: Check Your Wallet (1 minute)

```
/balance
```

See how much USDC and KITE you have.

### Step 4: Make Your First Transfer (2 minutes)

```
/send @username 5 USDC
```

Or with a wallet address:

```
/send 0x1234...5678 5 USDC
```

**That's it!** You've completed the basics.

---

## 🎓 Next Steps: Choose Your Path

### Path A: **Shopper** — I want to buy things

→ Use `/shop` to browse products and checkout with crypto

- [Guide: Shopping & Checkout](USER_GUIDE.md#shopping)

### Path B: **Trader** — I want to automate payments & transfers

→ Use `/agent` to create autonomous traders and set spending limits

- [Guide: Creating Agents](USER_GUIDE.md#agents)

### Path C: **Developer** — I want to use paid APIs and services

→ Use `/discover` to find APIs, then authorize with spending sessions

- [Guide: Paid Services](USER_GUIDE.md#paid-services)

### Path D: **Scheduler** — I want tasks to run automatically

→ Use `/agent-create` with natural language like "send 5 USDC every hour"

- [Guide: Scheduling & Agents](USER_GUIDE.md#scheduling)

---

## 💡 Key Concepts in 60 Seconds

### Wallet
Your account's balance in USDC and KITE tokens. Share your wallet address to receive payments from others.

### Session
An authorization that lets agents spend your money within limits you set. You approve it on your phone.

### Agent
A bot that works on your behalf. Once authorized (via session), it can execute tasks autonomously.

### Spending Limit
Maximum amount per transaction. Protects you from large unauthorized transactions.

---

## 🆘 Need Help?

| Question | Command |
|----------|---------|
| **What commands exist?** | `/help` or `/help commands` |
| **How do I do X?** | `/help <topic>` (e.g., `/help transfers`) |
| **What's my account status?** | `/me` or `/status` |
| **See all my transactions** | `/activity` |
| **Stuck or error?** | `/debug` or see [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |

---

## 📚 Complete Documentation

- **[COMMANDS_REFERENCE.md](COMMANDS_REFERENCE.md)** — All commands explained
- **[FEATURES_OVERVIEW.md](FEATURES_OVERVIEW.md)** — Platform capabilities
- **[USER_GUIDE.md](USER_GUIDE.md)** — Step-by-step tutorials
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** — Common issues & fixes
- **[README.md](README.md)** — Technical architecture (for developers)

---

## 🔐 Security Tips

✅ **DO:**
- Keep your JWT token safe (it's like your password)
- Double-check wallet addresses before sending
- Use different agents for different purposes
- Set reasonable spending limits
- Review `/activity` regularly

❌ **DON'T:**
- Share your private keys
- Click suspicious links
- Send to random addresses
- Set unlimited spending sessions

---

## 🎉 Congratulations!

You're ready to start using KiteRelay. Pick a path above and dive in!

**Have questions?** Use `/help` anytime.

---

## Example Workflows

### Send Money to a Friend
```
/balance                    # Check you have funds
/send @john 10 USDC         # Send to friend
/activity                   # Verify it went through
```

### Create an Automated Agent
```
/agent-register trader              # Register a trading agent
/session create --max 100           # Create spending authorization
[Approve on your phone]             # Use your passkey
/agent-run trader "send 5 USDC"    # Agent executes autonomously
```

### Shop for a Product
```
/shop search "laptop"               # Find products
/shop add 12345                     # Add to cart
/shop checkout                      # Checkout with crypto
```

### Discover Services
```
/discover                           # Browse all available services
/discover search "weather"          # Find weather APIs
/session create --max 10 --ttl 1h  # Create session for service
# Use the service with session active
```

---

**Ready? Start with `/login` now!** 🚀
