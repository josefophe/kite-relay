import fs from "fs";
import path from "path";
import { logger } from "./logger";

export interface PendingAuth {
  loginId?: string;
  signupId?: string;
  email: string;
  createdAt: number;
}

export interface UserProfile {
  telegramId: number;
  createdAt: string;
  lastSeenAt: string;
  phone?: string;          // 👈 Added for the new feature
  contact?: {               // 👈 Added for the new feature
    phone?: string;
  };
  identity?: {
    passportId?: string;
    walletId?: string;
    label?: string;
  };
  preferences: {
    locale: string;
    defaultWallet?: string;
  };
  history: {
    searches: string[];
    commands: string[];
    balances: string[];
  };
  telegramUsername?: string;
  pendingAuth?: PendingAuth;

  budgets?: {
    daily?: any;
    weekly?: any;
    monthly?: any;
  };

  pendingConfirmations?: any[]; // For confirmationService.ts
  rateLimitRecords?: any[];     // For rateLimitService.ts
  firstTimeTracking?: {
    shownPrompts: string[];
    dismissedPrompts: string[];
    lastShownAt?: number;
  };
  onboarding?: any; // onboarding state is managed by onboardingService and may contain nested progress data

  transactions?: any[]; // For transactionHistoryService.ts
}

export interface UserPaths {
  root: string;
  config: string;
  sessions: string;
  cache: string;
  logs: string;
  temp: string;
  workspace: string;
  profileFile: string;
}

export function getUserPaths(userId: number, userDataRoot: string): UserPaths {
  const root = path.resolve(userDataRoot, String(userId));
  return {
    root,
    config: path.join(root, "config"),
    sessions: path.join(root, "sessions"),
    cache: path.join(root, "cache"),
    logs: path.join(root, "logs"),
    temp: path.join(root, "temp"),
    workspace: path.join(root, "workspace"),
    profileFile: path.join(root, "profile.json"),
  };
}

export function ensureUserPaths(userId: number, userDataRoot: string): UserPaths {
  const paths = getUserPaths(userId, userDataRoot);
  try {
    for (const directory of [paths.root, paths.config, paths.sessions, paths.cache, paths.logs, paths.temp, paths.workspace]) {
      if (!fs.existsSync(directory)) {
        try {
          // FIX: Open folder access parameters so internal sub-processes can read across boundaries
          fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
          logger.debug({ userId, directory }, "created user directory");
        } catch (error: unknown) {
          const err = error as { code?: string; path?: string };
          if (err.code === "EACCES") {
            logger.error(
              { userId, directory, userDataRoot, error: err.code },
              `Permission denied creating user directory. Ensure ${userDataRoot} exists and is writable by the process.`
            );
          }
          throw error;
        }
      }
    }
    if (!fs.existsSync(paths.profileFile)) {
      const profile: UserProfile = {
        telegramId: userId,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        preferences: { locale: "en-US" },
        history: { searches: [], commands: [], balances: [] },
      };
      fs.writeFileSync(paths.profileFile, JSON.stringify(profile, null, 2), { mode: 0o600 });
    }
  } catch (error: unknown) {
    logger.error({ userId, userDataRoot, error }, "Failed to ensure user paths");
    throw error;
  }
  return paths;
}

export function readUserProfile(userId: number, userDataRoot: string): UserProfile {
  const paths = ensureUserPaths(userId, userDataRoot);
  const raw = fs.readFileSync(paths.profileFile, "utf-8");
  return JSON.parse(raw) as UserProfile;
}

export function writeUserProfile(userId: number, userDataRoot: string, profile: UserProfile): void {
  const paths = ensureUserPaths(userId, userDataRoot);
  fs.writeFileSync(paths.profileFile, JSON.stringify(profile, null, 2), { mode: 0o600 });
}

export function appendUserHistory(userId: number, userDataRoot: string, action: string, payload: string): void {
  const profile = readUserProfile(userId, userDataRoot);
  profile.lastSeenAt = new Date().toISOString();
  profile.history.commands.push(`${new Date().toISOString()} ${action}`);
  if (action === "search") {
    profile.history.searches.push(payload);
  }
  if (action === "balance") {
    profile.history.balances.push(payload);
  }
  writeUserProfile(userId, userDataRoot, profile);
}
