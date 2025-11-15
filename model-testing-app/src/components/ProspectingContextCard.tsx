'use client';

import { ProspectingContext } from '@/types';
import { Badge } from '@/components/ui/badge';
import { 
  Lightbulb, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  Building2, 
  DollarSign, 
  Heart, 
  Clock, 
  FileText,
  Target,
  Calendar,
} from 'lucide-react';

interface ProspectingContextCardProps {
  context: ProspectingContext;
  documentName?: string;
}

export default function ProspectingContextCard({
  context,
  documentName,
}: ProspectingContextCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">
            Prospecting Intelligence
          </h3>
          {documentName && (
            <p className="text-sm text-gray-600">From: {documentName}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Extracted: {new Date(context.extractedAt).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {Math.round(context.confidence * 100)}% confidence
        </Badge>
      </div>

      <div className="space-y-4">
        {/* Key Points */}
        {context.keyPoints && context.keyPoints.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-yellow-600" />
              <h4 className="text-sm font-medium text-gray-900">Key Points</h4>
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-6">
              {context.keyPoints.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Pain Points */}
        {context.painPoints && context.painPoints.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <h4 className="text-sm font-medium text-gray-900">Pain Points</h4>
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-6">
              {context.painPoints.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Opportunities */}
        {context.opportunities && context.opportunities.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <h4 className="text-sm font-medium text-gray-900">Opportunities</h4>
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-6">
              {context.opportunities.map((opp, idx) => (
                <li key={idx}>{opp}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Decision Makers */}
        {context.decisionMakers && context.decisionMakers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-medium text-gray-900">Decision Makers</h4>
            </div>
            <div className="space-y-2 ml-6">
              {context.decisionMakers.map((dm, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-medium text-gray-900">{dm.name}</span>
                  {dm.role && (
                    <span className="text-gray-600 ml-2">({dm.role})</span>
                  )}
                  {dm.context && (
                    <p className="text-xs text-gray-500 mt-0.5">{dm.context}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Business Context */}
        {context.businessContext && Object.keys(context.businessContext).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-purple-600" />
              <h4 className="text-sm font-medium text-gray-900">Business Context</h4>
            </div>
            <div className="space-y-1 text-sm text-gray-700 ml-6">
              {context.businessContext.industry && (
                <div><span className="font-medium">Industry:</span> {context.businessContext.industry}</div>
              )}
              {context.businessContext.companySize && (
                <div><span className="font-medium">Company Size:</span> {context.businessContext.companySize}</div>
              )}
              {context.businessContext.growthIndicators && context.businessContext.growthIndicators.length > 0 && (
                <div>
                  <span className="font-medium">Growth Indicators:</span>{' '}
                  {context.businessContext.growthIndicators.join(', ')}
                </div>
              )}
              {context.businessContext.challenges && context.businessContext.challenges.length > 0 && (
                <div>
                  <span className="font-medium">Challenges:</span>{' '}
                  {context.businessContext.challenges.join(', ')}
                </div>
              )}
              {context.businessContext.goals && context.businessContext.goals.length > 0 && (
                <div>
                  <span className="font-medium">Goals:</span>{' '}
                  {context.businessContext.goals.join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Financial Context */}
        {context.financialContext && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <h4 className="text-sm font-medium text-gray-900">Financial Context</h4>
            </div>
            <div className="space-y-1 text-sm text-gray-700 ml-6">
              {context.financialContext.budgetMentioned && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Budget Mentioned:</span>
                  <Badge variant="outline" className="text-xs">Yes</Badge>
                </div>
              )}
              {context.financialContext.budgetRange && (
                <div><span className="font-medium">Budget Range:</span> {context.financialContext.budgetRange}</div>
              )}
              {context.financialContext.investmentLevel && (
                <div><span className="font-medium">Investment Level:</span> {context.financialContext.investmentLevel}</div>
              )}
              {context.financialContext.timeline && (
                <div><span className="font-medium">Timeline:</span> {context.financialContext.timeline}</div>
              )}
            </div>
          </div>
        )}

        {/* Relationship Context */}
        {context.relationshipContext && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-4 h-4 text-pink-600" />
              <h4 className="text-sm font-medium text-gray-900">Relationship Context</h4>
            </div>
            <div className="space-y-1 text-sm text-gray-700 ml-6">
              {context.relationshipContext.currentStage && (
                <div><span className="font-medium">Stage:</span> {context.relationshipContext.currentStage}</div>
              )}
              {context.relationshipContext.relationshipStrength && (
                <div><span className="font-medium">Strength:</span> {context.relationshipContext.relationshipStrength}</div>
              )}
              {context.relationshipContext.sentiment && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Sentiment:</span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      context.relationshipContext.sentiment === 'positive' ? 'bg-green-50 text-green-700 border-green-200' :
                      context.relationshipContext.sentiment === 'negative' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    {context.relationshipContext.sentiment}
                  </Badge>
                </div>
              )}
              {context.relationshipContext.lastInteraction && (
                <div><span className="font-medium">Last Interaction:</span> {context.relationshipContext.lastInteraction}</div>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        {context.timeline && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-medium text-gray-900">Timeline</h4>
            </div>
            <div className="space-y-1 text-sm text-gray-700 ml-6">
              {context.timeline.urgency && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Urgency:</span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      context.timeline.urgency === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                      context.timeline.urgency === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                      'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    {context.timeline.urgency}
                  </Badge>
                </div>
              )}
              {context.timeline.deadlines && context.timeline.deadlines.length > 0 && (
                <div>
                  <span className="font-medium">Deadlines:</span>{' '}
                  {context.timeline.deadlines.join(', ')}
                </div>
              )}
              {context.timeline.milestones && context.timeline.milestones.length > 0 && (
                <div>
                  <span className="font-medium">Milestones:</span>{' '}
                  {context.timeline.milestones.join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Template Snippets */}
        {context.templateSnippets && (
          <div className="bg-blue-50 rounded-md p-4 border border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-medium text-gray-900">Template Snippets</h4>
            </div>
            <div className="space-y-2 text-sm ml-6">
              {context.templateSnippets.opening && (
                <div>
                  <span className="font-medium text-gray-900">Opening:</span>
                  <p className="text-gray-700 mt-1 italic">"{context.templateSnippets.opening}"</p>
                </div>
              )}
              {context.templateSnippets.valueProposition && (
                <div>
                  <span className="font-medium text-gray-900">Value Proposition:</span>
                  <p className="text-gray-700 mt-1 italic">"{context.templateSnippets.valueProposition}"</p>
                </div>
              )}
              {context.templateSnippets.callToAction && (
                <div>
                  <span className="font-medium text-gray-900">Call to Action:</span>
                  <p className="text-gray-700 mt-1 italic">"{context.templateSnippets.callToAction}"</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Competitive Mentions */}
        {context.competitiveMentions && context.competitiveMentions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-orange-600" />
              <h4 className="text-sm font-medium text-gray-900">Competitive Mentions</h4>
            </div>
            <div className="space-y-2 ml-6">
              {context.competitiveMentions.map((comp, idx) => (
                <div key={idx} className="text-sm">
                  {comp.competitor && (
                    <span className="font-medium text-gray-900">{comp.competitor}</span>
                  )}
                  {comp.context && (
                    <p className="text-xs text-gray-500 mt-0.5">{comp.context}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

