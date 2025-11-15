import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * Sync pipelines and stages from HubSpot
 * This stores the pipeline/stage definitions so we can map IDs to names
 */
export const syncPipelinesAndStages = mutation({
  args: {
    pipelines: v.array(v.object({
      pipelineId: v.string(),
      pipelineName: v.string(),
      displayOrder: v.number(),
      stages: v.array(v.object({
        stageId: v.string(),
        stageName: v.string(),
        displayOrder: v.number(),
        metadata: v.optional(v.any()),
      })),
    })),
  },
  handler: async (ctx, args) => {
    let synced = 0;
    let updated = 0;
    let created = 0;
    
    for (const pipeline of args.pipelines) {
      // Check if pipeline already exists
      const existing = await ctx.db
        .query("hubspotPipelines")
        .withIndex("by_pipeline_id", (q) => q.eq("pipelineId", pipeline.pipelineId))
        .first();
      
      if (existing) {
        // Update existing pipeline
        await ctx.db.patch(existing._id, {
          pipelineName: pipeline.pipelineName,
          displayOrder: pipeline.displayOrder,
          stages: pipeline.stages,
          lastSyncedAt: new Date().toISOString(),
        });
        updated++;
      } else {
        // Create new pipeline
        await ctx.db.insert("hubspotPipelines", {
          pipelineId: pipeline.pipelineId,
          pipelineName: pipeline.pipelineName,
          displayOrder: pipeline.displayOrder,
          stages: pipeline.stages,
          lastSyncedAt: new Date().toISOString(),
        });
        created++;
      }
      synced++;
    }
    
    return { synced, created, updated };
  },
});

/**
 * Get stage name from stage ID
 */
export const getStageName = query({
  args: {
    stageId: v.string(),
  },
  handler: async (ctx, args) => {
    const pipelines = await ctx.db.query("hubspotPipelines").collect();
    
    for (const pipeline of pipelines) {
      const stage = pipeline.stages.find(s => s.stageId === args.stageId);
      if (stage) {
        return {
          stageName: stage.stageName,
          pipelineName: pipeline.pipelineName,
          pipelineId: pipeline.pipelineId,
        };
      }
    }
    
    return null;
  },
});

/**
 * Get pipeline name from pipeline ID
 */
export const getPipelineName = query({
  args: {
    pipelineId: v.string(),
  },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db
      .query("hubspotPipelines")
      .withIndex("by_pipeline_id", (q) => q.eq("pipelineId", args.pipelineId))
      .first();
    
    return pipeline ? pipeline.pipelineName : null;
  },
});

/**
 * Update existing deals with stageName and pipelineName from stored mappings
 */
export const updateDealsWithStageAndPipelineNames = mutation({
  args: {},
  handler: async (ctx) => {
    const deals = await ctx.db.query("deals").collect();
    const pipelines = await ctx.db.query("hubspotPipelines").collect();
    
    // Create a map of stage ID to stage info
    const stageMap = new Map<string, { stageName: string; pipelineName: string; pipelineId: string }>();
    for (const pipeline of pipelines) {
      for (const stage of pipeline.stages) {
        stageMap.set(stage.stageId, {
          stageName: stage.stageName,
          pipelineName: pipeline.pipelineName,
          pipelineId: pipeline.pipelineId,
        });
      }
    }
    
    let updated = 0;
    let skipped = 0;
    
    for (const deal of deals) {
      let needsUpdate = false;
      const updateData: any = {};
      
      // Update stageName if we have the stage ID
      if (deal.stage && stageMap.has(deal.stage)) {
        const stageInfo = stageMap.get(deal.stage)!;
        if (deal.stageName !== stageInfo.stageName) {
          updateData.stageName = stageInfo.stageName;
          needsUpdate = true;
        }
      }
      
      // Update pipelineName if we have the pipeline ID
      if (deal.pipeline) {
        const pipeline = pipelines.find(p => p.pipelineId === deal.pipeline);
        if (pipeline && deal.pipelineName !== pipeline.pipelineName) {
          updateData.pipelineName = pipeline.pipelineName;
          needsUpdate = true;
        }
      }
      
      // If we have stage info, also update pipelineName from stage mapping
      if (deal.stage && stageMap.has(deal.stage)) {
        const stageInfo = stageMap.get(deal.stage)!;
        if (deal.pipelineName !== stageInfo.pipelineName) {
          updateData.pipelineName = stageInfo.pipelineName;
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        await ctx.db.patch(deal._id, updateData);
        updated++;
      } else {
        skipped++;
      }
    }
    
    return { updated, skipped, total: deals.length };
  },
});

