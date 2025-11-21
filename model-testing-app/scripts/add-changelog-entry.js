/**
 * Simple script to add a changelog entry
 * Usage: node scripts/add-changelog-entry.js
 */

const entry = {
  title: "Changelog Feature & System Improvements",
  description: "Added comprehensive in-app changelog system accessible from Settings page. Users can now track all application updates with detailed version history, change types, and affected features. Fixed chat sessions user isolation to ensure secure multi-user support where each user only sees their own sessions. Enhanced documents library with improved table functionality and better organization. Resolved multiple TypeScript build errors and improved overall code quality.",
  pagesAffected: ["Settings", "Changelog"],
  featuresAffected: ["Changelog", "Chat", "Documents", "Notifications"]
};

console.log("To add this changelog entry, run:");
console.log(`npx convex run changelog:add '${JSON.stringify(entry)}'`);

