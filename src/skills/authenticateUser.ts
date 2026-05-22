/**
 * SKILL WRAPPER: Authenticate User
 *
 * Wraps kpass login/signup commands with:
 * - Setup verification
 * - Input validation
 * - Output parsing
 * - Error handling
 * - Telemetry
 */
import { executeKpass } from "../userRuntime";
import { logger } from "../logger";
import { readUserProfile, writeUserProfile } from "../storage";
import { config } from "../config";
import { SkillExecutionOutput, KiteExitCode } from "./skillTypes";
import { isValidEmail } from "../utils";

export interface AuthenticateUserInput {
  userId: number;
  action: "login" | "signup" | "logout" | "verify" | "me";
  email?: string;
  loginId?: string;
  signupId?: string;
  code?: string;
}

/**
 * Authenticate user with Kite Passport
 *
 * Actions:
 * - login: Initiate login flow
 * - signup: Initiate signup flow
 * - verify: Complete login/signup with OTP
 * - logout: Clear authentication
 * - me: Check current logged-in user
 */
export async function authenticateUserSkill(
  input: AuthenticateUserInput
): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    switch (input.action) {
      case "login":
        return await handleLogin(input.userId, input.email);
      case "signup":
        return await handleSignup(input.userId, input.email);
      case "verify":
        return await handleVerify(
          input.userId,
          input.loginId,
          input.signupId,
          input.code
        );
      case "logout":
        return await handleLogout(input.userId);
      case "me":
        return await handleMe(input.userId);
      default:
        return {
          success: false,
          output: `❌ Unknown action: ${input.action}`,
          exitCode: KiteExitCode.USAGE_ERROR,
        };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        userId: input.userId,
        action: input.action,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      },
      "skill:authenticateUser failed"
    );
    return {
      success: false,
      output: `❌ Authentication error: ${errorMsg}`,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

async function handleLogin(userId: number, email?: string): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!email || !isValidEmail(email)) {
    return {
      success: false,
      output: "❌ Please provide a valid email address",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }
  const sanitized = email.trim().toLowerCase();
  try {
    const output = await executeKpass(
      userId,
      ["login", "init", "--email", sanitized, "--client", "agent", "--output", "json", "--no-interactive"],
      "login-init"
    );
    let loginId = "";
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
      loginId = (responseData.loginId || responseData.login_id || "") as string;
    } catch {
      // Continue even if JSON parse fails
    }

    // Save pending auth
    const profile = readUserProfile(userId, config.userDataRoot);
    profile.pendingAuth = {
      loginId,
      email: sanitized,
      createdAt: Date.now(),
    };
    writeUserProfile(userId, config.userDataRoot, profile);

    return {
      success: true,
      output: `*✅ Login Initiated*\n\nAn OTP was sent to \`${sanitized}\`\.\nPlease check your email inbox and enter the verification code\.`,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("code 4")) {
      return {
        success: false,
        output: `❌ User not found. Please use \`/signup\` instead.`,
        exitCode: KiteExitCode.NOT_FOUND,
      };
    }
    return {
      success: false,
      output: `❌ Login failed: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleSignup(userId: number, email?: string): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!email || !isValidEmail(email)) {
    return {
      success: false,
      output: "❌ Please provide a valid email address",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }
  const sanitized = email.trim().toLowerCase();
  try {
    const output = await executeKpass(
      userId,
      ["signup", "init", "--email", sanitized, "--client", "agent", "--output", "json", "--no-interactive"],
      "signup-init"
    );
    let signupId = "";
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
      signupId = (responseData.signupId || responseData.signup_id || "") as string;
    } catch {
      // Continue even if JSON parse fails
    }

    // Save pending auth
    const profile = readUserProfile(userId, config.userDataRoot);
    profile.pendingAuth = {
      signupId,
      email: sanitized,
      createdAt: Date.now(),
    };
    writeUserProfile(userId, config.userDataRoot, profile);

    return {
      success: true,
      output: `*✅ Signup Initiated*\n\nAccount creation pending for \`${sanitized}\`\.\nPlease check your email for the verification code\.`,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: `❌ Signup failed: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleVerify(
  userId: number,
  loginId?: string,
  signupId?: string,
  code?: string
): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  if (!code) {
    return {
      success: false,
      output: "❌ Please provide verification code",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }
  const sanitizedCode = code.trim();
  let command: string[];
  let commandName: string;
  let envVars: Record<string, string> = {};

  if (loginId) {
    // Use KPASS_LOGIN_CODE env var instead of --code flag for security
    // (env vars are not visible in process listings)
    command = ["login", "verify", "--login-id", loginId, "--output", "json", "--no-interactive"];
    commandName = "login-verify";
    envVars = { KPASS_LOGIN_CODE: sanitizedCode };
  } else if (signupId) {
    // Use KPASS_SIGNUP_CODE env var instead of deprecated --exchange-token flag
    // Per SKILL.md: "--exchange-token flag was removed; use KPASS_SIGNUP_CODE env var instead"
    command = ["signup", "exchange", "--signup-id", signupId, "--output", "json"];
    commandName = "signup-exchange";
    envVars = { KPASS_SIGNUP_CODE: sanitizedCode };
  } else {
    return {
      success: false,
      output: "❌ Please provide loginId or signupId",
      exitCode: KiteExitCode.USAGE_ERROR,
    };
  }

  try {
    const output = await executeKpass(userId, command, commandName, envVars);
    let passportId = `user_${userId}`;
    let email = "authenticated";
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
      passportId = (responseData.sub || responseData.passportId || responseData.user_id || passportId) as string;
      email = (responseData.email || email) as string;
    } catch {
      // Continue even if JSON parse fails
    }

    // Save authenticated profile
    const profile = readUserProfile(userId, config.userDataRoot);
    profile.identity = {
      passportId,
      walletId: undefined,
      label: email,
    };
    delete profile.pendingAuth;
    writeUserProfile(userId, config.userDataRoot, profile);

    return {
      success: true,
      output: `*✅ Authentication Successful\!*\n\nPassport ID: \`${passportId}\``,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("code 3")) {
      return {
        success: false,
        output: "❌ Invalid verification code. Please try again.",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }
    return {
      success: false,
      output: `❌ Verification failed: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleLogout(userId: number): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    await executeKpass(userId, ["logout", "--output", "json"], "logout");
    
    // Clear user profile authentication
    const profile = readUserProfile(userId, config.userDataRoot);
    delete profile.identity;
    delete profile.pendingAuth;
    writeUserProfile(userId, config.userDataRoot, profile);

    return {
      success: true,
      output: "✅ Logged out successfully",
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: `❌ Logout failed: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}

async function handleMe(userId: number): Promise<SkillExecutionOutput> {
  const startTime = Date.now();
  try {
    const output = await executeKpass(userId, ["me", "--output", "json"], "me");
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(output);
    } catch {
      // Continue even if JSON parse fails
    }

    const profile = readUserProfile(userId, config.userDataRoot);
    const passportId = profile.identity?.passportId || "not authenticated";

    return {
      success: true,
      output: `👤 *Current User Account*\n\nPassport ID: \`${passportId}\``,
      rawData: responseData,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("code 3")) {
      return {
        success: false,
        output: "❌ Not authenticated. Please run /login",
        exitCode: KiteExitCode.AUTH_ERROR,
      };
    }
    return {
      success: false,
      output: `❌ Failed to get user info: ${errorMsg}`,
      error: errorMsg,
      exitCode: KiteExitCode.NETWORK_ERROR,
    };
  }
}
