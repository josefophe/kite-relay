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
*🎉 Welcome to KiteRelay!*

I'll guide you through setting up your account and learning the platform. Let's start with the basics:

*Quick Path (5-10 minutes):*
1️⃣ Authentication - Sign up or log in
2️⃣ Wallet - Check your balance
3️⃣ First Transfer - Send your first tokens

*Available Flows:*
🔐 \`/setup auth\` - Authentication flow
👤 \`/setup profile\` - Profile & wallet basics
📤 \`/setup transfer\` - First transfer walkthrough
🤖 \`/setup agents\` - Agent registration
💳 \`/setup session\` - Session creation
🔍 \`/setup api\` - Paid API discovery

*Learning:*
📚 \`/tutorial full\` - Complete walkthrough (60 min)
📚 \`/tutorial transfers\` - Transfers only (10 min)

*Help:*
❓ \`/help\` - Command reference
📍 \`/progress\` - Your progress
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
*📋 Available Setup Flows*

\`/setup auth\` - Authentication (3 steps, 5 min)
  Sign up or log in to Kite Passport

\`/setup profile\` - Profile & Wallet (3 steps, 5 min)
  Check your account and balance

\`/setup transfer\` - First Transfer (3 steps, 10 min)
  Learn to send your first tokens safely

\`/setup agents\` - Agents (3 steps, 8 min)
  Register and manage autonomous agents

\`/setup session\` - Sessions (4 steps, 10 min)
  Create spending authorization sessions

\`/setup api\` - Paid APIs (3 steps, 10 min)
  Discover and use paid services
      `,
      action: 'Show setup flows',
      nextSteps: ['Choose a flow with /setup <flow>'],
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
*👋 Welcome!*

You haven't started onboarding yet.

Use \`/start\` to begin or choose:
• \`/setup auth\` - Start authentication
• \`/tutorial full\` - Complete walkthrough
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
  if (topic === 'commands') {
    return {
      success: true,
      message: `
*🎓 Onboarding Commands*

*Getting Started:*
/start - Initialize onboarding
/progress - Check your progress

*Setup Flows (10 min each):*
/setup auth - Authentication
/setup profile - Wallet & profile
/setup transfer - First transfer
/setup agents - Agent registration
/setup session - Session creation
/setup api - Paid API discovery

*Tutorials (5-60 min):*
/tutorial - List tutorials
/tutorial full - 60-min complete walkthrough
/tutorial transfers - Making transfers
/tutorial agents - Using agents

*During a Flow:*
/next - Complete step and advance
/skip - Skip current flow
/progress - Check progress

*General Help:*
/help - This message
/help <topic> - Help on topic
      `,
    };
  }

  if (topic === 'first-transfer') {
    return {
      success: true,
      message: `
*💰 Making Your First Transfer*

*1. Get recipient address:*
   Ask for their 0x address (42 chars)

*2. Check your balance:*
   \`kpass wallet balance\`

*3. Send tokens:*
   \`kpass wallet send --to 0x... --amount 10 --asset USDC\`

*4. Verify:*
   \`/activity\` to see transaction

*Tips:*
✓ Double-check address before sending
✓ Transfers are permanent
✓ Use small amount for first test
✓ Transaction shows in activity immediately
      `,
    };
  }

  return {
    success: true,
    message: `
*❓ Help & Support*

*Quick Start:*
Use \`/start\` for initial onboarding
Use \`/setup <flow>\` for step-by-step guides
Use \`/tutorial\` for video lessons

*Help Topics:*
/help commands - All onboarding commands
/help first-transfer - Guide to first transfer
/help agents - Understanding agents
/help sessions - Understanding sessions

*Progress:*
/progress - See your learning progress
/next - Advance to next step
/skip - Skip a flow

*Anytime:*
This help menu is always available
No rush - take your time learning
You can skip flows and revisit later
    `,
    nextSteps: [
      'Try /setup profile to explore',
      'Use /help <topic> for detailed help',
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
\`kpass agent:register --type trader\`

*View Agents:*
\`kpass user agents\`

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
