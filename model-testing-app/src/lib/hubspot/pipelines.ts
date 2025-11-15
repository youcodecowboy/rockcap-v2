/**
 * Fetch HubSpot pipeline and stage definitions
 * This allows us to map stage IDs to stage names
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export interface HubSpotPipelineStage {
  id: string;
  label: string;
  displayOrder: number;
  metadata?: Record<string, any>;
}

export interface HubSpotPipeline {
  id: string;
  label: string;
  displayOrder: number;
  stages: HubSpotPipelineStage[];
}

/**
 * Fetch all deal pipelines and their stages
 */
export async function fetchDealPipelines(): Promise<HubSpotPipeline[]> {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    throw new Error('HUBSPOT_API_KEY not found in environment variables');
  }

  try {
    const response = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/pipelines/deals`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch pipelines: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // The API returns results array with pipeline objects
    const pipelines = data.results || [];
    
    return pipelines.map((pipeline: any) => ({
      id: pipeline.id,
      label: pipeline.label,
      displayOrder: pipeline.displayOrder || 0,
      stages: (pipeline.stages || []).map((stage: any) => ({
        id: stage.id,
        label: stage.label,
        displayOrder: stage.displayOrder || 0,
        metadata: stage.metadata || {},
      })),
    }));
  } catch (error: any) {
    console.error('Error fetching deal pipelines:', error);
    throw error;
  }
}

/**
 * Create a map of stage ID to stage name for quick lookup
 */
export async function createStageIdToNameMap(): Promise<Map<string, { stageName: string; pipelineName: string; pipelineId: string }>> {
  const pipelines = await fetchDealPipelines();
  const stageMap = new Map<string, { stageName: string; pipelineName: string; pipelineId: string }>();
  
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      stageMap.set(stage.id, {
        stageName: stage.label,
        pipelineName: pipeline.label,
        pipelineId: pipeline.id,
      });
    }
  }
  
  return stageMap;
}

/**
 * Get stage name from stage ID
 */
export async function getStageNameFromId(stageId: string): Promise<string | null> {
  try {
    const stageMap = await createStageIdToNameMap();
    const stageInfo = stageMap.get(stageId);
    return stageInfo?.stageName || null;
  } catch (error) {
    console.error('Error getting stage name:', error);
    return null;
  }
}

