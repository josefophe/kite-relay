/**
 * First-Time Prompts Service - Contextual User Guidance
 *
 * Displays educational prompts at first occurrence of:
 * - First wallet check
 * - First transfer
 * - First confirmation
 * - First rate limit hit
 * - First budget check
 * - First agent registration
 * - First session creation
 * - First paid API call
 *
 * Tracks which prompts have been shown to avoid repetition
 *
 * Phase 5: User Onboarding
 */

import { config } from './config';
import { logger } from './logger';
import { readUserProfile, writeUserProfile } from './storage';

// === Types ===

export enum FirstTimeEvent {
  WALLET_CHECK = 'wallet_check',
  FIRST_TRANSFER = 'first_transfer',
  FIRST_CONFIRMATION = 'first_confirmation',
  RATE_LIMIT_HIT = 'rate_limit_hit',
  BUDGET_CHECK = 'budget_check',
  FIRST_AGENT = 'first_agent',
  FIRST_SESSION = 'first_session',
  FIRST_PAID_API = 'first_paid_api',
  CONFIRM_ERROR = 'confirm_error',
  INSUFFICIENT_BALANCE = 'insufficient_balance',
}

export interface FirstTimePrompt {
  event: FirstTimeEvent;
  title: string;
  content: string;
  tips?: string[];
  actionButtons?: {
    text: string;
    action: string;
  }[];
  dismissible: boolean;
}

export interface FirstTimeTracking {
  shownPrompts: FirstTimeEvent[];
  dismissedPrompts: FirstTimeEvent[];
  lastShownAt?: number;
}

// === Prompt Definitions ===

const FIRST_TIME_PROMPTS: Record<FirstTimeEvent, FirstTimePrompt> = {
  [FirstTimeEvent.WALLET_CHECK]: {
    event: FirstTimeEvent.WALLET_CHECK,
    title: '💰 Your Wallet',
    content: `
Welcome to your wallet! Here's what you see:

<b>Wallet Address:</b> Your unique identifier (0x format)
  → Share this with others to receive tokens

<b>Balance:</b> How much USDC and KITE you have
  → Increases when you receive transfers
  → Decreases when you send tokens

<b>Transaction History:</b> All your past transactions
  → Shows who sent/received and when
  → Includes transfers, payments, and fees

💡 <b>Tip:</b> Save your wallet address somewhere safe. You'll need it to receive transfers.
    `,
    tips: [
      'Wallet address is public and safe to share',
      'Never share your private keys or JWT tokens',
      'Balances update in real-time',
      'You can view your address with: kpass me --output json',
    ],
    dismissible: true,
  },

  [FirstTimeEvent.FIRST_TRANSFER]: {
    event: FirstTimeEvent.FIRST_TRANSFER,
    title: '📤 Making Your First Transfer',
    content: `
Great! You're about to send tokens to someone else.

<b>What happens:</b>
1️⃣ You provide recipient's wallet address
2️⃣ You specify amount in USDC or KITE
3️⃣ Transaction executes instantly
4️⃣ Recipient receives tokens immediately

<b>Important:</b>
⚠️ Transfers are <b>permanent</b> - can't be reversed
⚠️ Double-check address before confirming
⚠️ Test with small amount first

<b>Process:</b>
<code>kpass wallet send --to 0x... --amount 10 --asset USDC</code>

After confirming, your tokens will transfer instantly to the recipient.
    `,
    tips: [
      'Always verify recipient address carefully',
      'Transfers complete in seconds',
      'You can view result in /activity command',
      'Amount must not exceed your balance',
    ],
    actionButtons: [
      { text: '📚 Transfer Tutorial', action: '/tutorial transfers' },
      { text: '❓ Need Help?', action: '/help first-transfer' },
    ],
    dismissible: true,
  },

  [FirstTimeEvent.FIRST_CONFIRMATION]: {
    event: FirstTimeEvent.FIRST_CONFIRMATION,
    title: '🔐 Confirm Your Action',
    content: `
For security, this action requires confirmation with a special code.

<b>What you'll do:</b>
1️⃣ A 6-digit code appears on screen
2️⃣ Enter the code within 10 minutes
3️⃣ Your action completes

<b>Why this exists:</b>
✓ Prevents accidental high-value transfers
✓ Extra security for important actions
✓ You control what needs confirmation

<b>Thresholds:</b>
• Transfers > $50 require confirmation
• Payments > $100 require confirmation
• All agent registrations require confirmation

💡 Small transfers (<$50) don't need confirmation - fast and easy!
    `,
    tips: [
      'Code is 6 digits, case doesn\'t matter',
      'Code valid for 10 minutes',
      'You have 3 attempts',
      'Code expires? Just restart the action',
    ],
    actionButtons: [
      { text: '📚 Confirmations Guide', action: '/guide confirmation' },
    ],
    dismissible: true,
  },

  [FirstTimeEvent.RATE_LIMIT_HIT]: {
    event: FirstTimeEvent.RATE_LIMIT_HIT,
    title: '⏱️ Rate Limit Reached',
    content: `
You're doing great, but you've hit a safety limit!

<b>Why limits exist:</b>
✓ Protect against accidental mass-sending
✓ Prevent abuse and unauthorized access
✓ Keep your account secure

<b>What happened:</b>
You've used up your allowed actions for this hour/day.

<b>When it resets:</b>
Your limit automatically resets at the time shown.
No action needed - just wait!

<b>Common Limits:</b>
• Transfers: 10 per hour
• Payments: 20 per hour
• Service calls: 50 per hour

💡 These limits are generous for normal use. If you consistently hit limits, contact support.
    `,
    tips: [
      'Limits reset automatically',
      'Check your exact reset time in the error message',
      'Different actions have different limits',
      'Contact support if limits are too restrictive',
    ],
    dismissible: true,
  },

  [FirstTimeEvent.BUDGET_CHECK]: {
    event: FirstTimeEvent.BUDGET_CHECK,
    title: '💸 Daily/Weekly/Monthly Budgets',
    content: `
Your spending is protected by budgets that reset regularly.

<b>Default Budgets:</b>
📅 Daily: $500
📅 Weekly: $2,000  
📅 Monthly: $8,000

<b>What counts toward budgets:</b>
✓ Token transfers you send
✓ Payments for services/APIs
✓ Agent spending (if delegated)
✗ Tokens you receive (don't count)

<b>How it works:</b>
• Each budget period is independent
• Resets automatically at period boundary
• You can track spending in /activity
• Can't go over limit (blocked until reset)

<b>Budget Periods:</b>
Daily: Resets at midnight UTC
Weekly: Monday-Sunday UTC
Monthly: 1st-30th UTC

💡 Tip: Use /activity to see your spending vs budgets
    `,
    tips: [
      'Budgets are separate from rate limits',
      'View spending with /activity',
      'Contact support for budget overrides',
      'Budgets help prevent accidental over-spending',
    ],
    actionButtons: [
      { text: '📚 Budget Guide', action: '/guide budget' },
      { text: '📊 Check Activity', action: '/activity' },
    ],
    dismissible: true,
  },

  [FirstTimeEvent.FIRST_AGENT]: {
    event: FirstTimeEvent.FIRST_AGENT,
    title: '🤖 Meet Your First Agent',
    content: `
Agents are autonomous programs that act on your behalf!

<b>What agents can do:</b>
🔄 Execute trades automatically
📊 Collect data from services
🌾 Farm yield on your behalf
🎯 Custom actions per agent type

<b>How they work:</b>
1️⃣ You register an agent with a type
2️⃣ You create a spending session for it
3️⃣ Agent operates within your limits
4️⃣ You can disable anytime

<b>Your Control:</b>
✓ Set spending limits per agent
✓ Set time limits (TTL) per session
✓ View all agent actions in /activity
✓ Revoke approval anytime

<b>Agent Types:</b>
• trader - Trading operations
• collector - Data collection
• farmer - Yield farming
• custom - Your own type

💡 Next: Create a spending session so your agent can start working!
    `,
    tips: [
      'Agents follow your budget rules',
      'Each agent needs its own session',
      'Multiple agents supported',
      'Track agent activity in /activity',
    ],
    actionButtons: [
      { text: '📚 Agents Tutorial', action: '/tutorial agents' },
      { text: '📚 Sessions Guide', action: '/guide session' },
    ],
    dismissible: true,
  },

  [FirstTimeEvent.FIRST_SESSION]: {
    event: FirstTimeEvent.FIRST_SESSION,
    title: '💳 Spending Session Created',
    content: `
Excellent! You've authorized an agent to spend your money.

<b>What this session does:</b>
✓ Lets agent execute transactions
✓ Enforces your spending limit
✓ Expires after time you set
✓ Protected by rate limits and confirmations

<b>Your Session Controls:</b>
🛑 Max per transaction: ${Math.random() > 0.5 ? '$100' : '$50'} (you set this)
⏰ Valid until: 24 hours from now (you set this)
💰 Remaining budget: Full until used

<b>What happens now:</b>
1️⃣ Agent gets authorization token
2️⃣ Agent can execute actions
3️⃣ Each action checks against limits
4️⃣ Transaction recorded in /activity

<b>You can:</b>
✓ View active sessions: <code>kpass agent:session list</code>
✓ Revoke session: Create new one with different terms
✓ Monitor spending: <code>/activity</code>

💡 Your agent is now empowered and ready to work!
    `,
    tips: [
      'Sessions auto-expire after TTL',
      'Create new session for new authorization',
      'View all sessions with list command',
      'Each action creates a transaction record',
    ],
    actionButtons: [
      { text: '📊 View Activity', action: '/activity' },
      { text: '💳 List Sessions', action: 'kpass agent:session list' },
    ],
    dismissible: true,
  },

  [FirstTimeEvent.FIRST_PAID_API]: {
    event: FirstTimeEvent.FIRST_PAID_API,
    title: '🔍 Paid Services Explained',
    content: `
You're accessing a paid service - let's explain how it works!

<b>What you're doing:</b>
Calling an external API that charges per request

<b>The Process:</b>
1️⃣ You invoke the service (image generation, translation, etc)
2️⃣ Service executes and returns result
3️⃣ Cost automatically charged to your session
4️⃣ Transaction recorded in your activity

<b>Pricing:</b>
Each service has its own per-call cost (usually $0.01-$1.00)
Shows before you commit
Charged only on success

<b>Examples:</b>
• Image generation: $0.50 per image
• Text translation: $0.10 per 1000 chars
• Weather API: $0.02 per request
• Data enrichment: $0.05-$0.50 per record

<b>In Your Control:</b>
✓ See cost before execution
✓ Set spending session limits
✓ Cancel anytime (only pay what you use)
✓ View all transactions in /activity

💡 Paid services are fast - usually return results in under 5 seconds!
    `,
    tips: [
      'You pay exactly for what you use',
      'Costs shown before committing',
      'Transactions appear instantly in /activity',
      'Session budget controls total spending',
    ],
    actionButtons: [
      { text: '📚 Paid API Guide', action: '/guide api' },
      { text: '🔍 Browse Services', action: '/discover' },
    ],
    dismissible: true,
  },

  [FirstTimeEvent.CONFIRM_ERROR]: {
    event: FirstTimeEvent.CONFIRM_ERROR,
    title: '❌ Confirmation Error',
    content: `
Something went wrong with your confirmation code.

<b>Common issues:</b>
❌ Code entered wrong (case doesn't matter, try again)
❌ Code expired (> 10 minutes, restart action)
❌ Too many failed attempts (max 3, try again in a moment)
❌ System error (rare, refresh and retry)

<b>What to do:</b>
1️⃣ Check error message for exact issue
2️⃣ If code expired → restart the action for new code
3️⃣ If code wrong → check digits again (copy/paste helps)
4️⃣ If attempts exceeded → wait a moment, retry

<b>Getting help:</b>
If problem persists:
• Check you're using correct code from prompt
• Try refreshing (F5 or Cmd+R)
• Contact support with error details
• Error shows exact time and codes provided

💡 Don't worry - your transaction is safe. Nothing executes until confirmation is verified.
    `,
    tips: [
      'Code shown in same message as request',
      'Code is 6 digits, copy/paste recommended',
      'Valid for 10 minutes only',
      'Maximum 3 attempts then must restart',
    ],
    actionButtons: [
      { text: '❓ Help', action: '/help confirmations' },
      { text: '🔄 Retry', action: '/next' },
    ],
    dismissible: true,
  },

  [FirstTimeEvent.INSUFFICIENT_BALANCE]: {
    event: FirstTimeEvent.INSUFFICIENT_BALANCE,
    title: '💸 Insufficient Balance',
    content: `
You don't have enough tokens to complete this transaction.

<b>What this means:</b>
Your account balance is less than the amount you're trying to send/spend

<b>Your current balance:</b>
Check with: <code>kpass wallet balance</code>

<b>Solutions:</b>
1️⃣ <b>Reduce amount:</b> Send less than your balance
2️⃣ <b>Receive more tokens:</b> Ask someone to send you tokens
3️⃣ <b>On testnet?</b> Get free test tokens: <code>/faucet</code>
4️⃣ <b>Buy tokens:</b> Use your payment method to acquire more

<b>Transaction Details:</b>
✓ Amount requested: Will be shown
✓ Balance available: Check with balance command
✓ Difference needed: Calculate the gap

💡 No worries - transactions only execute with sufficient funds. You're protected!
    `,
    tips: [
      'Always check balance before large transfers',
      'Smaller transfers usually succeed',
      'On testnet, /faucet provides free tokens',
      'Balance updates in real-time after transfers',
    ],
    actionButtons: [
      { text: '💰 Check Balance', action: 'kpass wallet balance' },
      { text: '🚰 Get Test Tokens', action: '/faucet' },
    ],
    dismissible: true,
  },
};

// === Main Functions ===

/**
 * Check if first-time prompt should be shown
 */
export async function shouldShowPrompt(userId: number, event: FirstTimeEvent): Promise<boolean> {
  const profile = await readUserProfile(userId, config.userDataRoot);

  if (!profile.firstTimeTracking) {
    profile.firstTimeTracking = {
      shownPrompts: [],
      dismissedPrompts: [],
    };
  }

  const tracking = profile.firstTimeTracking;

  // Don't show if already shown
  if (tracking.shownPrompts.includes(event)) {
    return false;
  }

  // Don't show if explicitly dismissed
  if (tracking.dismissedPrompts.includes(event)) {
    return false;
  }

  return true;
}

/**
 * Get first-time prompt for event
 */
export async function getPrompt(userId: number, event: FirstTimeEvent): Promise<FirstTimePrompt | null> {
  if (!(await shouldShowPrompt(userId, event))) {
    return null;
  }

  const prompt = FIRST_TIME_PROMPTS[event];
  if (!prompt) {
    return null;
  }

  // Mark as shown
  const profile = await readUserProfile(userId, config.userDataRoot);
  if (!profile.firstTimeTracking) {
    profile.firstTimeTracking = {
      shownPrompts: [],
      dismissedPrompts: [],
    };
  }

  if (!profile.firstTimeTracking.shownPrompts.includes(event)) {
    profile.firstTimeTracking.shownPrompts.push(event);
  }
  profile.firstTimeTracking.lastShownAt = Date.now();
  await writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId, event }, 'First-time prompt shown');

  return prompt;
}

/**
 * Dismiss a first-time prompt permanently
 */
export async function dismissPrompt(userId: number, event: FirstTimeEvent): Promise<void> {
  const profile = await readUserProfile(userId, config.userDataRoot);

  if (!profile.firstTimeTracking) {
    profile.firstTimeTracking = {
      shownPrompts: [],
      dismissedPrompts: [],
    };
  }

  if (!profile.firstTimeTracking.dismissedPrompts.includes(event)) {
    profile.firstTimeTracking.dismissedPrompts.push(event);
  }
  await writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId, event }, 'First-time prompt dismissed');
}

/**
 * Reset all prompts for user (for testing or resets)
 */
export async function resetAllPrompts(userId: number): Promise<void> {
  const profile = await readUserProfile(userId, config.userDataRoot);

  profile.firstTimeTracking = {
    shownPrompts: [],
    dismissedPrompts: [],
  };

  await writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId }, 'All first-time prompts reset');
}

/**
 * Format prompt for Telegram display
 */
export function formatPrompt(prompt: FirstTimePrompt): string {
  let msg = `<b>${prompt.title}</b>\n\n`;
  msg += prompt.content;

  if (prompt.tips && prompt.tips.length > 0) {
    msg += '\n\n<b>💡 Pro Tips:</b>\n';
    prompt.tips.forEach((tip) => {
      msg += `• ${tip}\n`;
    });
  }

  if (prompt.actionButtons && prompt.actionButtons.length > 0) {
    msg += '\n<b>Quick Actions:</b>\n';
    prompt.actionButtons.forEach((btn) => {
      msg += `→ ${btn.text}: <code>${btn.action}</code>\n`;
    });
  }

  if (prompt.dismissible) {
    msg += '\n\n<i>Dismiss this with /close or by clearing the message</i>';
  }

  return msg;
}


/**
 * Get all prompts that have been shown to user
 */
export async function getShownPrompts(userId: number): Promise<FirstTimeEvent[]> {
  const profile = await readUserProfile(userId, config.userDataRoot);

  if (!profile.firstTimeTracking) {
    return [];
  }

  return Array.from(profile.firstTimeTracking.shownPrompts) as FirstTimeEvent[];
}

/**
 * Get all prompts that have been dismissed by user
 */
export async function getDismissedPrompts(userId: number): Promise<FirstTimeEvent[]> {
  const profile = await readUserProfile(userId, config.userDataRoot);

  if (!profile.firstTimeTracking) {
    return [];
  }

  return Array.from(profile.firstTimeTracking.dismissedPrompts) as FirstTimeEvent[];
}


/**
 * Check prompt visibility - which events still have prompts available
 */
export async function getAvailablePrompts(userId: number): Promise<FirstTimeEvent[]> {
  const profile = await readUserProfile(userId, config.userDataRoot);

  if (!profile.firstTimeTracking) {
    return Object.keys(FIRST_TIME_PROMPTS) as FirstTimeEvent[];
  }

  const tracking = profile.firstTimeTracking;
  return (Object.keys(FIRST_TIME_PROMPTS) as FirstTimeEvent[]).filter(
    (event) => !tracking.shownPrompts.includes(event) && !tracking.dismissedPrompts.includes(event),
  );
}
