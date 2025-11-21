import { internalMutation } from "../_generated/server";

/**
 * Migration: Fix chatSessions without userId
 * Deletes old chatSessions that don't have a userId field
 * These are orphaned sessions from before user isolation was implemented
 */
export const fixChatSessionsUserId = internalMutation({
  handler: async (ctx) => {
    // Get all chatSessions
    const allSessions = await ctx.db.query("chatSessions").collect();
    
    let deletedCount = 0;
    
    for (const session of allSessions) {
      // If session doesn't have userId, delete it and its messages/actions
      if (!session.userId) {
        // Delete all messages in the session
        const messages = await ctx.db
          .query("chatMessages")
          .withIndex("by_session", (q: any) => q.eq("sessionId", session._id))
          .collect();
        
        for (const message of messages) {
          await ctx.db.delete(message._id);
        }
        
        // Delete all actions in the session
        const actions = await ctx.db
          .query("chatActions")
          .withIndex("by_session", (q: any) => q.eq("sessionId", session._id))
          .collect();
        
        for (const action of actions) {
          await ctx.db.delete(action._id);
        }
        
        // Delete the session itself
        await ctx.db.delete(session._id);
        deletedCount++;
      }
    }
    
    return { deletedCount };
  },
});

