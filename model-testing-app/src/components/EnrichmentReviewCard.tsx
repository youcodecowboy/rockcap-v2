'use client';

import { useState } from 'react';
import { useEnrichmentByDocument, useAcceptEnrichment, useRejectEnrichment, useSkipEnrichment } from '@/lib/clientStorage';
import { Id } from '../../convex/_generated/dataModel';
import { Panel, Button, IconButton, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import { CheckCircle2, X, SkipForward, Mail, Phone, MapPin, Building2, User, Calendar, Sparkles } from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface EnrichmentReviewCardProps {
  documentId: Id<"documents">;
  onReviewComplete?: () => void;
}

const enrichmentIcons = {
  email: Mail,
  phone: Phone,
  address: MapPin,
  company: Building2,
  contact: User,
  date: Calendar,
  other: Sparkles,
};

function enrichmentTone(type: string, colors: ColorPalette): string {
  switch (type) {
    case 'email': return colors.accent.blue;
    case 'phone': return colors.accent.green;
    case 'address': return colors.accent.purple;
    case 'company': return colors.accent.orange;
    case 'contact': return colors.accent.purple;
    case 'date': return colors.accent.yellow;
    default: return colors.text.muted;
  }
}

export default function EnrichmentReviewCard({
  documentId,
  onReviewComplete,
}: EnrichmentReviewCardProps) {
  const colors = useColors();
  const enrichments = useEnrichmentByDocument(documentId) || [];
  const acceptEnrichment = useAcceptEnrichment();
  const rejectEnrichment = useRejectEnrichment();
  const skipEnrichment = useSkipEnrichment();

  const [processingIds, setProcessingIds] = useState<Set<Id<"enrichmentSuggestions">>>(new Set());
  const [reviewedIds, setReviewedIds] = useState<Set<Id<"enrichmentSuggestions">>>(
    new Set(enrichments.filter(e => e.status !== 'pending').map(e => e._id))
  );

  // Filter to only show pending enrichments
  const pendingEnrichments = enrichments.filter(e => e.status === 'pending');
  const reviewedEnrichments = enrichments.filter(e => e.status !== 'pending' && e.status !== 'skipped');

  const handleAction = async (
    enrichmentId: Id<"enrichmentSuggestions">,
    action: 'accept' | 'reject' | 'skip'
  ) => {
    setProcessingIds(prev => new Set(prev).add(enrichmentId));

    try {
      if (action === 'accept') {
        await acceptEnrichment({ id: enrichmentId });
      } else if (action === 'reject') {
        await rejectEnrichment({ id: enrichmentId });
      } else if (action === 'skip') {
        await skipEnrichment({ id: enrichmentId });
      }
    } catch (error) {
      console.error(`Error ${action}ing enrichment:`, error);
      alert(`Failed to ${action} enrichment. Please try again.`);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(enrichmentId);
        return next;
      });
      setReviewedIds(prev => new Set(prev).add(enrichmentId));
    }
  };

  const handleBatchAction = async (action: 'accept' | 'reject' | 'skip') => {
    const toProcess = pendingEnrichments.filter(e => !reviewedIds.has(e._id));

    for (const enrichment of toProcess) {
      await handleAction(enrichment._id, action);
    }
  };

  if (enrichments.length === 0) {
    return null; // Don't show card if no enrichments
  }

  return (
    <div className="mb-6">
      <Panel
        title="Enrichment Suggestions"
        accent={colors.accent.blue}
        actions={
          pendingEnrichments.length > 0 ? (
            <StatusPill label={`${pendingEnrichments.length} pending`} tone={colors.accent.yellow} />
          ) : undefined
        }
      >
        <div className="space-y-4">
          <p style={{ fontSize: 11, color: colors.text.muted }}>
            Review and apply data extracted from this document to client or project profiles
          </p>

          {/* Batch Actions */}
          {pendingEnrichments.length > 1 && (
            <div className="flex gap-2 pb-4" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
              <Button variant="secondary" size="sm" onClick={() => handleBatchAction('accept')} disabled={processingIds.size > 0} style={{ flex: 1, justifyContent: 'center' }}>
                <CheckCircle2 size={16} />
                Accept All
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleBatchAction('reject')} disabled={processingIds.size > 0} style={{ flex: 1, justifyContent: 'center' }}>
                <X size={16} />
                Decline All
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleBatchAction('skip')} disabled={processingIds.size > 0} style={{ flex: 1, justifyContent: 'center' }}>
                <SkipForward size={16} />
                Skip All
              </Button>
            </div>
          )}

          {/* Pending Enrichments */}
          {pendingEnrichments.length > 0 ? (
            <div className="space-y-3">
              {pendingEnrichments.map((enrichment) => {
                const Icon = enrichmentIcons[enrichment.type] || Sparkles;
                const tone = enrichmentTone(enrichment.type, colors);
                const isProcessing = processingIds.has(enrichment._id);

                return (
                  <div
                    key={enrichment._id}
                    className="p-4"
                    style={{ borderRadius: 4, border: `1px solid ${colors.border.default}`, background: colors.bg.card }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex items-center justify-center"
                        style={{ width: 32, height: 32, borderRadius: 4, background: `${tone}15`, color: tone, flexShrink: 0 }}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <StatusPill label={enrichment.type} tone={tone} />
                              <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                                {enrichment.field}
                              </span>
                            </div>
                            <p className="break-words" style={{ fontSize: 13, color: colors.text.primary }}>
                              {String(enrichment.value)}
                            </p>
                            <div className="flex items-center gap-3 mt-1" style={{ fontSize: 11, color: colors.text.muted }}>
                              <span>Confidence: {(enrichment.confidence * 100).toFixed(0)}%</span>
                              {enrichment.source && (
                                <>
                                  <span>•</span>
                                  <span>Source: {enrichment.source}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {enrichment.status === 'pending' && (
                            <div className="flex gap-1 flex-shrink-0">
                              <IconButton label="Accept" onClick={() => handleAction(enrichment._id, 'accept')} disabled={isProcessing} style={{ color: colors.accent.green }}>
                                <CheckCircle2 size={16} />
                              </IconButton>
                              <IconButton label="Decline" onClick={() => handleAction(enrichment._id, 'reject')} disabled={isProcessing} style={{ color: colors.accent.red }}>
                                <X size={16} />
                              </IconButton>
                              <IconButton label="Skip" onClick={() => handleAction(enrichment._id, 'skip')} disabled={isProcessing}>
                                <SkipForward size={16} />
                              </IconButton>
                            </div>
                          )}
                          {enrichment.status === 'accepted' && <StatusPill label="Accepted" tone={colors.accent.green} />}
                          {enrichment.status === 'rejected' && <StatusPill label="Declined" tone={colors.accent.red} />}
                          {enrichment.status === 'skipped' && <StatusPill label="Skipped" tone={colors.text.muted} />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 size={32} style={{ color: colors.accent.green }} />}
              title="All enrichments reviewed"
              body={`${reviewedEnrichments.length} suggestion${reviewedEnrichments.length !== 1 ? 's' : ''} processed`}
            />
          )}

          {/* Reviewed Enrichments Summary */}
          {reviewedEnrichments.length > 0 && (
            <div className="pt-4" style={{ borderTop: `1px solid ${colors.border.default}` }}>
              <p className="mb-2" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500, color: colors.text.muted }}>
                Previously reviewed ({reviewedEnrichments.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {reviewedEnrichments.map((enrichment) => (
                  <StatusPill
                    key={enrichment._id}
                    label={`${enrichment.type}: ${String(enrichment.value).substring(0, 20)}${enrichment.status === 'accepted' ? ' ✓' : ''}`}
                    tone={enrichment.status === 'accepted' ? colors.accent.green : colors.text.muted}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
