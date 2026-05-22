# 📖 User Guide: Step-by-Step Tutorials

Practical walkthroughs for common tasks and scenarios.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Sending Your First Transfer](#sending-your-first-transfer)
3. [Creating Your First Agent](#creating-your-first-agent)
4. [Using Paid Services](#using-paid-services)
5. [Shopping with Crypto](#shopping-with-crypto)
6. [Managing Spending Sessions](#managing-spending-sessions)
7. [Advanced Automation](#advanced-automation)
8. [Security Best Practices](#security-best-practices)

---

## Getting Started

### Prerequisites
- Telegram account
- Valid email address
- Internet connection

### Step 1: Authentication (5 minutes)

**Goal:** Create your account and log in.

**Steps:**

1. Open Telegram and find the KiteRelay bot
2. Send `/login your-email@example.com`
   ```
   /login jane.doe@example.com
   ```
3. Check your email for a verification code (usually arrives in ~1 second)
4. Copy the code and send it to the bot
   ```
   ABC123XY
   ```
5. Wait for authentication confirmation

**Expected output:**
```
✅ Login successful!
Your passport ID: 12345
Wallet: 0x1234...5678
Session expires in: 24 hours
```

**Common issues:**
- ❌ "Email not found" → Check spelling
- ❌ "Code expired" → Code is valid for 10 minutes only
- ❌ Didn't receive email → Check spam folder

**Next:** Check your balance with `/balance`

---

### Step 2: Profile Setup (5 minutes)

**Goal:** Understand your account and wallet.

**Steps:**

1. Check your full profile:
   ```
   /me
   ```
   You'll see:
   - Your user ID
   - Wallet address (0x... format)
   - Authentication status
   - Account creation date

2. Check your balance:
   ```
   /balance
   ```
   You'll see:
   - USDC balance
   - KITE balance
   - Wallet address

3. Save your wallet address somewhere safe
   - Share it with others who want to send you money
   - Use it to receive transfers

**Expected output:**
```
💰 Your Wallet

Address: 0x1234567890123456789012345678901234567890
USDC: 100.00
KITE: 50.00
Status: Active ✅
```

**Next:** Ready to send your first transfer!

---

## Sending Your First Transfer

### Scenario: Send Money to a Friend

**Goal:** Send 5 USDC to your friend John.

**Prerequisites:**
- Your friend's wallet address or @username
- At least 5 USDC in your wallet
- Authentication (completed earlier)

**Step-by-step:**

**Step 1: Verify you have enough**
```
/balance
```
Look for USDC balance ≥ 5

**Step 2: Get recipient's address**
Ask your friend for:
- Their @username (if registered), OR
- Their wallet address (0x... format)

Example:
- Username: `@john`
- Address: `0x1111111111111111111111111111111111111111`

**Step 3: Send the transfer**

If sending to username:
```
/send @john 5 USDC
```

If sending to wallet address:
```
/send 0x1111111111111111111111111111111111111111 5 USDC
```

**Step 4: Confirm**
Bot asks for confirmation:
```
Confirm sending 5 USDC to @john?
[✅ Confirm] [❌ Cancel]
```

Click Confirm.

**Step 5: Wait for completion**
```
⏳ Processing transfer...
```

After a few seconds:
```
✅ Transfer completed!

Recipient: @john
Amount: 5 USDC
Your new balance: 95 USDC
Transaction hash: 0x5678...
```

**Step 6: Verify in activity**
```
/activity
```

You should see your transfer listed:
```
📤 5 USDC → @john
   Status: ✅ Completed
   Time: Today 3:45 PM
   Hash: 0x5678...
```

### What Can Go Wrong?

| Error | Cause | Solution |
|-------|-------|----------|
| "Insufficient balance" | You don't have enough USDC | Add more funds or reduce amount |
| "Invalid address" | Wallet format is wrong | Check wallet starts with 0x and is 42 chars |
| "User not found" | @username doesn't exist | Use wallet address instead |
| "Session expired" | Your login expired | Run `/login` again |

### Tips for Safe Transfers

✅ **DO:**
- Double-check recipient address before sending
- Use small amount for first transfer
- Verify recipient receives the funds
- Keep transaction hash for records

❌ **DON'T:**
- Send to random addresses
- Copy-paste addresses from websites
- Share your wallet private key
- Send large amounts on first try

---

## Creating Your First Agent

### Scenario: Automated Daily Donation

**Goal:** Create an agent that sends 5 USDC to @charity every morning at 9am.

**Prerequisites:**
- Authentication completed
- At least 50 USDC in wallet (for first week)
- 15 minutes

**Step 1: Create the agent**
```
/agent-create "Send 5 USDC to @charity daily at 9am"
```

**Expected response:**
```
🤖 Agent created successfully!

Agent ID: trader-abc123
Type: trader
Status: Active ✅
Schedule: Daily at 09:00 AM
Next execution: Tomorrow at 09:00 AM
```

**Step 2: Create a spending session**

Now the agent needs authorization to spend your money.

```
/session-create --agent trader-abc123 --max 10 --ttl 7d
```

This creates:
- Max 10 USDC per transaction (enough for 2 days)
- Valid for 7 days

**Expected response:**
```
💳 Spending session created!

Session ID: sess-xyz789
Agent: trader-abc123
Limit: 10 USDC per transaction
Duration: 7 days
Status: ⏳ Pending Approval

👉 Open the Kite Passport app on your phone and approve this session.
```

**Step 3: Approve on your phone**

1. Look for notification on your phone
2. Open Kite Passport app
3. Find the pending session approval
4. Use your fingerprint or passkey to approve
5. Wait for confirmation

**Expected response (after approval):**
```
✅ Session approved!

Session ID: sess-xyz789
Status: Active 🟢
Remaining limit: 10 USDC
Expires: 7 days from now

Your agent can now spend up to 10 USDC per transaction.
```

**Step 4: Verify your agent is running**
```
/agent-list
```

You should see:
```
🤖 Your Agents

1. trader-abc123
   Type: trader
   Status: Active ✅
   Session: sess-xyz789 (Active 🟢)
   Created: Today
```

**Step 5: Check agent logs**

After agent runs (tomorrow at 9am):
```
/agent-logs trader-abc123
```

You'll see:
```
📝 Agent Execution Logs

✅ 2024-01-16 09:00 - Sent 5 USDC to @charity
   Status: Completed
   Hash: 0x9abc...

✅ 2024-01-15 09:00 - Sent 5 USDC to @charity
   Status: Completed
   Hash: 0x8xyz...
```

### What if you want to stop?

```
/agent-stop trader-abc123
```

Agent pauses. You can restart anytime with:
```
/agent-start trader-abc123
```

### What if you want to delete?

```
/agent-delete trader-abc123
```

⚠️ This cannot be undone!

---

## Using Paid Services

### Scenario: Generate an Image with AI

**Goal:** Use an image generation service (DALL-E) to create an image, paying with USDC.

**Prerequisites:**
- Authentication completed
- At least 5 USDC for service calls
- 20 minutes

**Step 1: Discover available services**
```
/discover
```

You'll see many services. Look for image generation:
```
🎨 Image Generation Services

• DALL-E v3 - $0.02 per image
• Midjourney - $0.10 per image
• Stable Diffusion - $0.01 per image
```

**Step 2: Search for image services**
```
/discover search "image generation"
```

**Expected output:**
```
🎨 Image Generation Services

1. DALL-E v3
   Provider: OpenAI
   Price: $0.02 per image
   Status: Available ✅
   
2. Stable Diffusion
   Provider: Replicate
   Price: $0.01 per image
   Status: Available ✅
```

**Step 3: Get service details**
```
/discover details dalle-v3
```

**Expected output:**
```
🎨 DALL-E v3

Description: Generate high-quality images from text descriptions
Provider: OpenAI
Price: $0.02 per image
Model: DALL-E 3
Image size: 1024x1024

Use cases:
• Social media graphics
• UI mockups
• Creative illustrations
• Product visualizations

Documentation: [link]
```

**Step 4: Create a spending session for the service**
```
/session-create --max 5 --ttl 1h
```

This allows you to:
- Spend up to $5 total
- For 1 hour
- Then session expires

**Expected response:**
```
💳 Spending session created!

Session ID: sess-service-001
Limit: $5.00 per transaction
Duration: 1 hour
Status: ⏳ Pending Approval

👉 Approve on your phone
```

**Step 5: Approve on phone**
- Open Kite Passport app
- Approve the session using your passkey
- Wait for confirmation

**Expected response:**
```
✅ Session approved!
Status: Active 🟢
Remaining: $5.00
Expires in: 1 hour
```

**Step 6: Use the service**

Tell the bot to generate an image:
```
Generate an image of a sunset over mountains with API dalle-v3
```

Or create an agent to do it:
```
/agent-create "Generate image of sunset every day"
```

**Expected output:**
```
⏳ Calling DALL-E v3...

🎨 Image generated!

Prompt: "sunset over mountains"
Status: ✅ Completed
Cost: $0.02
Your remaining budget: $4.98
```

**Step 7: Verify the charge**
```
/activity
```

You should see:
```
📤 $0.02 → DALL-E v3 (API call)
   Status: ✅ Completed
   Hash: 0xabc123...
```

---

## Shopping with Crypto

### Scenario: Buy a Programming Book

**Goal:** Purchase a book on Amazon and pay with USDC.

**Prerequisites:**
- Authentication completed
- At least $30 USDC in wallet
- 10 minutes

**Step 1: Search for products**
```
/shop search "programming book"
```

**Expected output:**
```
📚 Search Results

1. "Clean Code" by Robert Martin
   Price: $29.99
   Available: Yes ✅
   
2. "The Pragmatic Programmer"
   Price: $39.99
   Available: Yes ✅
   
3. "Design Patterns"
   Price: $49.99
   Available: Yes ✅
```

**Step 2: View product details**
```
/shop details product-12345
```

**Expected output:**
```
📚 Clean Code

Price: $29.99
Author: Robert Martin
Format: Paperback
Availability: In Stock ✅

Description:
A Handbook of Agile Software Craftsmanship...

[Add to Cart]
```

**Step 3: Add to cart**
```
/shop add product-12345
```

**Expected response:**
```
✅ Added to cart!

Item: Clean Code
Price: $29.99
Cart total: $29.99
```

**Step 4: Review cart**
```
/shop cart
```

**Expected output:**
```
🛒 Your Shopping Cart

1. Clean Code - $29.99
   Quantity: 1
   [Remove]

Cart Total: $29.99
Shipping: FREE
Tax: $0.00
TOTAL: $29.99

[Checkout]
```

**Step 5: Checkout**
```
/shop checkout --asset USDC
```

**Expected response:**
```
💳 Checkout

Total: $29.99 USDC
Payment method: USDC
Wallet: 0x1234...5678

[✅ Pay Now] [❌ Cancel]
```

**Step 6: Confirm payment**
Click "Pay Now"

**Expected output:**
```
⏳ Processing payment...

✅ Payment successful!

Order ID: ORDER-12345
Status: Confirmed
Items: 1
Total: $29.99 USDC
Estimated Delivery: 5-7 business days

Transaction Hash: 0x98765...
Tracking: [Amazon tracking link]
```

**Step 7: Verify the purchase**
```
/activity
```

You should see:
```
📤 $29.99 USDC → Amazon (Order ORDER-12345)
   Status: ✅ Completed
   Hash: 0x98765...
```

---

## Managing Spending Sessions

### Create Different Sessions for Different Purposes

**Scenario:** You have three agents and want different spending limits for each.

**Agent 1: Daily donation (low risk)**
```
/session-create --agent donor --max 10 --ttl 30d
```
- Max: 10 USDC per transaction
- Valid: 30 days

**Agent 2: Trading (medium risk)**
```
/session-create --agent trader --max 100 --ttl 7d
```
- Max: 100 USDC per transaction
- Valid: 7 days (requires frequent renewal)

**Agent 3: Service API calls (experimental)**
```
/session-create --agent api-caller --max 5 --ttl 1h
```
- Max: 5 USDC per transaction
- Valid: 1 hour (short duration to test)

### View All Sessions
```
/session-list
```

**Output:**
```
💳 Your Spending Sessions

Active Sessions:
1. sess-001 (donor)
   Limit: 10 USDC/tx
   Used: 20 USDC / 300 USDC total
   Expires: 30 days from now
   
2. sess-002 (trader)
   Limit: 100 USDC/tx
   Used: 50 USDC / 700 USDC total
   Expires: 6 days from now
   
3. sess-003 (api-caller)
   Limit: 5 USDC/tx
   Used: 2 USDC / 5 USDC total
   Expires: 45 minutes from now

Expired Sessions: 5
```

### Revoke a Session
```
/session-revoke sess-001
```

This immediately stops the agent from spending.

---

## Advanced Automation

### Scenario: Complex Automation with Conditions

**Goal:** Create an agent that monitors KITE price and buys when it drops below $10.

**Step 1: Create the agent**
```
/agent-create "Buy KITE when price falls below $10"
```

**Step 2: Create session**
```
/session-create --max 500 --ttl 30d
```

(Allows up to 500 USDC per purchase, for 30 days)

**Step 3: Approve on phone**

**Step 4: Agent starts monitoring**

Bot monitors price continuously. When KITE drops to $9.50:
```
🎯 Trigger detected!

KITE price fell below $10 ($9.50)
Agent is buying...

⏳ Executing purchase...

✅ Purchase complete!

Bought: 50 KITE tokens
Price: $9.50 per KITE
Total: $475 USDC
Time: 2024-01-16 14:23 PM

Transaction hash: 0xcdef...
```

**Step 5: Review logs**
```
/agent-logs
```

### Combining Multiple Services

**Scenario:** Agent generates images daily and posts them to social media.

```
/agent-create "Generate image daily and post to social media"
```

This creates a workflow:
1. Generate image (using DALL-E) - costs $0.02
2. Get social media credentials
3. Post image automatically
4. Log results

---

## Security Best Practices

### 1. Manage Your Sessions

✅ **DO:**
- Create new session for each agent
- Set reasonable spending limits
- Use short TTL (time to live) for testing
- Revoke sessions you don't use
- Review active sessions regularly

❌ **DON'T:**
- Keep unlimited sessions active
- Use same session for multiple purposes
- Set very high limits
- Leave test sessions active forever

**Check sessions:**
```
/session-list
```

**Revoke unused sessions:**
```
/session-revoke sess-old-123
```

### 2. Monitor Agent Activity

✅ **DO:**
- Check `/agent-logs` regularly
- Verify expected behavior in logs
- Stop agents that misbehave
- Review `/activity` for unexpected transactions

❌ **DON'T:**
- Ignore agent logs
- Leave high-risk agents unmonitored
- Ignore error messages
- Create agents and forget about them

**Check agent logs:**
```
/agent-logs trader-001 --last 50
```

**Check recent activity:**
```
/activity 20
```

### 3. Protect Your Account

✅ **DO:**
- Keep your JWT token secure
- Log out if using shared device
- Use strong email password
- Keep recovery email updated
- Review `/me` status regularly

❌ **DON'T:**
- Share your JWT token
- Leave authenticated sessions active
- Use weak passwords
- Share your wallet address with untrusted sources
- Confirm transfers without checking twice

**Log out:**
```
/logout
```

**Check status:**
```
/me
```

### 4. Handle Errors Safely

If something goes wrong:

1. **Check status first**
   ```
   /debug health
   ```

2. **Review recent activity**
   ```
   /activity 10
   ```

3. **Check agent logs**
   ```
   /agent-logs agent-id
   ```

4. **Stop suspicious agents**
   ```
   /agent-stop agent-id
   ```

5. **Revoke suspicious sessions**
   ```
   /session-revoke sess-id
   ```

6. **Get help**
   ```
   /help
   ```

---

## Troubleshooting Common Tasks

### "I accidentally sent to wrong address"
❌ Unfortunately, blockchain transactions cannot be reversed.

**Prevention:**
- Always verify address before confirming
- Test with small amount first
- Double-check recipient

### "My agent isn't executing"

**Diagnose:**
1. Check agent status: `/agent-list`
2. Check session: `/session-list`
3. Check logs: `/agent-logs agent-id`
4. Check balance: `/balance`

**Common causes:**
- Session expired → Create new session
- Balance too low → Add funds
- Agent stopped → Start with `/agent-start`

### "Session keeps expiring"

If your session expires too frequently:
1. Use longer TTL: `--ttl 7d` or `--ttl 30d`
2. Create permanent session for trusted agents
3. Set higher limit to reduce need for renewal

### "I forgot my password"

1. Email recovery is not yet available
2. Contact support with your user ID
3. Can create new account with different email

---

## Next Steps

- **New user?** Start with [GETTING_STARTED.md](GETTING_STARTED.md)
- **Need commands?** See [COMMANDS_REFERENCE.md](COMMANDS_REFERENCE.md)
- **Explore features?** Check [FEATURES_OVERVIEW.md](FEATURES_OVERVIEW.md)
- **Having problems?** Visit [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

**Happy automating!** 🚀
