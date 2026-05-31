'use client';

import { ProspectingContext } from '@/types';
import { Panel, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
} from 'lucide-react';

interface ProspectingContextCardProps {
  context: ProspectingContext;
  documentName?: string;
}

export default function ProspectingContextCard({
  context,
  documentName,
}: ProspectingContextCardProps) {
  const colors = useColors();

  const sectionHeading = (Icon: typeof Lightbulb, color: string, label: string) => (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={16} style={{ color }} />
      <h4 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{label}</h4>
    </div>
  );

  const bullets = (items: string[]) => (
    <ul className="list-disc list-inside space-y-1 ml-6" style={{ fontSize: 13, color: colors.text.secondary }}>
      {items.map((point, idx) => (
        <li key={idx}>{point}</li>
      ))}
    </ul>
  );

  return (
    <Panel
      accent={colors.entityTypes.prospect}
      actions={<StatusPill label={`${Math.round(context.confidence * 100)}% confidence`} tone={colors.entityTypes.prospect} />}
    >
      <div style={{ padding: 0 }}>
        <div className="mb-4">
          <h3 className="mb-1" style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>
            Prospecting Intelligence
          </h3>
          {documentName && (
            <p style={{ fontSize: 13, color: colors.text.secondary }}>From: {documentName}</p>
          )}
          <p className="mt-1" style={{ fontSize: 11, color: colors.text.muted }}>
            Extracted: {new Date(context.extractedAt).toLocaleDateString()}
          </p>
        </div>

        <div className="space-y-4">
          {/* Key Points */}
          {context.keyPoints && context.keyPoints.length > 0 && (
            <div>
              {sectionHeading(Lightbulb, colors.accent.yellow, 'Key Points')}
              {bullets(context.keyPoints)}
            </div>
          )}

          {/* Pain Points */}
          {context.painPoints && context.painPoints.length > 0 && (
            <div>
              {sectionHeading(AlertCircle, colors.accent.red, 'Pain Points')}
              {bullets(context.painPoints)}
            </div>
          )}

          {/* Opportunities */}
          {context.opportunities && context.opportunities.length > 0 && (
            <div>
              {sectionHeading(TrendingUp, colors.accent.green, 'Opportunities')}
              {bullets(context.opportunities)}
            </div>
          )}

          {/* Decision Makers */}
          {context.decisionMakers && context.decisionMakers.length > 0 && (
            <div>
              {sectionHeading(Users, colors.accent.blue, 'Decision Makers')}
              <div className="space-y-2 ml-6">
                {context.decisionMakers.map((dm, idx) => (
                  <div key={idx} style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 500, color: colors.text.primary }}>{dm.name}</span>
                    {dm.role && <span style={{ marginLeft: 8, color: colors.text.secondary }}>({dm.role})</span>}
                    {dm.context && (
                      <p className="mt-0.5" style={{ fontSize: 11, color: colors.text.muted }}>{dm.context}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Business Context */}
          {context.businessContext && Object.keys(context.businessContext).length > 0 && (
            <div>
              {sectionHeading(Building2, colors.accent.purple, 'Business Context')}
              <div className="space-y-1 ml-6" style={{ fontSize: 13, color: colors.text.secondary }}>
                {context.businessContext.industry && (
                  <div><span style={{ fontWeight: 500 }}>Industry:</span> {context.businessContext.industry}</div>
                )}
                {context.businessContext.companySize && (
                  <div><span style={{ fontWeight: 500 }}>Company Size:</span> {context.businessContext.companySize}</div>
                )}
                {context.businessContext.growthIndicators && context.businessContext.growthIndicators.length > 0 && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Growth Indicators:</span>{' '}
                    {context.businessContext.growthIndicators.join(', ')}
                  </div>
                )}
                {context.businessContext.challenges && context.businessContext.challenges.length > 0 && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Challenges:</span>{' '}
                    {context.businessContext.challenges.join(', ')}
                  </div>
                )}
                {context.businessContext.goals && context.businessContext.goals.length > 0 && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Goals:</span>{' '}
                    {context.businessContext.goals.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Financial Context */}
          {context.financialContext && (
            <div>
              {sectionHeading(DollarSign, colors.accent.green, 'Financial Context')}
              <div className="space-y-1 ml-6" style={{ fontSize: 13, color: colors.text.secondary }}>
                {context.financialContext.budgetMentioned && (
                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: 500 }}>Budget Mentioned:</span>
                    <StatusPill label="Yes" tone={colors.accent.green} />
                  </div>
                )}
                {context.financialContext.budgetRange && (
                  <div><span style={{ fontWeight: 500 }}>Budget Range:</span> {context.financialContext.budgetRange}</div>
                )}
                {context.financialContext.investmentLevel && (
                  <div><span style={{ fontWeight: 500 }}>Investment Level:</span> {context.financialContext.investmentLevel}</div>
                )}
                {context.financialContext.timeline && (
                  <div><span style={{ fontWeight: 500 }}>Timeline:</span> {context.financialContext.timeline}</div>
                )}
              </div>
            </div>
          )}

          {/* Relationship Context */}
          {context.relationshipContext && (
            <div>
              {sectionHeading(Heart, colors.accent.purple, 'Relationship Context')}
              <div className="space-y-1 ml-6" style={{ fontSize: 13, color: colors.text.secondary }}>
                {context.relationshipContext.currentStage && (
                  <div><span style={{ fontWeight: 500 }}>Stage:</span> {context.relationshipContext.currentStage}</div>
                )}
                {context.relationshipContext.relationshipStrength && (
                  <div><span style={{ fontWeight: 500 }}>Strength:</span> {context.relationshipContext.relationshipStrength}</div>
                )}
                {context.relationshipContext.sentiment && (
                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: 500 }}>Sentiment:</span>
                    <StatusPill
                      label={context.relationshipContext.sentiment}
                      tone={
                        context.relationshipContext.sentiment === 'positive'
                          ? colors.accent.green
                          : context.relationshipContext.sentiment === 'negative'
                          ? colors.accent.red
                          : colors.text.muted
                      }
                    />
                  </div>
                )}
                {context.relationshipContext.lastInteraction && (
                  <div><span style={{ fontWeight: 500 }}>Last Interaction:</span> {context.relationshipContext.lastInteraction}</div>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          {context.timeline && (
            <div>
              {sectionHeading(Clock, colors.accent.blue, 'Timeline')}
              <div className="space-y-1 ml-6" style={{ fontSize: 13, color: colors.text.secondary }}>
                {context.timeline.urgency && (
                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: 500 }}>Urgency:</span>
                    <StatusPill
                      label={context.timeline.urgency}
                      tone={
                        context.timeline.urgency === 'high'
                          ? colors.accent.red
                          : context.timeline.urgency === 'medium'
                          ? colors.accent.yellow
                          : colors.text.muted
                      }
                    />
                  </div>
                )}
                {context.timeline.deadlines && context.timeline.deadlines.length > 0 && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Deadlines:</span>{' '}
                    {context.timeline.deadlines.join(', ')}
                  </div>
                )}
                {context.timeline.milestones && context.timeline.milestones.length > 0 && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Milestones:</span>{' '}
                    {context.timeline.milestones.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Template Snippets */}
          {context.templateSnippets && (
            <div
              className="p-4"
              style={{ background: `${colors.accent.blue}10`, borderRadius: 4, border: `1px solid ${colors.accent.blue}40` }}
            >
              {sectionHeading(FileText, colors.accent.blue, 'Template Snippets')}
              <div className="space-y-2 ml-6" style={{ fontSize: 13 }}>
                {context.templateSnippets.opening && (
                  <div>
                    <span style={{ fontWeight: 500, color: colors.text.primary }}>Opening:</span>
                    <p className="mt-1" style={{ fontStyle: 'italic', color: colors.text.secondary }}>&quot;{context.templateSnippets.opening}&quot;</p>
                  </div>
                )}
                {context.templateSnippets.valueProposition && (
                  <div>
                    <span style={{ fontWeight: 500, color: colors.text.primary }}>Value Proposition:</span>
                    <p className="mt-1" style={{ fontStyle: 'italic', color: colors.text.secondary }}>&quot;{context.templateSnippets.valueProposition}&quot;</p>
                  </div>
                )}
                {context.templateSnippets.callToAction && (
                  <div>
                    <span style={{ fontWeight: 500, color: colors.text.primary }}>Call to Action:</span>
                    <p className="mt-1" style={{ fontStyle: 'italic', color: colors.text.secondary }}>&quot;{context.templateSnippets.callToAction}&quot;</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Competitive Mentions */}
          {context.competitiveMentions && context.competitiveMentions.length > 0 && (
            <div>
              {sectionHeading(Target, colors.accent.orange, 'Competitive Mentions')}
              <div className="space-y-2 ml-6">
                {context.competitiveMentions.map((comp, idx) => (
                  <div key={idx} style={{ fontSize: 13 }}>
                    {comp.competitor && (
                      <span style={{ fontWeight: 500, color: colors.text.primary }}>{comp.competitor}</span>
                    )}
                    {comp.context && (
                      <p className="mt-0.5" style={{ fontSize: 11, color: colors.text.muted }}>{comp.context}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
