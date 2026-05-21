/**
 * AUTHENTICATION FLOW TEST
 * 
 * This file tests the exact authentication flow to identify where
 * the "❌ Not authenticated" error is coming from.
 * 
 * Run: npm run build && npm run test -- src/tests/authFlowTest.ts
 */

import fs from "fs";
import path from "path";
import { config } from "../config";
import { readUserProfile, writeUserProfile, ensureUserPaths } from "../storage";

const TEST_USER_ID = parseInt(process.env.TEST_USER_ID || "999888777");

async function runAuthenticationFlowTest() {
  console.log("\n🔐 AUTHENTICATION FLOW TEST");
  console.log("═".repeat(70));
  console.log(`USER_DATA_ROOT: ${config.userDataRoot}`);
  console.log(`TEST_USER_ID: ${TEST_USER_ID}`);

  try {
    // STEP 1: Ensure paths exist
    console.log("\n[STEP 1] Ensuring user paths exist...");
    const paths = ensureUserPaths(TEST_USER_ID, config.userDataRoot);
    console.log(`✓ User paths created`);
    console.log(`  Root: ${paths.root}`);
    console.log(`  Profile file: ${paths.profileFile}`);

    // STEP 2: Read initial profile
    console.log("\n[STEP 2] Reading initial profile...");
    let profile = readUserProfile(TEST_USER_ID, config.userDataRoot);
    console.log(`✓ Profile read successfully`);
    console.log(`  telegramId: ${profile.telegramId}`);
    console.log(`  identity exists: ${!!profile.identity}`);
    console.log(`  identity.passportId: ${profile.identity?.passportId || "(not set)"}`);

    // STEP 3: Simulate what handleVerify does
    console.log("\n[STEP 3] Simulating handleVerify()...");
    console.log("  Setting profile.identity.passportId = 'user_test_12345'");
    profile.identity = {
      passportId: "user_test_12345",
      walletId: undefined,
      label: "test@example.com",
    };
    profile.telegramId = TEST_USER_ID;
    delete profile.pendingAuth;

    // STEP 4: Write profile (what writeUserProfile does)
    console.log("\n[STEP 4] Writing profile to disk...");
    writeUserProfile(TEST_USER_ID, config.userDataRoot, profile);
    console.log(`✓ Profile written to: ${paths.profileFile}`);

    // STEP 5: Verify file was actually written
    console.log("\n[STEP 5] Verifying file was written...");
    const fileExists = fs.existsSync(paths.profileFile);
    console.log(`  File exists: ${fileExists ? "✅ YES" : "❌ NO"}`);
    
    if (fileExists) {
      const fileContent = fs.readFileSync(paths.profileFile, "utf-8");
      const fileSize = fileContent.length;
      console.log(`  File size: ${fileSize} bytes`);
      const fileProfile = JSON.parse(fileContent);
      console.log(`  File contains passportId: ${!!fileProfile.identity?.passportId ? "✅ YES" : "❌ NO"}`);
    }

    // STEP 6: Simulate what assertAuthentication does
    console.log("\n[STEP 6] Simulating assertAuthentication()...");
    const readProfile = readUserProfile(TEST_USER_ID, config.userDataRoot);
    const isAuthenticated = readProfile && readProfile.identity && readProfile.identity.passportId;
    console.log(`  Read profile.identity: ${readProfile.identity ? "✅ EXISTS" : "❌ MISSING"}`);
    console.log(`  Read passportId: ${readProfile.identity?.passportId || "❌ NOT SET"}`);
    console.log(`  isAuthenticated result: ${isAuthenticated ? "✅ TRUE" : "❌ FALSE"}`);

    // FINAL RESULT
    console.log("\n" + "═".repeat(70));
    if (isAuthenticated) {
      console.log("✅ SUCCESS: Authentication flow works correctly!");
      console.log("   Profile is properly saved and readable.");
    } else {
      console.log("❌ FAILURE: Authentication flow is broken!");
      console.log("   Either write or read is failing.");
      console.log("\n   Debugging info:");
      console.log(`   - readProfile.identity: ${JSON.stringify(readProfile.identity)}`);
    }
    console.log("═".repeat(70) + "\n");

  } catch (error: any) {
    console.error("\n❌ ERROR during test:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  runAuthenticationFlowTest().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
}

export { runAuthenticationFlowTest };
