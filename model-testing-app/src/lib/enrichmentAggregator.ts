import { ProspectingContext } from '@/types';
import { getProspectingContextByClient } from './prospectingStorage';

export interface AggregatedProspectingData {
  keyPoints: string[];
  painPoints: string[];
  opportunities: string[];
  decisionMakers: Array<{
    name: string;
    role?: string;
    context?: string;
  }>;
  businessContext: {
    industry?: string;
    companySize?: string;
    growthIndicators?: string[];
    challenges?: string[];
    goals?: string[];
  };
  financialContext?: {
    budgetMentioned?: boolean;
    budgetRange?: string;
    investmentLevel?: string;
    timeline?: string;
  };
  relationshipContext?: {
    currentStage?: string;
    relationshipStrength?: string;
    lastInteraction?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
  templateSnippets?: {
    opening?: string;
    valueProposition?: string;
    callToAction?: string;
  };
  confidence: number;
}

export function aggregateProspectingDataForClient(clientId: string): AggregatedProspectingData | null {
  const contexts = getProspectingContextByClient(clientId);
  
  if (contexts.length === 0) {
    return null;
  }
  
  // Aggregate key points (top 5)
  const allKeyPoints = contexts.flatMap(ctx => ctx.keyPoints || []);
  const keyPointsMap = new Map<string, number>();
  allKeyPoints.forEach(point => {
    keyPointsMap.set(point, (keyPointsMap.get(point) || 0) + 1);
  });
  const topKeyPoints = Array.from(keyPointsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([point]) => point);
  
  // Aggregate pain points (top 3)
  const allPainPoints = contexts.flatMap(ctx => ctx.painPoints || []);
  const painPointsMap = new Map<string, number>();
  allPainPoints.forEach(point => {
    painPointsMap.set(point, (painPointsMap.get(point) || 0) + 1);
  });
  const topPainPoints = Array.from(painPointsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([point]) => point);
  
  // Aggregate opportunities (top 3)
  const allOpportunities = contexts.flatMap(ctx => ctx.opportunities || []);
  const opportunitiesMap = new Map<string, number>();
  allOpportunities.forEach(opp => {
    opportunitiesMap.set(opp, (opportunitiesMap.get(opp) || 0) + 1);
  });
  const topOpportunities = Array.from(opportunitiesMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([opp]) => opp);
  
  // Aggregate decision makers (unique by name)
  const decisionMakersMap = new Map<string, { name: string; role?: string; context?: string }>();
  contexts.forEach(ctx => {
    (ctx.decisionMakers || []).forEach(dm => {
      if (!decisionMakersMap.has(dm.name)) {
        decisionMakersMap.set(dm.name, dm);
      }
    });
  });
  const decisionMakers = Array.from(decisionMakersMap.values());
  
  // Merge business context
  const businessContexts = contexts.map(ctx => ctx.businessContext).filter(Boolean);
  const mergedBusinessContext = {
    industry: businessContexts.find(bc => bc?.industry)?.industry,
    companySize: businessContexts.find(bc => bc?.companySize)?.companySize,
    growthIndicators: Array.from(new Set(businessContexts.flatMap(bc => bc?.growthIndicators || []))),
    challenges: Array.from(new Set(businessContexts.flatMap(bc => bc?.challenges || []))),
    goals: Array.from(new Set(businessContexts.flatMap(bc => bc?.goals || []))),
  };
  
  // Get most recent financial context
  const financialContexts = contexts
    .map(ctx => ctx.financialContext)
    .filter(Boolean)
    .sort((a, b) => {
      const ctxA = contexts.find(ctx => ctx.financialContext === a);
      const ctxB = contexts.find(ctx => ctx.financialContext === b);
      return new Date(ctxB?.extractedAt || 0).getTime() - new Date(ctxA?.extractedAt || 0).getTime();
    });
  const financialContext = financialContexts[0];
  
  // Get most recent relationship context
  const relationshipContexts = contexts
    .map(ctx => ctx.relationshipContext)
    .filter(Boolean)
    .sort((a, b) => {
      const ctxA = contexts.find(ctx => ctx.relationshipContext === a);
      const ctxB = contexts.find(ctx => ctx.relationshipContext === b);
      return new Date(ctxB?.extractedAt || 0).getTime() - new Date(ctxA?.extractedAt || 0).getTime();
    });
  const relationshipContext = relationshipContexts[0];
  
  // Get template snippets with highest confidence
  const templateSnippets = contexts
    .map(ctx => ({ snippets: ctx.templateSnippets, confidence: ctx.confidence }))
    .filter(item => item.snippets)
    .sort((a, b) => b.confidence - a.confidence)[0]?.snippets;
  
  // Calculate average confidence
  const avgConfidence = contexts.reduce((sum, ctx) => sum + ctx.confidence, 0) / contexts.length;
  
  return {
    keyPoints: topKeyPoints,
    painPoints: topPainPoints,
    opportunities: topOpportunities,
    decisionMakers,
    businessContext: mergedBusinessContext,
    financialContext,
    relationshipContext,
    templateSnippets,
    confidence: avgConfidence,
  };
}

