# Cleanup Orphaned Chat Sessions

## Problem
There's an old chatSession document (ID: `m1716kav2d4apmsyp0scw27w397vt6na`) that doesn't have a `userId` field, which is blocking schema deployment.

## Solution
Run the cleanup mutation to delete orphaned sessions:

### Option 1: Via Convex Dashboard
1. Go to your Convex Dashboard
2. Navigate to Functions tab
3. Find `chatSessions:cleanupOrphanedSessions`
4. Click "Run" (no arguments needed)
5. Check the result - it should show how many sessions were deleted

### Option 2: Via CLI
```bash
npx convex run chatSessions:cleanupOrphanedSessions
```

### Option 3: Via Browser Console (if you have the app open)
```javascript
// In browser console on your app
const result = await convex.mutation(api.chatSessions.cleanupOrphanedSessions, {});
console.log(result);
```

## After Cleanup
Once the cleanup is complete:
1. The schema will be updated to make `userId` required again
2. All future chat sessions will require a userId
3. The changelog functions will be fully available

