/**
 * Script to run the fixChatSessionsUserId migration
 * Run with: npx tsx scripts/run-migration-fix-chat-sessions.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL environment variable is not set");
}

async function runMigration() {
  if (!CONVEX_URL) {
    console.error("NEXT_PUBLIC_CONVEX_URL environment variable is not set");
    process.exit(1);
  }
  
  const client = new ConvexHttpClient(CONVEX_URL);
  
  console.log("Running migration: fixChatSessionsUserId");
  
  try {
    // Note: This requires admin access or running via Convex dashboard
    // For now, you can run this via Convex dashboard Functions tab
    // Or use convex run with admin token
    console.log("Migration script created. To run:");
    console.log("1. Go to Convex Dashboard > Functions");
    console.log("2. Find migrations/fixChatSessionsUserId:fixChatSessionsUserId");
    console.log("3. Click 'Run'");
    console.log("\nOr run via CLI:");
    console.log("npx convex run migrations/fixChatSessionsUserId:fixChatSessionsUserId");
  } catch (error) {
    console.error("Error running migration:", error);
  }
}

runMigration();

