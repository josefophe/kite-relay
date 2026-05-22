/**
 * Onboarding Skill - User-Facing Commands
 *
 * Provides commands:
 * - /start - Begin initial onboarding
 * - /tutorial <type> - Enroll in tutorial
 * - /setup <flow> - Start specific setup flow
 * - /progress - Check onboarding progress
 * - /help - Context-aware help
 * - /next - Advance to next step
 * - /skip - Skip current flow
 *
 * Phase 5: User Onboarding
 */

import { logger } from '../logger';
import {
  initializeOnboarding,
  getOnboardingStatus,
  startFlow,
  completeStep,
  skipFlow,
  getCurrentStep,
  enrollTutorial,
  completeLessonInTutorial,
  getTutorialProgress,
  formatStep,
  formatOnboardingStatus,
  formatTutorialProgress,
  OnboardingFlow,
  TutorialType,
  OnboardingStep,
} from '../onboardingService';
// import { errorResponseService } from '../errorResponseService';

// === Main Skill Handler ===

export interface OnboardingRequest {
  userId: number;
  command: string;
  args?: string[];
}

export interface OnboardingResponse {
  success: boolean;
  message: string;
  action?: string;
  nextSteps?: string[];
  error?: string;
}

/**
 * Main handler for onboarding skill
 */
export async function handleOnboarding(request: OnboardingRequest): Promise<OnboardingResponse> {
  try {
    const { userId, command, args } = request;

    logger.debug({ userId, command, args }, 'Onboarding skill called');

    switch (command) {
      case 'start':
        return await handleStart(userId);

      case 'tutorial':
        return await handleTutorial(userId, args?.[0]);

      case 'setup':
        return await handleSetup(userId, args?.[0]);

      case 'progress':
        return await handleProgress(userId);

      case 'help':
        return await handleHelp(userId, args?.[0]);

      case 'next':
        return await handleNext(userId);

      case 'skip':
        return await handleSkip(userId);

      case 'guide':
        return await handleGuide(userId, args?.[0]);

      default:
        return {
          success: false,
          error: `Unknown onboarding command: ${command}`,
          message: 'Use /help onboarding for available commands',
        };
    }
  } catch (error) {
    logger.error({ error }, 'Onboarding skill error');
    return {
      success: false,
      error: String(error),
      message: 'Onboarding error. Try again or use /help',
    };
  }
}

// === Command Handlers ===

/**
 * /start - Begin initial onboarding
 */
async function handleStart(userId: number): Promise<OnboardingResponse> {
  const existing = await getOnboardingStatus(userId);

  if (existing && existing.completedFlows.length > 0) {
    return {
      success: true,
      message: formatOnboardingStatus(existing),
      nextSteps: ['Use /next to continue your current flow', 'Use /tutorial to enroll in tutorials'],
    };
  }

  await initializeOnboarding(userId);

  const response = {
    success: true,
    message: `
<b>🎉 Welcome to KiteRelay!</b>

I'll guide you through setting up your account and learning the platform. Let's start with the basics:

<b>Quick Path (5-10 minutes):</b>
1️⃣ Authentication - Sign up or log in
2️⃣ Wallet - Check your balance
3️⃣ First Transfer - Send your first tokens

<b>Available Flows:</b>
🔐 <code>/setup auth</code> - Authentication flow
👤 <code>/setup profile</code> - Profile &amp; wallet basics
📤 <code>/setup transfer</code> - First transfer walkthrough
🤖 <code>/setup agents</code> - Agent registration
💳 <code>/setup session</code> - Session creation
🔍 <code>/setup api</code> - Paid API discovery

<b>Learning:</b>
📚 <code>/tutorial full</code> - Complete walkthrough (60 min)
📚 <code>/tutorial transfers</code> - Transfers only (10 min)

<b>Help:</b>
❓ <code>/help</code> - Command reference
📍 <code>/progress</code> - Your progress
    `,
    nextSteps: [
      'Start with /setup auth to authenticate',
      'Or /tutorial full for complete walkthrough',
    ],
  };

  logger.info({ userId }, 'User onboarding started');

  return response;
}

/**
 * /tutorial <type> - Enroll in or view tutorial
 */
async function handleTutorial(userId: number, tutorialType?: string): Promise<OnboardingResponse> {
  if (!tutorialType) {
    return {
      success: true,
      message: `
*📚 Available Tutorials*

⏱️ *Quick Tutorials (5-15 minutes):*
• \`/tutorial wallet\` - Wallet Basics
• \`/tutorial transfers\` - Making Transfers
• \`/tutorial agents\` - Using Agents
• \`/tutorial sessions\` - Spending Sessions
• \`/tutorial budgets\` - Budget Management
• \`/tutorial confirmations\` - Confirmations & Security

⏱️ *Complete Learning:*
• \`/tutorial full\` - Platform Walkthrough (60 min)

Each tutorial has video lessons, quizzes, and a certificate at the end.
      `,
      action: 'Show tutorial menu',
      nextSteps: ['Choose a tutorial with /tutorial <type>'],
    };
  }

  const tutorialMap: Record<string, TutorialType> = {
    wallet: TutorialType.WALLET_OVERVIEW,
    transfers: TutorialType.TRANSFERS,
    agents: TutorialType.AGENTS,
    sessions: TutorialType.SESSIONS,
    budgets: TutorialType.BUDGETS,
    confirmations: TutorialType.CONFIRMATIONS,
    full: TutorialType.FULL_WALKTHROUGH,
  };

  const tutorial = tutorialMap[tutorialType.toLowerCase()];
  if (!tutorial) {
    return {
      success: false,
      error: `Unknown tutorial: ${tutorialType}`,
      message: 'Use /tutorial with no args to see available tutorials',
    };
  }

  const enrolled = await enrollTutorial(userId, tutorial);
  const progress = await getTutorialProgress(userId, tutorial);

  if (!progress) {
    return {
      success: false,
      error: 'Failed to enroll in tutorial',
      message: 'Please try again',
    };
  }

  return {
    success: true,
    message: formatTutorialProgress(tutorial, progress),
    action: `Enrolled in ${tutorial} tutorial`,
    nextSteps: ['Read lesson 1', 'Use /progress to check your advance', 'Use /next to skip to next lesson'],
  };
}

/**
 * /setup <flow> - Start specific flow
 */
async function handleSetup(userId: number, flowName?: string): Promise<OnboardingResponse> {
  if (!flowName) {
    return {
      success: true,
      message: `
<b>📋 Available Setup Flows</b>

<code>/setup auth</code> - Authentication (3 steps, 5 min)
  Sign up or log in to Kite Passport

<code>/setup profile</code> - Profile &amp; Wallet (3 steps, 5 min)
  Check your account and balance

<code>/setup transfer</code> - First Transfer (3 steps, 10 min)
  Learn to send your first tokens safely

<code>/setup agents</code> - Agents (3 steps, 8 min)
  Register and manage autonomous agents

<code>/setup session</code> - Sessions (4 steps, 10 min)
  Create spending authorization sessions

<code>/setup api</code> - Paid APIs (3 steps, 10 min)
  Discover and use paid services
      `,
      action: 'Show setup flows',
      nextSteps: ['Choose a flow with /setup &lt;flow&gt;'],
    };
  }

  const flowMap: Record<string, OnboardingFlow> = {
    auth: OnboardingFlow.AUTH,
    profile: OnboardingFlow.PROFILE,
    transfer: OnboardingFlow.FIRST_TRANSFER,
    agents: OnboardingFlow.AGENT_REGISTRATION,
    session: OnboardingFlow.SESSION_CREATION,
    api: OnboardingFlow.PAID_API,
  };

  const flow = flowMap[flowName.toLowerCase()];
  if (!flow) {
    return {
      success: false,
      error: `Unknown flow: ${flowName}`,
      message: 'Use /setup with no args to see available flows',
    };
  }

  const flowRecord = await startFlow(userId, flow);
  const step = await getCurrentStep(userId);

  if (!step) {
    return {
      success: false,
      error: 'Failed to start flow',
      message: 'Please try again',
    };
  }

  return {
    success: true,
    message: formatStep(step),
    action: `Started flow: ${flowName}`,
    nextSteps: [
      'Follow the steps above',
      'Use /next when done with this step',
      'Use /skip to skip this flow',
    ],
  };
}

/**
 * /progress - Show onboarding progress
 */
async function handleProgress(userId: number): Promise<OnboardingResponse> {
  const onboarding = await getOnboardingStatus(userId);

  if (!onboarding) {
    return {
      success: true,
      message: `
<b>👋 Welcome!</b>

You haven't started onboarding yet.

Use <code>/start</code> to begin or choose:
• <code>/setup auth</code> - Start authentication
• <code>/tutorial full</code> - Complete walkthrough
      `,
      nextSteps: ['Use /start to begin'],
    };
  }

  return {
    success: true,
    message: formatOnboardingStatus(onboarding),
    action: 'Progress shown',
    nextSteps: [
      onboarding.activeFlow ? '/next to continue' : 'Choose /setup or /tutorial',
      '/help for commands',
    ],
  };
}

/**
 * /help - Show help for onboarding
 */
async function handleHelp(userId: number, topic?: string): Promise<OnboardingResponse> {
  // ========== COMPREHENSIVE HELP SYSTEM ==========
  
  if (topic === 'commands' || topic === 'all') {
    return {
      success: true,
      message: `
<b>📚 ALL AVAILABLE COMMANDS</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>AUTHENTICATION</b>
/login &lt;email&gt; - Sign in
/signup &lt;email&gt; - Create new account
/logout - Sign out
/me - View your profile &amp; status

<b>WALLET &amp; MONEY</b>
/balance - Check your balance
/send &lt;user/address&gt; &lt;amount&gt; &lt;asset&gt; - Send tokens
/activity - View transaction history
/faucet - Get test tokens (testnet only)

<b>AGENTS</b>
/agent-register &lt;type&gt; - Register new agent
/agent-list - See all your agents
/agent-create "&lt;description&gt;" - Create scheduled agent
/agent-start &lt;id&gt; - Start/resume agent
/agent-stop &lt;id&gt; - Pause agent
/agent-delete &lt;id&gt; - Delete agent
/agent-logs &lt;id&gt; - View agent logs
/agent-run &lt;id&gt; "&lt;command&gt;" - Manually trigger agent

<b>SPENDING SESSIONS</b>
/session-create &lt;options&gt; - Request spending authorization
/session-list - View all sessions
/session-status &lt;id&gt; - Check session details
/session-revoke &lt;id&gt; - Cancel session

<b>DISCOVERY &amp; SERVICES</b>
/discover - Browse all services
/discover search &lt;keyword&gt; - Find services
/discover details &lt;id&gt; - Service details

<b>SHOPPING</b>
/shop search &lt;keyword&gt; - Find products
/shop add &lt;product-id&gt; - Add to cart
/shop cart - View cart
/shop checkout - Complete purchase

<b>LEARNING</b>
/start - Begin onboarding
/setup &lt;flow&gt; - Start setup flow
/tutorial &lt;type&gt; - Enroll in tutorial
/progress - Check learning progress

<b>HELP</b>
/help - General help (this list)
/help &lt;topic&gt; - Help on specific topic
/guide &lt;action&gt; - Quick guides

<b>SYSTEM</b>
/status - Bot &amp; system status
/debug health - Run health check
/version - Bot version
      `,
    };
  }

  if (topic === 'transfers' || topic === 'send' || topic === 'first-transfer') {
    return {
      success: true,
      message: `
<b>💰 MAKING TRANSFERS</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>BASIC TRANSFER</b>

1️⃣ Check balance:
   /balance

2️⃣ Get recipient:
   @username or 0x... address

3️⃣ Send tokens:
   /send @john 5 USDC
   /send 0x1234...5678 10 USDC

4️⃣ Verify:
   /activity

<b>IMPORTANT:</b>
⚠️ Transfers are PERMANENT - cannot be reversed
⚠️ Always verify address before confirming
⚠️ Test with small amount first
✓ Transfers usually complete in 1-5 seconds
✓ You see confirmation with tx hash

<b>VALID FORMATS:</b>
✅ /send @username 5 USDC
✅ /send 0x1234567890123456789012345678901234567890 5 USDC
❌ /send 1234567890123456789012345678901234567890 (missing 0x)
❌ /send john@email.com 5 USDC (use @username or wallet)

<b>TROUBLESHOOTING:</b>
❌ "Insufficient balance" → Add more funds
❌ "Invalid recipient" → Check address format
❌ "Session expired" → Run /login again

<b>LEARN MORE:</b>
See USER_GUIDE.md → "Sending Your First Transfer"
Or use: /guide transfer
      `,
    };
  }

  if (topic === 'agents') {
    return {
      success: true,
      message: `
<b>🤖 UNDERSTANDING AGENTS</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>WHAT'S AN AGENT?</b>
An autonomous bot that executes tasks on your behalf.
Once created, it runs 24/7 without manual action.

<b>AGENT TYPES:</b>
• trader - Make transfers and payments
• collector - Gather data from services
• farmer - Perform farming operations
• custom - Your own custom logic

<b>QUICK START:</b>

1️⃣ Register agent:
   /agent-register trader

2️⃣ Create spending session:
   /session-create --agent &lt;agent-id&gt; --max 100

3️⃣ Approve on phone (via passkey)

4️⃣ Agent is ready!

<b>NATURAL LANGUAGE AGENTS:</b>

Create agents by describing what you want:
   /agent-create "send 5 USDC daily at 9am"
   /agent-create "check balance every hour"
   /agent-create "buy KITE if price drops below $10"

<b>MANAGING AGENTS:</b>

See all agents:
   /agent-list

View agent logs:
   /agent-logs &lt;agent-id&gt;

Stop agent:
   /agent-stop &lt;agent-id&gt;

Restart agent:
   /agent-start &lt;agent-id&gt;

Delete agent:
   /agent-delete &lt;agent-id&gt;

<b>SAFETY:</b>
✓ Each agent needs spending session approval
✓ Session has max per-transaction limit
✓ Session can be revoked anytime
✓ All actions logged in /agent-logs
✓ Start small, increase limits gradually

<b>LEARN MORE:</b>
See USER_GUIDE.md → "Creating Your First Agent"
Or use: /guide agent
      `,
    };
  }

  if (topic === 'sessions' || topic === 'spending') {
    return {
      success: true,
      message: `
<b>💳 SPENDING SESSIONS</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>WHAT'S A SESSION?</b>
Authorization for agents to spend your money within limits.
Think of it like giving an agent a credit card with rules.

<b>WHY NEEDED:</b>
For safety - agents can only spend what you approve.

<b>CREATING A SESSION:</b>

   /session-create --agent trader --max 100 --ttl 24h

Parameters:
   --agent &lt;id&gt; - Which agent can use this
   --max &lt;amount&gt; - Highest per-transaction amount
   --ttl &lt;time&gt; - How long session lasts (1h, 24h, 7d)

Example:
   /session-create --agent trader-001 --max 50 --ttl 7d
   → Agent can spend up to $50 per transaction for 7 days

<b>APPROVAL:</b>
✓ Session created (pending)
✓ Get notification on phone
✓ Use passkey to approve
✓ Session becomes active

<b>MANAGING SESSIONS:</b>

View all:
   /session-list

Check specific:
   /session-status &lt;session-id&gt;

Revoke (stop agent spending):
   /session-revoke &lt;session-id&gt;

<b>SESSION EXPIRATION:</b>
Sessions have TTL (time-to-live):
   1h → Expires after 1 hour
   24h → Expires after 1 day
   7d → Expires after 1 week
   30d → Expires after 1 month

After expiration:
   → Agent can no longer spend
   → Create new session to resume

<b>BEST PRACTICES:</b>
✓ Different session per agent
✓ Set spending limits gradually
✓ Use shorter TTL for testing (1h)
✓ Use longer TTL for trusted agents (7d+)
✓ Revoke unused sessions
✓ Review /session-list regularly

<b>LEARN MORE:</b>
See USER_GUIDE.md → "Managing Spending Sessions"
Or use: /guide session
      `,
    };
  }

  if (topic === 'discover' || topic === 'services' || topic === 'apis') {
    return {
      success: true,
      message: `
<b>🔍 DISCOVERING PAID SERVICES</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>WHAT'S AVAILABLE:</b>
Hundreds of paid APIs for:
   🎨 Image generation (DALL-E, Midjourney, etc.)
   🎤 Voice &amp; audio (TTS, voice recognition, music)
   📊 Data (weather, news, prices, geocoding)
   🧠 AI compute (LLM, translation, transcription)
   🛍️ Shopping (Amazon, price comparison)
   📱 Communication (Email, SMS, notifications)

<b>BROWSE SERVICES:</b>

See all:
   /discover

Search by keyword:
   /discover search weather
   /discover search "image generation"

Get details:
   /discover details service-id

<b>USING SERVICES:</b>

1️⃣ Find service:
   /discover search "service-name"

2️⃣ Create session:
   /session-create --max 5 --ttl 1h

3️⃣ Approve on phone

4️⃣ Use the service!

<b>PRICING:</b>
Most services cost $0.01 - $1.00 per call.
You pay only for what you use.
No subscriptions, no recurring charges.

<b>EXAMPLES:</b>

Generate image:
   /discover search "image"
   → Find DALL-E, Midjourney, etc.
   → Create session
   → Use it!

Check weather:
   /discover search "weather"
   → Find weather APIs
   → Create session
   → Agent can check weather

Translate text:
   /discover search "translation"
   → Find translation services
   → Create session
   → Translate documents

<b>LEARN MORE:</b>
See USER_GUIDE.md → "Using Paid Services"
Or use: /guide service
      `,
    };
  }

  if (topic === 'shopping' || topic === 'shop' || topic === 'purchase') {
    return {
      success: true,
      message: `
<b>🛒 SHOPPING WITH CRYPTO</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>HOW IT WORKS:</b>
Browse products → Add to cart → Pay with USDC/KITE

<b>SEARCH PRODUCTS:</b>

   /shop search "laptop"
   /shop search "programming books"

<b>ADD TO CART:</b>

   /shop add product-id

<b>VIEW CART:</b>

   /shop cart

<b>CHECKOUT:</b>

   /shop checkout --asset USDC
   (or use --asset KITE)

<b>EXAMPLE WORKFLOW:</b>

1. Search:
   /shop search "Python book"

2. View results:
   [Shows products with prices]

3. Add item:
   /shop add book-12345

4. Add more items (optional):
   /shop add book-67890

5. Review cart:
   /shop cart
   [Shows items and total]

6. Checkout:
   /shop checkout --asset USDC

7. Confirm payment

8. Get order confirmation
   + order tracking number

<b>SUPPORTED MERCHANTS:</b>
✓ Amazon (more coming)
✓ Direct partner stores
✓ Exclusive crypto offers

<b>BENEFITS:</b>
✓ Use crypto for real products
✓ No additional conversion
✓ Instant order confirmation
✓ Track shipment
✓ Full order history

<b>TIPS:</b>
• Check prices in USD and crypto equivalent
• Shipping is included
• Orders usually ship 1-3 days
• Track via provided link

<b>LEARN MORE:</b>
See USER_GUIDE.md → "Shopping with Crypto"
      `,
    };
  }

  if (topic === 'tutorial' || topic === 'learn' || topic === 'getting-started') {
    return {
      success: true,
      message: `
<b>🎓 LEARNING &amp; TUTORIALS</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>INTERACTIVE TUTORIALS:</b>

Start onboarding:
   /start

View progress:
   /progress

<b>SETUP FLOWS (10 min each):</b>

   /setup auth → Authentication basics
   /setup profile → Wallet &amp; profile
   /setup transfer → First transfer
   /setup agents → Agent registration
   /setup session → Session creation
   /setup api → Paid API discovery

<b>VIDEO TUTORIALS:</b>

List all:
   /tutorial

Full walkthrough (60 min):
   /tutorial full

Quick tutorials (5-15 min):
   /tutorial wallet - Wallet basics
   /tutorial transfers - Making transfers
   /tutorial agents - Using agents
   /tutorial sessions - Spending sessions
   /tutorial budgets - Budget management

<b>DURING TUTORIAL:</b>

Next step:
   /next

Skip:
   /skip

Check progress:
   /progress

<b>DOCUMENTATION:</b>

→ GETTING_STARTED.md (5 min overview)
→ COMMANDS_REFERENCE.md (all commands)
→ FEATURES_OVERVIEW.md (capabilities)
→ USER_GUIDE.md (step-by-step guides)
→ TROUBLESHOOTING.md (common issues)

<b>QUICK PATHS:</b>

Path 1: "I want to send money"
   /setup transfer → /tutorial transfers

Path 2: "I want to automate"
   /setup agents → /setup session

Path 3: "I want to learn everything"
   /tutorial full

Path 4: "I'm stuck"
   /help &lt;topic&gt; → /troubleshooting

<b>LEARN MORE:</b>
Everything takes 5-60 minutes.
No rush - learn at your own pace!
You can always skip and return later.
      `,
    };
  }

  if (topic === 'troubleshoot' || topic === 'error' || topic === 'problem') {
    return {
      success: true,
      message: `
<b>🔧 TROUBLESHOOTING HELP</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>COMMON ISSUES:</b>

❌ "Session expired"
   → Run /login to authenticate again

❌ "Insufficient balance"
   → Check /balance
   → Add more funds or reduce amount

❌ "Invalid recipient address"
   → Address must be 0x + 40 hex chars
   → Or use @username format
   → Check spelling carefully

❌ "Transfer failed"
   → Check /activity for error details
   → Try again in a moment
   → Use smaller amount

❌ "Agent not executing"
   → Check /agent-list for agent status
   → Check /session-list for session status
   → Check /agent-logs for errors
   → Session may have expired

❌ "Cannot create session"
   → Agent must exist first: /agent-list
   → Check system health: /debug health
   → Try again in a moment

<b>DIAGNOSTIC COMMANDS:</b>

Check your status:
   /me

Check system health:
   /debug health

View recent activity:
   /activity 20

Check agent logs:
   /agent-logs agent-id

<b>GETTING HELP:</b>

General help:
   /help

Topic-specific:
   /help &lt;topic&gt;

Quick guides:
   /guide &lt;action&gt;

<b>DETAILED TROUBLESHOOTING:</b>
See: TROUBLESHOOTING.md
(Complete guide with solutions)

<b>STILL STUCK:</b>
Check TROUBLESHOOTING.md for your specific error.
If not resolved, contact support with:
   • Error message (exact text)
   • Command you ran
   • Your user ID (/me)
   • When it happened
      `,
    };
  }

  // ========== DEFAULT HELP ==========
  return {
    success: true,
    message: `
<b>❓ KITE RELAY HELP</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>I WANT TO:</b>

Send money:
   /help transfers

Create agents:
   /help agents

Set spending limits:
   /help sessions

Use paid services:
   /help discover

Shop online:
   /help shopping

Learn the platform:
   /help tutorial

Fix a problem:
   /help troubleshoot

See all commands:
   /help commands

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>QUICK START:</b>

1. New here? /start or /setup auth
2. Need guidance? /tutorial full (60 min)
3. Have a question? /help &lt;topic&gt;
4. Need a quick reference? /help commands

<b>DOCUMENTATION:</b>
📖 GETTING_STARTED.md - 5 min orientation
📖 COMMANDS_REFERENCE.md - All commands
📖 USER_GUIDE.md - Step-by-step guides
📖 TROUBLESHOOTING.md - Fix common issues

<b>LEARN MORE:</b>
Use /help &lt;topic&gt; where topic is:
   • transfers
   • agents
   • sessions
   • discover (paid services)
   • shopping
   • tutorial
   • troubleshoot
   • commands (all)

Need more help? Use /start for guided onboarding!
    `,
    nextSteps: [
      'Use /help <topic> for specific help',
      'Try /setup auth to get started',
      'Or /tutorial full for complete walkthrough',
    ],
  };
}

/**
 * /next - Advance to next step
 */
async function handleNext(userId: number): Promise<OnboardingResponse> {
  try {
    const nextStepId = await completeStep(userId);

    if (!nextStepId) {
      const onboarding = await getOnboardingStatus(userId);
      return {
        success: true,
        message: `
*✅ Flow Complete!*

You've completed this setup flow. Great job! 🎉

*What's next?*
📍 \`/progress\` - See your overall progress
🎓 \`/tutorial\` - Enroll in tutorials
📋 \`/setup\` - Start another flow
        `,
        action: 'Flow completed',
        nextSteps: ['Choose another /setup or /tutorial'],
      };
    }

    const step = await getCurrentStep(userId);
    if (!step) {
      return {
        success: false,
        error: 'Could not load next step',
        message: 'Please try again',
      };
    }

    return {
      success: true,
      message: `*✅ Step Complete!*\n\n${formatStep(step)}`,
      action: 'Advanced to next step',
      nextSteps: ['Follow the steps', 'Use /next when ready', 'Use /skip to exit'],
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      message: 'No active flow to advance',
      nextSteps: ['Use /setup <flow> to start one'],
    };
  }
}

/**
 * /skip - Skip current flow
 */
async function handleSkip(userId: number): Promise<OnboardingResponse> {
  try {
    await skipFlow(userId);

    return {
      success: true,
      message: `
*⏭️ Flow Skipped*

No problem! You can always return to this flow later.

*What's next?*
📋 \`/setup\` - Choose another flow
🎓 \`/tutorial\` - Learn with tutorials
📍 \`/progress\` - Check your progress
      `,
      action: 'Flow skipped',
      nextSteps: ['Choose another /setup or /tutorial'],
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      message: 'No active flow to skip',
      nextSteps: ['Use /setup to start a flow'],
    };
  }
}

/**
 * /guide <action> - Get just-in-time guidance for specific actions
 */
async function handleGuide(userId: number, action?: string): Promise<OnboardingResponse> {
  const guides: Record<string, string> = {
    transfer: `
*💰 Transferring Tokens*

*Step 1: Prepare*
Get the recipient's wallet address (0x format)

*Step 2: Execute*
\`kpass wallet send --to 0x123... --amount 10 --asset USDC\`

*Step 3: Verify*
Check your /activity to confirm

*Safety Tips:*
✓ Always verify address carefully
✓ Transfers are permanent!
✓ Test with small amount first
✓ Save transaction hash
    `,
    agent: `
*🤖 Registering an Agent*

*What's an Agent?*
Autonomous bot that can execute actions on your behalf

*Supported Types:*
• trader - For trading operations
• collector - For data collection
• farmer - For farming operations

*Register:*
\`kpass agent:register --type trader --output json\`

*View Agents:*
\`kpass user agents --output json\`

*Next Steps:*
Create a spending session for your agent
    `,
    session: `
*💳 Creating a Spending Session*

*What's a Session?*
Authorization for agent to spend with set limits

*Create:*
\`kpass agent:session create --max-amount-per-tx 100 --ttl 24h\`

*Parameters:*
--max-amount-per-tx: Max per-call spend
--ttl: Validity (1h, 24h, 7d)

*Approve:*
Check your phone for passkey prompt

*Monitor:*
\`kpass agent:session list --status active\`
    `,
    confirmation: `
*🔐 Confirmations Explained*

*When Required:*
• Transfers > $50
• Payments > $100
• Large agent sessions

*What Happens:*
1️⃣ You see confirmation prompt with 6-digit code
2️⃣ Enter code within 10 minutes
3️⃣ Maximum 3 attempts
4️⃣ Transaction executes

*If Code Expires:*
Just start the action again for new code
    `,
    budget: `
*💸 Understanding Budgets*

*Default Budgets:*
Daily: $500
Weekly: $2,000
Monthly: $8,000

*When Limits Apply:*
Transfers, payments, and agent spending

*Check Budget:*
\`/activity\` shows spending vs limits

*What if I Hit Limit?*
Blocked until next period (day/week/month)
Contact support for emergency override
    `,
  };

  if (!action) {
    return {
      success: true,
      message: `
*📖 Just-in-Time Guides*

\`/guide transfer\` - Making transfers
\`/guide agent\` - Registering agents
\`/guide session\` - Creating sessions
\`/guide confirmation\` - Confirmations
\`/guide budget\` - Budget limits
      `,
      nextSteps: ['Use /guide <action> for specific help'],
    };
  }

  const guide = guides[action.toLowerCase()];
  if (!guide) {
    return {
      success: false,
      error: `Unknown guide: ${action}`,
      message: 'Use /guide with no args to see available guides',
    };
  }

  return {
    success: true,
    message: guide,
    action: `Guide shown: ${action}`,
  };
}

// === Helper: Format response for Telegram ===

export function formatOnboardingResponse(response: OnboardingResponse): string {
  let msg = response.message;

  if (!response.success && response.error) {
    msg = `❌ Error: ${response.error}\n\n${response.message}`;
  }

  if (response.action) {
    msg += `\n\n<i>${response.action}</i>`;
  }

  if (response.nextSteps && response.nextSteps.length > 0) {
    msg += '\n\n*Next Steps:*\n';
    response.nextSteps.forEach((step) => {
      msg += `• ${step}\n`;
    });
  }

  return msg;
}
