import { NextRequest, NextResponse } from 'next/server';
import { fetchDealPipelines } from '@/lib/hubspot/pipelines';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation } from 'convex/nextjs';

/**
 * API route to sync HubSpot pipelines and stages
 * This stores pipeline/stage definitions for ID to name mapping
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.HUBSPOT_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'HUBSPOT_API_KEY not found in environment variables',
      }, { status: 500 });
    }
    
    // Fetch pipelines from HubSpot
    const pipelines = await fetchDealPipelines();
    
    // Transform to the format expected by the mutation
    const pipelinesData = pipelines.map(pipeline => ({
      pipelineId: pipeline.id,
      pipelineName: pipeline.label,
      displayOrder: pipeline.displayOrder,
      stages: pipeline.stages.map(stage => ({
        stageId: stage.id,
        stageName: stage.label,
        displayOrder: stage.displayOrder,
        metadata: stage.metadata,
      })),
    }));
    
    // Sync to Convex
    const result = await fetchMutation(api.hubspotSync.syncPipelinesAndStages as any, {
      pipelines: pipelinesData,
    });
    
    // Update existing deals with stage/pipeline names
    const updateResult = await fetchMutation(api.hubspotSync.updateDealsWithStageAndPipelineNames as any, {});
    
    return NextResponse.json({
      success: true,
      pipelines: {
        synced: result.synced,
        created: result.created,
        updated: result.updated,
      },
      deals: {
        updated: updateResult.updated,
        skipped: updateResult.skipped,
        total: updateResult.total,
      },
    });
  } catch (error: any) {
    console.error('Sync pipelines error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Sync pipelines failed',
    }, { status: 500 });
  }
}

