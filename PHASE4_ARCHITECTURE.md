# Phase 4 Integration Architecture

## Safety Checks Pipeline

All economic actions flow through this validation pipeline:

```
User Input (e.g., /send, /pay)
    ↓
[1] Intent Resolution (fast-path)
    ↓
[2] Command Handler (commandGateway.ts)
    ↓
[3] Authentication Check
    ├─ If not logged in → /login prompt (authenticateUser)
    └─ If logged in → Continue
    ↓
[4] Rate Limit Check (rateLimitService.ts)
    ├─ Get current action count for this period
    ├─ Compare against limit for this action type
    ├─ If exceeded → Return error with reset time
    └─ If allowed → Increment counter, continue
    ↓
[5] Budget Check (budgetService.ts)
    ├─ Calculate remaining daily/weekly/monthly
    ├─ Compare requested amount against all 3 periods
    ├─ If any exceeded → Return error with period details
    └─ If allowed → Continue
    ↓
[6] Confirmation Prompt (confirmationService.ts)
    ├─ Check if amount exceeds threshold
    ├─ If threshold exceeded:
    │   ├─ Generate 6-digit code
    │   ├─ Store challenge with 10-min TTL
    │   ├─ Prompt user with /verify command
    │   └─ Wait for user verification (or timeout)
    └─ If confirmed or below threshold → Continue
    ↓
[7] Skill Execution (walletSend/x402Execute/etc)
    ├─ Perform final pre-execution checks (balance, session, etc)
    ├─ Execute kpass command
    └─ Capture txHash and metadata
    ↓
[8] Post-Execution (on success)
    ├─ Record transaction (type, amount, status=completed)
    ├─ Deduct from budget (daily/weekly/monthly)
    ├─ Log telemetry
    └─ Format response
    ↓
[9] Response to User
    └─ Success/failure message with next steps
```

---

## Service Interaction Matrix

```
                    walletSend  x402Execute  requestSession  manageAgents
confirmationService    ✅           ✅            (future)       (future)
rateLimitService       ✅           ✅            (future)       (future)
budgetService          ✅           ✅            (future)        -
transactionHistoryService ✅        ✅            (future)       (future)
errorResponseService   ✅           ✅             ✅             ✅
```

---

## Data Flow for Transfer Action

### Step 1: User Input
```
User: /send 0x123456... 50 USDC
```

### Step 2: Rate Limit Check
```
rateLimitService.checkRateLimit(userId, "wallet.send")
  → Fetch profile.rateLimitRecords
  → Find record for "wallet.send"
  → Check window: now() is within window? 
    ✅ Yes: count++ (count=9, limit=10)
    ✅ Return { allowed: true, remaining: 1 }
```

### Step 3: Budget Check
```
budgetService.checkBudget(userId, 50, "USDC")
  → Fetch profile.budgets (daily, weekly, monthly)
  → Daily: $450 spent, $50 remaining → Would exceed
  → Return { allowed: false, error: "Daily budget exceeded..." }
  ❌ User sees error, action blocked
```

OR if budget allows:

### Step 4: Confirmation Check
```
confirmationService.requiresConfirmation("transfer", 50)
  → Check threshold: transfer = $50
  → amount (50) >= threshold (50)? → Yes
  ✅ Confirmation required
  
confirmationService.createConfirmationChallenge(...)
  → Generate code: 123456
  → Create challenge: {
      id: "confirm_2114747878_1716...",
      code: "123456",
      expiresAt: now + 10min,
      attempts: 0,
      maxAttempts: 3
    }
  → Store in profile.pendingConfirmations
  → Return challenge
  
formatConfirmationPrompt(challenge)
  → Create markdown message with code
  
User sees: "Enter: /verify 123456"
```

### Step 5: User Verification
```
User: /verify 123456

confirmationService.verifyConfirmationCode(userId, challengeId, "123456")
  → Find challenge in profile.pendingConfirmations
  → Check expiration: ok ✅
  → Check attempts: 0 < 3 ✅
  → Verify code: "123456" === "123456" ✅
  → Remove challenge from profile
  → Return { valid: true, challenge }
```

### Step 6: Execution
```
walletSendSkill({userId, toAddress: "0x123...", amount: "50", asset: "USDC"})
  → (All checks pass at this point)
  
transactionHistoryService.recordTransaction(...)
  → Create tx: { type: "transfer", status: "pending", amount: 50, ... }
  → Store in profile.transactions
  
executeKpass(userId, ["wallet", "send", "--to", "0x123...", "--amount", "50", ...])
  → Call kpass binary
  → Get txHash: "0xabcd..."
  
transactionHistoryService.updateTransactionStatus(..., "completed", {txHash})
  → Update tx status from "pending" to "completed"

budgetService.deductFromBudget(userId, 50)
  → Fetch profile.budgets
  → daily.spent += 50 (now $500)
  → weekly.spent += 50 (now $1950)
  → monthly.spent += 50 (now $7950)
  → Save profile
```

### Step 7: Response
```
Bot: ✅ Sent 50 USDC to 0x123456...
     Transaction: 0xabcd...
     
     Daily budget: $500/$500 (100% used)
     Reset in: 8 hours
```

---

## Error Scenarios

### Scenario A: Authentication Missing

```
User: /send 0x123... 50 USDC
  → NOT logged in
  
walletSendSkill checks profile.identity.passportId
  → NOT found
  → exitCode: AUTH_ERROR
  
errorResponseService.formatErrorMessage(AUTH_REQUIRED)
  → Recovery: /login, /signup
  → Suggestions: Use /help for guide
  
Bot: ❌ You must be logged in
     Try: /login first
```

### Scenario B: Rate Limit Exceeded

```
User: /send 0x999... 10 USDC (11th transfer this hour)
  
rateLimitService.checkRateLimit(...)
  → count=10, limit=10
  → return { allowed: false, resetIn: 3300000ms (55min) }
  
exitCode: RATE_LIMITED

Bot: ❌ Rate limit exceeded for transfers
     Remaining: 0 actions
     Reset in: 55 minutes
```

### Scenario C: Budget Exceeded

```
User: /send 0xabc... 100 USDC (would exceed $500 daily)
  
budgetService.checkBudget(userId, 100)
  → daily.spent=450, limit=500
  → 450 + 100 > 500 → false
  → return {allowed: false, remaining: 50}
  
exitCode: USAGE_ERROR

Bot: ❌ Daily budget exceeded
     Limit: $500/day
     Spent: $450
     Remaining: $50
     Reset: Tomorrow 00:00 UTC
```

### Scenario D: Insufficient Balance

```
(After confirmation succeeds, during execution)

User: /send 0xdef... 100 USDC (only has 50)
  
walletSendSkill calls:
  → executeKpass balance check
  → balance=50 < requested=100
  → return { success: false, exitCode: USAGE_ERROR }
  
transactionHistoryService.updateTransactionStatus(..., "failed", {error: "..."})
  
exitCode: USAGE_ERROR

Bot: ❌ Insufficient balance
     Have: 50 USDC
     Need: 100 USDC
```

---

## State Persistence

### User Profile Structure

```typescript
UserProfile {
  // Existing fields
  identity: { passportId, ... }
  
  // Phase 4 additions
  pendingConfirmations: [
    {
      id: "confirm_...",
      code: "123456",
      action: "transfer",
      amount: 50,
      expiresAt: 1716... + 10min,
      attempts: 0,
      maxAttempts: 3
    }
  ]
  
  rateLimitRecords: [
    {
      action: "wallet.send",
      count: 9,
      window: "hour",
      windowStart: 1716...,
      lastAttempt: 1716...
    }
  ]
  
  budgets: {
    daily: {
      limit: 500,
      spent: 450,
      periodStart: 1716...,
      periodEnd: 1716...,
      lastUpdated: 1716...
    }
  }
  
  transactions: [
    {
      id: "tx_2114747878_1716...",
      type: "transfer",
      amount: 50,
      currency: "USDC",
      recipient: "0x123...",
      status: "completed",
      txHash: "0xabcd...",
      timestamp: 1716...
    }
  ]
}
```

### Auto-Cleanup Policies

```
Type                  Trigger              Age          Action
──────────────────────────────────────────────────────────────
Confirmations         On verification      10 min       Remove
Confirmations (expired) On next action     10 min       Remove
Rate limit records    On new action        After window Remove
Rate limit records    On cleanup call      After window Remove
Transactions          Cleanup job          90 days      Remove (keep pending)
Budgets               Period boundary      On reset     Initialize new
```

---

## Concurrency & Safety

### Race Condition: Multiple Rate Limit Checks

**Problem**: User sends 2 transfers simultaneously, both see count=9

**Solution**: 
- Profile lock during RateLimit check (implicit via storage write)
- Check always increments atomically
- Worst case: 1 extra action allowed (acceptable trade-off)

### Race Condition: Budget Deduction

**Problem**: Two actions decrement budget simultaneously

**Solution**:
- Budget checks happen before execution (conservative)
- Deduction happens after success (idempotent)
- Profile write is atomic

### Data Consistency

- All state changes go through storage.writeUserProfile()
- Profile is entire unit (ACID-like semantics)
- No partial writes

---

## Telemetry Logging

### Log Events

```
Event: Rate limit check
{
  userId: 2114747878,
  action: "wallet.send",
  count: 9,
  limit: 10,
  remaining: 1,
  severity: "debug"
}

Event: Budget exceeded
{
  userId: 2114747878,
  action: "transfer",
  amount: 100,
  budget: "daily",
  limit: 500,
  spent: 450,
  severity: "warn"
}

Event: Confirmation created
{
  userId: 2114747878,
  challengeId: "confirm_...",
  action: "transfer",
  amount: 50,
  expiresAt: 1716... + 10min,
  severity: "info"
}

Event: Transaction recorded
{
  userId: 2114747878,
  txId: "tx_...",
  type: "transfer",
  amount: 50,
  status: "pending",
  severity: "info"
}

Event: Skill execution succeeded
{
  userId: 2114747878,
  skill: "walletSend",
  durationMs: 1240,
  txHash: "0xabcd...",
  severity: "info"
}
```

---

## Performance Characteristics

```
Operation                    Time      Blocking?   Note
─────────────────────────────────────────────────────────
Rate limit check             ~10ms     Yes         Profile read/write
Budget check                 ~10ms     Yes         3 period calculations
Confirmation creation        ~5ms      Yes         In-memory code gen
Confirmation verification    ~8ms      Yes         Profile read/write
Transaction record           ~15ms     Yes         Array append
Transaction update           ~12ms     Yes         Profile read/write
Total pre-execution          ~50ms     Yes         For high-value action
```

**Optimization**: Parallel checks where possible (not critical path)

---

## Testing Strategy

### Unit Tests

```
confirmationService:
  - Test code generation (uniqueness, format)
  - Test TTL expiration
  - Test attempt limit
  - Test threshold calculation

rateLimitService:
  - Test window management
  - Test per-action limits
  - Test period reset
  - Test cleanup

budgetService:
  - Test period boundaries
  - Test multi-period enforcement
  - Test deduction accuracy
  - Test limit updates

transactionHistoryService:
  - Test record creation
  - Test status updates
  - Test filtering
  - Test stats aggregation
  - Test cleanup

errorResponseService:
  - Test error code mapping
  - Test message formatting
  - Test recovery step generation
```

### Integration Tests

```
confirmationService + walletSend:
  - High-value transfer requires confirmation
  - Correct code succeeds
  - Wrong code fails (3 attempts)
  - Expired code fails

rateLimitService + all skills:
  - N-th action at limit succeeds
  - N+1-th action fails
  - Reset clears counter

budgetService + walletSend + x402Execute:
  - Multiple actions share budget
  - Period reset works correctly
  - Deduction affects next check

errorResponseService + skill errors:
  - Auth errors formatted correctly
  - Budget errors have recovery
  - Rate limit errors show reset time
```

### End-to-End Tests

```
1. Full transfer flow
   signup → auth → /send → confirm → success

2. Rate limit enforcement
   10 transfers in <1sec → 11th fails → wait → 11th succeeds

3. Budget window overlap
   Monday: daily+weekly budgets
   Friday: daily+monthly budgets
   Both enforced correctly

4. Transaction history
   Multiple action types recorded
   Filtering by type/status/date works
   Stats accurate
   Old records cleaned up
```

---

## Deployment Guide

### Pre-Deployment

1. Backup all user profiles in `data/users/*/`
2. Run syntax check on all new files
3. Review integration points in skills
4. Verify imports resolve correctly

### Deployment Steps

1. Copy Phase 4 service files to src/
2. Update skill imports (walletSend, x402Execute)
3. Verify no TypeScript errors
4. Deploy bot
5. Test with test user (low amounts)
6. Monitor logs for errors
7. Enable confirmation prompts in production

### Post-Deployment

1. Monitor rate limit violations
2. Track budget enforcement
3. Review transaction history accuracy
4. Collect user feedback on confirmation UX
5. Adjust thresholds based on data

---

## Success Metrics

- ✅ All rate limits enforced (0 violations after limit)
- ✅ Budget blocks at threshold (100% enforcement)
- ✅ Confirmations required for high-value (>80% require code)
- ✅ Transaction history complete (100% of actions recorded)
- ✅ Error messages helpful (50%+ follow recovery steps)
- ✅ No false positives (rate limit/budget accuracy >99%)

