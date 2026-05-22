# 🔧 Troubleshooting Guide

Common issues and solutions.

---

## Authentication Issues

### Issue: "Email not found" or "Invalid email format"

**Error message:**
```
❌ Email validation failed
Please provide a valid email address
Usage: /login user@example.com
```

**Possible causes:**
- Email address is misspelled
- Email format is invalid (missing @ or domain)
- Email contains spaces

**Solutions:**

1. **Check email format**
   - Must have: `name@domain.com`
   - No spaces allowed
   - Must include domain

2. **Verify spelling**
   - Re-read email carefully
   - Check for typos in domain
   - Examples of valid emails:
     - user@gmail.com ✅
     - john.doe@company.co.uk ✅
     - person+tag@example.com ✅

3. **Try again**
   ```
   /login your-correct@email.com
   ```

**Still not working?**
- Contact support with your email
- May need manual account creation

---

### Issue: "Verification code not received"

**Error message:**
```
⏳ Waiting for verification code...
(Not received email after 2 minutes?)
```

**Possible causes:**
- Email went to spam folder
- Email server delay
- Typo in email address
- Firewall/ISP filtering

**Solutions:**

1. **Check spam/junk folder**
   - Check email spam folder
   - Check email promotions folder
   - Look for email from noreply@kitepassport.com

2. **Check email address was correct**
   ```
   /login your@email.com
   ```
   Verify in the confirmation message

3. **Wait longer**
   - Usually arrives within 1-2 seconds
   - Sometimes takes up to 30 seconds
   - Code is valid for 10 minutes

4. **Try resending**
   ```
   /login your@email.com
   ```
   Send command again to get new code

5. **Whitelist sender** (if email provider allows)
   - Add noreply@kitepassport.com to contacts
   - Mark previous emails as "not spam"
   - Try again

**Still not receiving?**
- Try different email address
- Contact support with original email

---

### Issue: "Verification code expired"

**Error message:**
```
❌ Verification code expired
Your code is only valid for 10 minutes
Please run /login again to get a new code
```

**Possible causes:**
- More than 10 minutes passed since code was sent
- Code was entered incorrectly and retries exhausted
- Session timeout

**Solutions:**

1. **Get new code**
   ```
   /login your@email.com
   ```

2. **Enter code quickly**
   - Verification codes valid for 10 minutes
   - Check email immediately after running /login
   - Don't delay entering the code

3. **Copy-paste correctly**
   - Codes are case-insensitive (ABC or abc)
   - Codes are 6-8 characters
   - Don't include spaces
   - Example: `ABC123XY` (not `A BC 123 XY`)

**Workaround:**
- Use `/signup` instead to create new account
- Choose different email if signup

---

### Issue: "Session expired" or "Authentication required"

**Error message:**
```
❌ Your session has expired
Please run /login to authenticate
```

**Possible causes:**
- More than 24 hours since last login
- Bot was restarted
- Session token became invalid

**Solutions:**

1. **Log in again**
   ```
   /login your@email.com
   ```

2. **Or sign up with new account**
   ```
   /signup your@email.com
   ```

3. **Prevent expiration**
   - Sessions valid for 24 hours
   - Each command refreshes session
   - Use bot at least once per 24h to stay logged in

---

## Wallet & Balance Issues

### Issue: "Insufficient balance"

**Error message:**
```
❌ Transaction failed: Insufficient balance
You have: 5 USDC
Requested: 10 USDC
```

**Possible causes:**
- Wallet balance is too low
- Transfer amount is higher than available
- Balance decreased since last check

**Solutions:**

1. **Check current balance**
   ```
   /balance
   ```

2. **Add funds**
   - Ask someone to send you tokens
   - Use `/faucet` on testnet for test tokens
   - Deposit from external wallet

3. **Reduce transfer amount**
   - Send smaller amount
   - Split transfer into multiple transactions

4. **Wait for confirmation**
   - Recent transactions might still be pending
   - Check `/activity` to see pending status
   - Balance updates when transaction confirms

**Example:**
```
You have 5 USDC
Want to send 10 USDC

Option 1: Send 5 USDC instead
/send @user 5 USDC

Option 2: Add 5 more USDC first
Then retry: /send @user 10 USDC
```

---

### Issue: "Wallet not found" or "Balance unavailable"

**Error message:**
```
❌ Wallet service unavailable
Please try again in a few moments
```

**Possible causes:**
- Wallet service is down
- Network connection issue
- Authentication problem

**Solutions:**

1. **Check authentication**
   ```
   /me
   ```
   If shows "not authenticated", run:
   ```
   /login your@email.com
   ```

2. **Check system health**
   ```
   /debug health
   ```
   Look for wallet service status

3. **Wait and retry**
   - Try command again in 30 seconds
   - Service issues usually resolve quickly

4. **Check internet connection**
   - Verify you have internet
   - Try sending simple message: `/status`

---

### Issue: "Invalid recipient address"

**Error message:**
```
❌ Invalid recipient wallet address
Expected format: 0x + 40 hexadecimal characters
You provided: 0x123...
```

**Possible causes:**
- Wallet address format is incorrect
- Address is incomplete or truncated
- Wrong blockchain format (e.g., Bitcoin address)

**Solutions:**

1. **Get correct address format**
   - Must start with `0x`
   - Must be exactly 42 characters total
   - Must contain only 0-9 and a-f characters
   - Example: `0x1234567890abcdef1234567890abcdef12345678`

2. **Verify address**
   - Ask recipient for full address
   - Don't truncate or edit address
   - Copy-paste directly from source

3. **Use @username instead**
   - If recipient has registered username:
   ```
   /send @john 5 USDC
   ```

4. **Double-check before sending**
   - First 6 and last 6 characters correct
   - Total length is 42 characters
   - Contains only valid hex characters

**Valid formats:**
```
✅ 0x1234567890123456789012345678901234567890
✅ @john
✅ @charity.eth

❌ 1234567890123456789012345678901234567890 (missing 0x)
❌ 0x123456789012345678901234567890123456 (too short)
❌ 0xGGHHIIJJ... (contains invalid characters)
```

---

## Transfer & Payment Issues

### Issue: "Transfer failed" or "Transaction rejected"

**Error message:**
```
❌ Transfer failed
Transaction rejected by blockchain
Reason: [reason code]
```

**Possible causes:**
- Insufficient balance
- Invalid recipient
- Network congestion
- Temporary service issue

**Solutions:**

1. **Check what went wrong**
   ```
   /activity
   ```
   Look for transaction with "failed" status

2. **Verify details**
   - Recipient address is correct
   - Amount is reasonable
   - You have enough balance

3. **Try again**
   - Try same transfer in a minute
   - Network might be congested

4. **Check system status**
   ```
   /debug health
   ```

5. **Use smaller amount**
   - Large transfers sometimes fail
   - Try with smaller amount first

---

### Issue: "Transfer appears to hang"

**Problem:**
```
⏳ Processing transfer...
(Still waiting after 5 minutes?)
```

**Possible causes:**
- Network congestion
- Blockchain processing delay
- Bot connection issue

**Solutions:**

1. **Wait longer**
   - Transfers can take 1-5 minutes
   - Blockchain is sometimes slow
   - Don't cancel immediately

2. **Check status**
   ```
   /activity
   ```
   Look for transaction status

3. **Use /cancel if needed**
   ```
   /cancel
   ```
   Cancels the current operation (if possible)

4. **Wait and retry if failed**
   - If transaction failed after long wait
   - Try sending again
   - Use smaller amount

**Note:** Once on blockchain, transactions cannot be cancelled

---

## Agent & Automation Issues

### Issue: "Agent not executing"

**Problem:**
```
🤖 Agent shows as Active
But no execution happening
```

**Possible causes:**
- Session expired
- Balance is too low
- Agent is paused
- Spending limit reached

**Diagnose:**

1. **Check agent status**
   ```
   /agent-list
   ```
   Look for status (Active/Stopped/Error)

2. **Check associated session**
   ```
   /session-list
   ```
   Find session for this agent
   - Status should be "Active"
   - Should not be "Expired"

3. **Check remaining balance**
   ```
   /balance
   ```
   Agent needs funds to spend

4. **Check if agent is paused**
   ```
   /agent-list
   ```
   Look for "Stopped" status

5. **Check recent logs**
   ```
   /agent-logs agent-id --last 20
   ```
   Look for errors

**Solutions by cause:**

**Session expired:**
```
/session-create --agent agent-id --max 100 --ttl 30d
# Then approve on phone
```

**Balance too low:**
```
/balance
# Get more USDC/KITE from someone
# Or use /faucet on testnet
```

**Agent stopped:**
```
/agent-start agent-id
```

**Spending limit reached:**
```
/session-revoke old-session-id
# Create new session with higher limit
/session-create --agent agent-id --max 200 --ttl 30d
```

---

### Issue: "Session creation failing"

**Error message:**
```
❌ Failed to create session
Error: [error details]
```

**Possible causes:**
- No authenticated agent
- Blockchain connection issue
- Invalid parameters

**Solutions:**

1. **Ensure agent exists**
   ```
   /agent-list
   ```
   If not listed, create agent first:
   ```
   /agent-register trader
   ```

2. **Verify parameters**
   ```
   /session-create --agent trader-001 --max 100 --ttl 24h
   ```
   - `--max` must be positive number
   - `--ttl` must be valid (1h, 24h, 7d, 30d)
   - `--agent` must be valid agent ID

3. **Try again**
   Sometimes temporary service issue:
   ```
   /session-create --agent trader-001 --max 100 --ttl 24h
   ```

4. **Check system health**
   ```
   /debug health
   ```

---

### Issue: "Agent logs showing errors"

**Example error log:**
```
❌ 2024-01-16 14:23 - Failed to send USDC
   Error: Insufficient balance
   Amount requested: 50 USDC
   Available: 20 USDC
```

**Possible causes:**
- Balance too low
- Session expired
- Invalid recipient
- Network issue

**Solutions based on error:**

**"Insufficient balance"**
- Add more funds to wallet
- Reduce transfer amount
- Wait for pending deposits

**"Session expired"**
- Create new session
- Use longer TTL next time

**"Invalid recipient"**
- Check recipient address format
- Verify @username exists
- Use correct blockchain address

**"Network error"**
- These are temporary
- Agent will retry automatically
- Check again in a few minutes

---

## Discovery & Services Issues

### Issue: "No services found"

**Error message:**
```
❌ No services matching: weather
Try: /discover search "weather api"
```

**Possible causes:**
- Service is offline
- Typo in search term
- Service not available in your region

**Solutions:**

1. **Try different search term**
   ```
   /discover search "weather"
   ```
   Instead of:
   ```
   /discover search "temperature"
   ```

2. **Browse all services**
   ```
   /discover
   ```
   Look at complete list

3. **Try partial name**
   ```
   /discover search "weather"
   Instead of "weather forecast api v3"
   ```

4. **Check status**
   ```
   /debug health
   ```

---

### Issue: "Cannot create session for service"

**Error message:**
```
❌ Failed to create service session
Service not available
```

**Possible causes:**
- Service is temporarily offline
- You don't have access
- Service requires special setup

**Solutions:**

1. **Try different service**
   ```
   /discover search "alternative"
   ```

2. **Check service status**
   ```
   /discover details service-id
   ```
   Look for availability status

3. **Contact support**
   - If specific service needed
   - Provide service ID

---

## Shopping Issues

### Issue: "Product not found"

**Error message:**
```
❌ Product not found
Try searching with different keywords
```

**Solutions:**

1. **Try different search term**
   ```
   /shop search "laptop computer"
   Instead of /shop search "computer"
   ```

2. **Browse categories**
   ```
   /shop browse electronics
   ```

3. **Check product ID format**
   - Product ID must be valid
   - Ask for product ID from someone if needed

---

### Issue: "Checkout failing"

**Error message:**
```
❌ Checkout failed
Session expired or insufficient balance
```

**Solutions:**

1. **Check balance**
   ```
   /balance
   ```
   Ensure you have enough USDC

2. **Check session**
   ```
   /session-list
   ```
   Session must be active

3. **Create session if needed**
   ```
   /session-create --max 100 --ttl 1h
   # Approve on phone
   # Then try checkout again
   ```

4. **Reduce cart total**
   ```
   /shop cart
   # Remove expensive items
   # Try checkout again
   ```

---

## General Issues

### Issue: "Unknown command" or "Command not recognized"

**Error message:**
```
❌ Unknown command: /send_tokens
Use /help for available commands
```

**Possible causes:**
- Typo in command name
- Command doesn't exist
- Syntax error

**Solutions:**

1. **Check command name**
   ```
   /help commands
   ```
   See all available commands

2. **Verify spelling**
   ```
   /send (correct)
   /send_tokens (incorrect - underscore instead of space)
   ```

3. **Check syntax**
   ```
   /send @user 5 USDC (correct)
   /send user 5 (incorrect - missing @ and asset)
   ```

4. **Get help**
   ```
   /help send
   For help on send command
   ```

---

### Issue: "Timeout" or "Command taking too long"

**Problem:**
```
⏳ Processing...
(Still waiting after 2 minutes?)
```

**Possible causes:**
- Network is slow
- Service is overloaded
- Bot connection issue

**Solutions:**

1. **Wait longer**
   - Some operations take 1-2 minutes
   - Don't cancel immediately

2. **Try again**
   - If timeout persists
   - Run command again

3. **Try simpler command**
   ```
   /status
   To check if bot is responsive
   ```

4. **Check internet**
   - Verify connection is stable
   - Try on different network if possible

---

### Issue: "Bot not responding"

**Problem:**
- Sent messages but no response
- Bot appears offline

**Solutions:**

1. **Wait a bit**
   - Bot might be temporarily slow
   - Wait 30 seconds and try again

2. **Send simple command**
   ```
   /help
   To verify bot is responsive
   ```

3. **Check internet connection**
   - Verify Telegram is working
   - Try sending message to another bot

4. **Restart Telegram**
   - Close Telegram app completely
   - Reopen and try again

5. **Report issue**
   - If persistently offline
   - Contact support

---

## Getting Help

### Quick Help
```
/help
/help commands
```

### Detailed Help by Topic
```
/help transfers
/help agents
/help sessions
/help services
```

### Check System Status
```
/debug health
```

### View Recent Activity
```
/activity 20
```

### View Agent Logs
```
/agent-logs agent-id
```

### Emergency Support
If system appears broken:
1. Try `/debug health`
2. Check `/activity` for recent issues
3. Note error messages exactly
4. Contact support with:
   - Error message
   - Command you ran
   - Your user ID (`/me`)
   - When the issue occurred

---

## FAQ

**Q: Can I undo a transfer?**
A: No, blockchain transactions cannot be reversed. Always verify recipient before sending.

**Q: How long do transfers take?**
A: Usually 1-5 seconds, sometimes up to 1-2 minutes if network is congested.

**Q: What if I send to wrong address?**
A: Once on blockchain, transfers cannot be reversed. Contact recipient if you have their contact.

**Q: Can I use the same session for multiple agents?**
A: Yes, but recommended to create separate sessions for different agents for better security.

**Q: What happens if my session expires?**
A: Agent stops executing. You can create a new session to resume operations.

**Q: How do I report a bug?**
A: Contact support with exact error message and steps to reproduce.

**Q: Is my money safe?**
A: Your wallet is protected by your passkey. Spending limits prevent unauthorized transactions.

**Q: Can I have multiple agents?**
A: Yes, you can create multiple agents with different purposes.

**Q: What's the maximum I can send?**
A: Depends on your session limit and wallet balance. Start with smaller sessions and increase as needed.

---

## Still Need Help?

- **[GETTING_STARTED.md](GETTING_STARTED.md)** — New to KiteRelay?
- **[COMMANDS_REFERENCE.md](COMMANDS_REFERENCE.md)** — Command reference
- **[USER_GUIDE.md](USER_GUIDE.md)** — Step-by-step tutorials
- **[FEATURES_OVERVIEW.md](FEATURES_OVERVIEW.md)** — Feature details

Use `/help` in Telegram anytime for quick assistance!
