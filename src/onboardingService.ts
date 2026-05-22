/**
 * Onboarding Service - User Guidance & Flow Management
 *
 * Manages user onboarding journey with:
 * - Onboarding flow tracking (signup → auth → profile → first transaction)
 * - Progress persistence and resume capability
 * - Contextual guidance at each step
 * - Tutorial enrollment and tracking
 *
 * Phase 5: User Onboarding
 */

import { config } from './config';
import { logger } from './logger';
import { readUserProfile, writeUserProfile, UserProfile } from './storage';

// === Types ===

export enum OnboardingFlow {
  SIGNUP = 'signup',
  AUTH = 'auth',
  PROFILE = 'profile',
  FIRST_TRANSFER = 'first_transfer',
  AGENT_REGISTRATION = 'agent_registration',
  SESSION_CREATION = 'session_creation',
  PAID_API = 'paid_api',
}

export enum TutorialType {
  WALLET_OVERVIEW = 'wallet_overview',
  TRANSFERS = 'transfers',
  AGENTS = 'agents',
  SESSIONS = 'sessions',
  BUDGETS = 'budgets',
  CONFIRMATIONS = 'confirmations',
  FULL_WALKTHROUGH = 'full_walkthrough',
}

export interface OnboardingStep {
  stepId: string;
  title: string;
  description: string;
  action?: string;
  expectedOutcome?: string;
  nextStep?: string;
  tips?: string[];
}

export interface OnboardingFlowRecord {
  flow: string;
  startedAt: number;
  completedAt?: number;
  currentStep: string;
  completedSteps: string[];
  skipped?: boolean;
}

export interface TutorialProgress {
  tutorial: TutorialType;
  enrolledAt: number;
  currentLesson: number;
  completedLessons: number[];
  quizScores?: Record<string, number>;
  certificateIssued?: boolean;
}

export interface UserOnboarding {
  userId: number;
  firstLoginAt?: number;
  completedFlows: OnboardingFlowRecord[];
  activeFlow?: OnboardingFlowRecord;
  tutorials: TutorialProgress[];
  userLevel: 'beginner' | 'intermediate' | 'advanced';
  completionPercentage: number;
  lastGuidanceShown?: {
    type: string;
    shownAt: number;
  };
}

// === Onboarding Flow Definitions ===

const ONBOARDING_FLOWS: Record<string, OnboardingStep[]> = {
  signup: [
    {
      stepId: 'signup-1',
      title: '📧 Verify Email',
      description: 'Enter your email address and verify it with a code',
      action: 'kpass signup init --email <your@email.com>',
      expectedOutcome: 'Receive verification code via email',
      nextStep: 'signup-2',
      tips: [
        'Use an email you check regularly',
        'Verification code arrives within 1-2 seconds',
        'Code is valid for 10 minutes',
      ],
    },
    {
      stepId: 'signup-2',
      title: '✅ Verify Code',
      description: 'Enter the code from your email',
      action: 'kpass signup exchange --signup-id <id> --code <code>',
      expectedOutcome: 'Account created and passkey registered',
      nextStep: 'auth-1',
      tips: [
        'Check spam folder if email missing',
        'Code is case-insensitive',
        'You have 3 attempts',
      ],
    },
  ],
  auth: [
    {
      stepId: 'auth-1',
      title: '🔐 Login Setup',
      description: 'Initialize login with your registered email',
      action: 'kpass login init --email <your@email.com>',
      expectedOutcome: 'Receive login code via email',
      nextStep: 'auth-2',
      tips: [
        'Use the same email you signed up with',
        'Login codes are different from signup codes',
      ],
    },
    {
      stepId: 'auth-2',
      title: '✔️ Verify Login',
      description: 'Enter the verification code to complete login',
      action: 'kpass login verify --login-id <id> --code <code>',
      expectedOutcome: 'Logged in with active JWT token',
      nextStep: 'profile-1',
      tips: [
        'JWT token stored locally for 24 hours',
        'Commands work without re-login within token expiry',
        'Token refreshes on each command',
      ],
    },
  ],
  profile: [
    {
      stepId: 'profile-1',
      title: '👤 Check Your Profile',
      description: 'View your account information and wallet details',
      action: 'kpass me --output json',
      expectedOutcome: 'See your user ID, wallet address, and status',
      nextStep: 'profile-2',
      tips: [
        'Your wallet address starts with 0x',
        'Save this for fund transfers',
        'Check status shows you\'re authenticated',
      ],
    },
    {
      stepId: 'profile-2',
      title: '💰 Check Wallet Balance',
      description: 'See how much USDC and KITE you have',
      action: 'kpass wallet balance',
      expectedOutcome: 'Display of available tokens and balances',
      nextStep: 'profile-3',
      tips: [
        'Balances update in real-time',
        'Shows both test and production tokens',
        'Testnet: use /faucet for free tokens',
      ],
    },
    {
      stepId: 'profile-3',
      title: '🆔 You\'re Ready!',
      description: 'Profile setup complete. Ready to transfer or explore services.',
      expectedOutcome: 'Full account access enabled',
      tips: [
        'Next: Try a test transfer to learn the platform',
        'Or explore available services with /discover',
        'Questions? Use /help for command guide',
      ],
    },
  ],
  first_transfer: [
    {
      stepId: 'transfer-1',
      title: '📤 Prepare Transfer',
      description: 'Gather recipient address and amount',
      expectedOutcome: 'Know exact recipient wallet and amount',
      tips: [
        'Recipient address must start with 0x and be 42 chars',
        'Double-check address - transfers are permanent',
        'Test with small amount first',
      ],
    },
    {
      stepId: 'transfer-2',
      title: '✉️ Send Transfer',
      description: 'Execute the token transfer',
      action: 'kpass wallet send --to <address> --amount <n> --asset USDC',
      expectedOutcome: 'Transaction hash and confirmation',
      nextStep: 'transfer-3',
      tips: [
        'Transfers are instant',
        'Save transaction hash for tracking',
        'Transaction appears in your /activity history',
      ],
    },
    {
      stepId: 'transfer-3',
      title: '✅ Verify Arrival',
      description: 'Check that recipient received the funds',
      action: '/activity',
      expectedOutcome: 'Transaction shown as completed',
      tips: [
        'Transaction shows amount, recipient, timestamp',
        'Status always shows as "completed" when confirmed',
        'Recipient address shown (first 10 chars for privacy)',
      ],
    },
  ],
  agent_registration: [
    {
      stepId: 'agent-1',
      title: '🤖 Understand Agents',
      description: 'Agents are autonomous bots you authorize to spend on your behalf',
      expectedOutcome: 'Understand agent concept',
      tips: [
        'Each agent has a type (trader, collector, farmer, custom)',
        'You approve spending limits per agent',
        'Agents follow your budget rules',
      ],
    },
    {
      stepId: 'agent-2',
      title: '📝 Register Agent',
      description: 'Create and register a new agent',
      action: 'kpass agent:register --type trader',
      expectedOutcome: 'Agent ID returned and registered',
      nextStep: 'agent-3',
      tips: [
        'Type defines agent\'s purpose and capabilities',
        'Multiple agents supported (one trader, one collector, etc.)',
        'Each gets own spending session',
      ],
    },
    {
      stepId: 'agent-3',
      title: '📊 List Your Agents',
      description: 'View all registered agents and their status',
      action: 'kpass user agents --output json',
      expectedOutcome: 'List of agents with types and session status',
      tips: [
        'Shows active, expired, and pending sessions',
        'Each agent shown with creation date',
        'Monitor spending via agent activity',
      ],
    },
  ],
  session_creation: [
    {
      stepId: 'session-1',
      title: '💳 Understand Sessions',
      description: 'Sessions authorize agents to spend within limits you set',
      expectedOutcome: 'Understand session concept',
      tips: [
        'Session = spending authorization with limits',
        'You set max per-transaction amount',
        'You set TTL (1 hour to 7 days)',
        'Approve session via passkey on phone',
      ],
    },
    {
      stepId: 'session-2',
      title: '🔓 Create Session',
      description: 'Request approval to let agent spend your money',
      action: 'kpass agent:session create --max-amount-per-tx 100 --ttl 24h',
      expectedOutcome: 'Session request created, waiting for approval',
      nextStep: 'session-3',
      tips: [
        'max-amount-per-tx: highest per-call transaction',
        'ttl: how long session stays active',
        'Request shown in /sessions list',
      ],
    },
    {
      stepId: 'session-3',
      title: '⏳ Approve on Phone',
      description: 'Use your phone passkey to approve the spending session',
      expectedOutcome: 'Session approved and active',
      nextStep: 'session-4',
      tips: [
        'Check phone for passkey prompt',
        'Approve to authorize agent spending',
        'Rejection blocks agent action',
        'Can always create new session',
      ],
    },
    {
      stepId: 'session-4',
      title: '✅ Session Active',
      description: 'Your approved session is now ready for agent use',
      action: 'kpass agent:session list --status active',
      expectedOutcome: 'See active sessions with limits',
      tips: [
        'View remaining balance per session',
        'Can create multiple sessions (different agents)',
        'Sessions auto-expire after TTL',
      ],
    },
  ],
  paid_api: [
    {
      stepId: 'api-1',
      title: '🔍 Discover Services',
      description: 'Browse available paid APIs and data services',
      action: 'ksearch services list --limit 10',
      expectedOutcome: 'List of available services with pricing',
      nextStep: 'api-2',
      tips: [
        'Services include image generation, translation, weather',
        'Each shows per-call cost in USDC',
        'Preview before spending',
      ],
    },
    {
      stepId: 'api-2',
      title: '📊 Service Details',
      description: 'View full details and pricing of a service',
      action: 'ksearch services get --service-id <service-id>',
      expectedOutcome: 'Full service description and API docs',
      tips: [
        'Shows request/response examples',
        'Per-call cost and rate limits',
        'Authentication details',
      ],
    },
    {
      stepId: 'api-3',
      title: '💰 Make Paid Call',
      description: 'Use session to call paid API (x402 protocol)',
      action: 'kpass agent:session execute --url <api-url> --method GET --output json',
      expectedOutcome: 'API response + automatic payment',
      tips: [
        'Payment deducted from session budget',
        'Transaction recorded in activity',
        'Amount shown: cost per call',
      ],
    },
  ],
};

// === Tutorial Definitions ===

const TUTORIAL_LESSONS: Record<TutorialType, { title: string; lessons: string[] }> = {
  [TutorialType.WALLET_OVERVIEW]: {
    title: 'Wallet Basics - 5 minutes',
    lessons: [
      'What is a wallet and addresses?',
      'Understanding USDC and KITE tokens',
      'Checking your balance safely',
      'Transaction history overview',
    ],
  },
  [TutorialType.TRANSFERS]: {
    title: 'Making Your First Transfer - 10 minutes',
    lessons: [
      'Preparation: Gather recipient address',
      'Execute: Send tokens safely',
      'Verification: Confirm receipt',
      'Security: Best practices',
    ],
  },
  [TutorialType.AGENTS]: {
    title: 'Agents: Autonomous Helpers - 15 minutes',
    lessons: [
      'What are agents and why use them?',
      'Agent types and capabilities',
      'Registering your first agent',
      'Monitoring agent activity',
    ],
  },
  [TutorialType.SESSIONS]: {
    title: 'Spending Sessions: Smart Authorization - 12 minutes',
    lessons: [
      'Session concept and benefits',
      'Setting spending limits',
      'TTL and expiration',
      'Approving sessions via passkey',
    ],
  },
  [TutorialType.BUDGETS]: {
    title: 'Budget Management: Stay in Control - 10 minutes',
    lessons: [
      'Understanding daily/weekly/monthly budgets',
      'Setting budget limits',
      'Budget enforcement',
      'Tracking spending vs limits',
    ],
  },
  [TutorialType.CONFIRMATIONS]: {
    title: 'Confirmations: Security Check - 8 minutes',
    lessons: [
      'When confirmations are required',
      'Receiving and entering codes',
      'Code expiration and retry limits',
      'Confirmation status tracking',
    ],
  },
  [TutorialType.FULL_WALKTHROUGH]: {
    title: 'Complete Platform Walkthrough - 60 minutes',
    lessons: [
      'Account setup and authentication',
      'Wallet navigation and balance',
      'First transfer (end-to-end)',
      'Agent registration and setup',
      'Creating your first session',
      'Making paid API calls',
      'Viewing activity and history',
      'Safety features and best practices',
    ],
  },
};

// === Main Functions ===

/**
 * Initialize onboarding for new user
 */
export async function initializeOnboarding(userId: number): Promise<UserOnboarding> {
  const profile = await readUserProfile(userId, config.userDataRoot);

  const onboarding: UserOnboarding = {
    userId,
    firstLoginAt: Date.now(),
    completedFlows: [],
    tutorials: [],
    userLevel: 'beginner',
    completionPercentage: 0,
  };

  profile.onboarding = onboarding;
  await writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId, onboarding }, 'Onboarding initialized for new user');

  return onboarding;
}

/**
 * Get user's current onboarding status
 */
export async function getOnboardingStatus(userId: number): Promise<UserOnboarding | null> {
  const profile = await readUserProfile(userId, config.userDataRoot);
  return profile.onboarding || null;
}

/**
 * Start a new onboarding flow
 */
export async function startFlow(userId: number, flow: OnboardingFlow): Promise<OnboardingFlowRecord> {
  const profile = await readUserProfile(userId, config.userDataRoot);
  const onboarding = profile.onboarding || (await initializeOnboarding(userId));

  const steps = ONBOARDING_FLOWS[flow];
  if (!steps || steps.length === 0) {
    throw new Error(`Unknown onboarding flow: ${flow}`);
  }

  const flowRecord: OnboardingFlowRecord = {
    flow: flow as unknown as string,
    startedAt: Date.now(),
    currentStep: steps[0].stepId,
    completedSteps: [],
  };

  onboarding.activeFlow = flowRecord;
  profile.onboarding = onboarding;
  await writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId, flow }, 'Onboarding flow started');

  return flowRecord;
}

/**
 * Complete current step and advance to next
 */
export async function completeStep(userId: number): Promise<string | null> {
  const profile = await readUserProfile(userId, config.userDataRoot);
  const onboarding = profile.onboarding;

  if (!onboarding?.activeFlow) {
    throw new Error('No active onboarding flow');
  }

  const flowSteps = ONBOARDING_FLOWS[onboarding.activeFlow.flow as OnboardingFlow];
  const currentStepIndex = flowSteps.findIndex((s) => s.stepId === onboarding.activeFlow!.currentStep);

  if (currentStepIndex < 0) {
    throw new Error('Current step not found');
  }

  onboarding.activeFlow.completedSteps.push(onboarding.activeFlow.currentStep);

  const nextStep = flowSteps[currentStepIndex + 1];
  if (nextStep) {
    onboarding.activeFlow.currentStep = nextStep.stepId;
  } else {
    // Flow completed
    onboarding.activeFlow.completedAt = Date.now();
    onboarding.completedFlows.push(onboarding.activeFlow);
    onboarding.activeFlow = undefined;

    // Update user level based on completed flows
    updateUserLevel(onboarding);
  }

  profile.onboarding = onboarding;
  await writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId, step: onboarding.activeFlow?.currentStep }, 'Onboarding step completed');

  return onboarding.activeFlow?.currentStep || null;
}

/**
 * Skip current flow
 */
export async function skipFlow(userId: number): Promise<void> {
  const profile = await readUserProfile(userId, config.userDataRoot);
  const onboarding = profile.onboarding;

  if (!onboarding?.activeFlow) {
    throw new Error('No active onboarding flow');
  }

  onboarding.activeFlow.skipped = true;
  onboarding.activeFlow.completedAt = Date.now();
  onboarding.completedFlows.push(onboarding.activeFlow);
  onboarding.activeFlow = undefined;

  profile.onboarding = onboarding;
  await writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId }, 'Onboarding flow skipped');
}

/**
 * Get current step details
 */
export async function getCurrentStep(userId: number): Promise<OnboardingStep | null> {
  const profile = await readUserProfile(userId, config.userDataRoot);
  const onboarding = profile.onboarding;

  if (!onboarding?.activeFlow) {
    return null;
  }

  const flowSteps = ONBOARDING_FLOWS[onboarding.activeFlow.flow as OnboardingFlow];
  return flowSteps.find((s) => s.stepId === onboarding.activeFlow!.currentStep) || null;
}

/**
 * Enroll user in tutorial
 */
export async function enrollTutorial(userId: number, tutorial: TutorialType): Promise<TutorialProgress> {
  const profile = await readUserProfile(userId, config.userDataRoot);
  const onboarding = profile.onboarding || (await initializeOnboarding(userId));

  // Explicitly type 't' as TutorialProgress
  const existing = onboarding.tutorials.find((t: TutorialProgress) => t.tutorial === tutorial);
  if (existing) {
    return existing;
  }

  const tutorialProgress: TutorialProgress = {
    tutorial,
    enrolledAt: Date.now(),
    currentLesson: 0,
    completedLessons: [],
    quizScores: {},
  };

  onboarding.tutorials.push(tutorialProgress);
  profile.onboarding = onboarding;
  await writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId, tutorial }, 'User enrolled in tutorial');

  return tutorialProgress;
}

/**
 * Complete tutorial lesson
 */
export async function completeLessonInTutorial(
  userId: number,
  tutorial: TutorialType,
  quizScore?: number,
): Promise<boolean> {
  const profile = await readUserProfile(userId, config.userDataRoot);
  const onboarding = profile.onboarding;

  if (!onboarding) {
    throw new Error('User not onboarded');
  }

  // Explicitly type 't' as TutorialProgress
  const tutorialProgress = onboarding.tutorials.find((t: TutorialProgress) => t.tutorial === tutorial);
  if (!tutorialProgress) {
    throw new Error('Not enrolled in tutorial');
  }

  const lessons = TUTORIAL_LESSONS[tutorial];
  if (!lessons) {
    throw new Error('Tutorial not found');
  }

  tutorialProgress.completedLessons.push(tutorialProgress.currentLesson);
  if (quizScore !== undefined) {
    tutorialProgress.quizScores![tutorialProgress.currentLesson] = quizScore;
  }

  tutorialProgress.currentLesson++;

  const isComplete = tutorialProgress.currentLesson >= lessons.lessons.length;
  if (isComplete) {
    tutorialProgress.certificateIssued = true;
    updateUserLevel(onboarding);
  }

  profile.onboarding = onboarding;
  await writeUserProfile(userId, config.userDataRoot, profile);

  logger.info({ userId, tutorial, isComplete }, 'Tutorial lesson completed');

  return isComplete;
}

/**
 * Get tutorial progress
 */
export async function getTutorialProgress(
  userId: number,
  tutorial: TutorialType,
): Promise<{ lessons: string[]; current: number; completed: number; isComplete: boolean } | null> {
  const profile = await readUserProfile(userId, config.userDataRoot);
  const onboarding = profile.onboarding;

  if (!onboarding) {
    return null;
  }

  // Explicitly type 't' as TutorialProgress
  const tutorialProgress = onboarding.tutorials.find((t: TutorialProgress) => t.tutorial === tutorial);
  if (!tutorialProgress) {
    return null;
  }

  const lessons = TUTORIAL_LESSONS[tutorial];
  if (!lessons) {
    return null;
  }

  const isComplete = tutorialProgress.currentLesson >= lessons.lessons.length;

  return {
    lessons: lessons.lessons,
    current: tutorialProgress.currentLesson,
    completed: tutorialProgress.completedLessons.length,
    isComplete,
  };
}


/**
 * Format step for Telegram display
 */
export function formatStep(step: OnboardingStep): string {
  let msg = `<b>${step.title}</b>\n\n`;
  msg += `${step.description}\n\n`;

  if (step.action) {
    msg += `<code>${step.action}</code>\n\n`;
  }

  if (step.expectedOutcome) {
    msg += `✅ <b>Expected:</b> ${step.expectedOutcome}\n\n`;
  }

  if (step.tips && step.tips.length > 0) {
    msg += '<b>💡 Tips:</b>\n';
    step.tips.forEach((tip) => {
      msg += `• ${tip}\n`;
    });
  }

  return msg;
}

/**
 * Format onboarding status for display
 */
export function formatOnboardingStatus(onboarding: UserOnboarding): string {
  let msg = `<b>👤 Your Onboarding Progress</b>\n\n`;

  msg += `<b>Level:</b> ${onboarding.userLevel === 'beginner' ? '🟢 Beginner' : onboarding.userLevel === 'intermediate' ? '🟡 Intermediate' : '🔵 Advanced'}\n`;
  msg += `<b>Completion:</b> ${onboarding.completionPercentage}%\n\n`;

  if (onboarding.activeFlow) {
    msg += `<b>📍 Current Flow:</b> ${formatFlowName(onboarding.activeFlow.flow)}\n`;
    msg += `   Steps: ${onboarding.activeFlow.completedSteps.length + 1}/? \n\n`;
  }

  if (onboarding.completedFlows.length > 0) {
    msg += `<b>✅ Completed Flows:</b>\n`;
    onboarding.completedFlows.forEach((flow) => {
      const flowName = formatFlowName(flow.flow);
      const status = flow.skipped ? '⏭️ Skipped' : '✅ Completed';
      msg += `• ${flowName} ${status}\n`;
    });
    msg += '\n';
  }

  if (onboarding.tutorials.length > 0) {
    msg += `<b>📚 Tutorials Enrolled:</b>\n`;
    onboarding.tutorials.forEach((tut) => {
      const progress = `${tut.completedLessons.length + 1}/?`;
      const cert = tut.certificateIssued ? '🏆' : '';
      msg += `• ${tut.tutorial} (${progress}) ${cert}\n`;
    });
  }

  return msg;
}

/**
 * Format tutorial progress for display
 */
export function formatTutorialProgress(
  tutorial: TutorialType,
  progress: { lessons: string[]; current: number; completed: number; isComplete: boolean },
): string {
  const lessons = TUTORIAL_LESSONS[tutorial];
  if (!lessons) return 'Tutorial not found';

  let msg = `<b>${lessons.title}</b>\n\n`;
  msg += `Progress: ${progress.completed}/${lessons.lessons.length} lessons\n`;
  msg += `Current: Lesson ${progress.current + 1}\n\n`;

  msg += `<b>📚 Lessons:</b>\n`;
  lessons.lessons.forEach((lesson, idx) => {
    const isDone = idx < progress.current;
    const isCurrent = idx === progress.current;
    const icon = isDone ? '✅' : isCurrent ? '▶️' : '⭕';
    msg += `${icon} ${idx + 1}. ${lesson}\n`;
  });

  if (progress.isComplete) {
    msg += '\n🏆 <b>Tutorial Complete!</b> You earned a certificate.';
  }

  return msg;
}

// === Helpers ===

function updateUserLevel(onboarding: UserOnboarding): void {
  const flowCount = onboarding.completedFlows.length;
  const tutCount = onboarding.tutorials.filter((t) => t.certificateIssued).length;

  if (flowCount >= 5 && tutCount >= 3) {
    onboarding.userLevel = 'advanced';
  } else if (flowCount >= 3 || tutCount >= 1) {
    onboarding.userLevel = 'intermediate';
  } else {
    onboarding.userLevel = 'beginner';
  }

  onboarding.completionPercentage = Math.min(
    100,
    Math.floor(((flowCount + tutCount * 2) / 14) * 100),
  );
}

function formatFlowName(flow: string): string {
  return flow
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
