import { mutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";

/**
 * Migration: Fix clientRoles clientId type
 * 
 * This migration updates all projects where clientRoles[].clientId is stored as a string
 * to use proper Id<"clients"> type.
 * 
 * It also triggers syncProjectSummariesToClient for each affected client to ensure
 * the intelligence system is properly updated.
 * 
 * Run this migration after updating the schema to use v.id("clients") for clientRoles.clientId
 */
export const fixClientRolesIds = mutation({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    
    let updatedCount = 0;
    let skippedCount = 0;
    const affectedClientIds = new Set<string>();
    
    for (const project of projects) {
      if (!project.clientRoles || project.clientRoles.length === 0) {
        skippedCount++;
        continue;
      }
      
      // Check if any clientId needs to be cast
      // The schema now expects Id<"clients">, but old data might have strings
      // We need to ensure the data is properly typed
      let needsUpdate = false;
      const updatedRoles = project.clientRoles.map(role => {
        // Track this client for sync
        affectedClientIds.add(String(role.clientId));
        
        // The clientId should already be a valid ID string, 
        // but we cast it to ensure type consistency
        return {
          clientId: role.clientId as Id<"clients">,
          role: role.role,
        };
      });
      
      // Update the project with properly typed clientRoles
      await ctx.db.patch(project._id, {
        clientRoles: updatedRoles,
      });
      
      updatedCount++;
    }
    
    // Trigger sync for all affected clients
    for (const clientIdStr of affectedClientIds) {
      try {
        await ctx.scheduler.runAfter(0, api.intelligence.syncProjectSummariesToClient, {
          clientId: clientIdStr as Id<"clients">,
        });
      } catch (error) {
        console.error(`Failed to sync client ${clientIdStr}:`, error);
      }
    }
    
    return {
      totalProjects: projects.length,
      updatedCount,
      skippedCount,
      affectedClients: affectedClientIds.size,
      message: `Migration complete. Updated ${updatedCount} projects, triggered sync for ${affectedClientIds.size} clients.`,
    };
  },
});

/**
 * Dry run version - shows what would be updated without making changes
 */
export const fixClientRolesIdsDryRun = mutation({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    
    const projectsWithRoles: { id: string; name: string; clientRoles: any[] }[] = [];
    const affectedClientIds = new Set<string>();
    
    for (const project of projects) {
      if (!project.clientRoles || project.clientRoles.length === 0) {
        continue;
      }
      
      projectsWithRoles.push({
        id: project._id,
        name: project.name,
        clientRoles: project.clientRoles,
      });
      
      for (const role of project.clientRoles) {
        affectedClientIds.add(String(role.clientId));
      }
    }
    
    return {
      totalProjects: projects.length,
      projectsWithClientRoles: projectsWithRoles.length,
      affectedClients: affectedClientIds.size,
      projects: projectsWithRoles.slice(0, 10), // Show first 10 for preview
      message: `Dry run complete. Would update ${projectsWithRoles.length} projects and sync ${affectedClientIds.size} clients.`,
    };
  },
});
