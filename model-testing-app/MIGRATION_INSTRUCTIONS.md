# Migration Instructions: Fix Orphaned Chat Sessions

## Current Issue
There's an old chatSession document without a `userId` field that's blocking schema deployment.

## Steps to Fix

### Step 1: Run the Cleanup Mutation
Run this command to delete orphaned chat sessions:

```bash
npx convex run chatSessions:cleanupOrphanedSessions
```

**Expected output:**
```json
{
  "deletedCount": 1,
  "message": "Deleted 1 orphaned chat session(s)"
}
```

### Step 2: Verify Schema Deployment
After cleanup, the schema should deploy successfully. The `userId` field is now required for all chat sessions.

### Step 3: Test
- Visit `/settings/changelog` - should work now
- Try creating a new chat session - should work correctly
- Verify old orphaned sessions are gone

## What the Cleanup Does
- Finds all chatSessions without a `userId` field
- Deletes all messages associated with those sessions
- Deletes all actions associated with those sessions  
- Deletes the orphaned sessions themselves

## Why This Happened
This occurred because chat sessions were created before user isolation was implemented. The old session doesn't have a `userId` because it was created when that field was optional.

