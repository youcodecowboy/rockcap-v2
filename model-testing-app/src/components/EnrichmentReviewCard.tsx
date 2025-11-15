'use client';

import { useState } from 'react';
import { useEnrichmentByDocument, useAcceptEnrichment, useRejectEnrichment, useSkipEnrichment } from '@/lib/clientStorage';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, X, SkipForward, Mail, Phone, MapPin, Building2, User, Calendar, Sparkles } from 'lucide-react';

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

const enrichmentColors = {
  email: 'bg-blue-100 text-blue-700',
  phone: 'bg-green-100 text-green-700',
  address: 'bg-purple-100 text-purple-700',
  company: 'bg-orange-100 text-orange-700',
  contact: 'bg-pink-100 text-pink-700',
  date: 'bg-yellow-100 text-yellow-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function EnrichmentReviewCard({
  documentId,
  onReviewComplete,
}: EnrichmentReviewCardProps) {
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
  const skippedEnrichments = enrichments.filter(e => e.status === 'skipped');

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

  const allReviewed = pendingEnrichments.length === 0 || 
    pendingEnrichments.every(e => reviewedIds.has(e._id));

  if (enrichments.length === 0) {
    return null; // Don't show card if no enrichments
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-gray-900">
              Enrichment Suggestions
            </CardTitle>
            <CardDescription>
              Review and apply data extracted from this document to client or project profiles
            </CardDescription>
          </div>
          {pendingEnrichments.length > 0 && (
            <Badge className="bg-yellow-100 text-yellow-700">
              {pendingEnrichments.length} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Batch Actions */}
        {pendingEnrichments.length > 1 && (
          <div className="flex gap-2 pb-4 border-b border-gray-200">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchAction('accept')}
              disabled={processingIds.size > 0}
              className="flex-1"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Accept All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchAction('reject')}
              disabled={processingIds.size > 0}
              className="flex-1"
            >
              <X className="w-4 h-4 mr-2" />
              Decline All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchAction('skip')}
              disabled={processingIds.size > 0}
              className="flex-1"
            >
              <SkipForward className="w-4 h-4 mr-2" />
              Skip All
            </Button>
          </div>
        )}

        {/* Pending Enrichments */}
        {pendingEnrichments.length > 0 ? (
          <div className="space-y-3">
            {pendingEnrichments.map((enrichment) => {
              const Icon = enrichmentIcons[enrichment.type] || Sparkles;
              const isProcessing = processingIds.has(enrichment._id);

              return (
                <div
                  key={enrichment._id}
                  className={`p-4 border rounded-lg transition-all ${
                    enrichment.status === 'accepted'
                      ? 'bg-green-50 border-green-200'
                      : enrichment.status === 'rejected'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${enrichmentColors[enrichment.type] || enrichmentColors.other}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {enrichment.type}
                            </Badge>
                            <span className="text-sm font-medium text-gray-900">
                              {enrichment.field}
                            </span>
                          </div>
                          <p className="text-sm text-gray-900 break-words">
                            {String(enrichment.value)}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction(enrichment._id, 'accept')}
                              disabled={isProcessing}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              title="Accept"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction(enrichment._id, 'reject')}
                              disabled={isProcessing}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Decline"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction(enrichment._id, 'skip')}
                              disabled={isProcessing}
                              className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                              title="Skip"
                            >
                              <SkipForward className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                        {enrichment.status === 'accepted' && (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Accepted
                          </Badge>
                        )}
                        {enrichment.status === 'rejected' && (
                          <Badge className="bg-red-100 text-red-700">
                            <X className="w-3 h-3 mr-1" />
                            Declined
                          </Badge>
                        )}
                        {enrichment.status === 'skipped' && (
                          <Badge className="bg-gray-100 text-gray-700">
                            <SkipForward className="w-3 h-3 mr-1" />
                            Skipped
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900 mb-1">All enrichments reviewed</p>
            <p className="text-xs text-gray-500">
              {reviewedEnrichments.length} suggestion{reviewedEnrichments.length !== 1 ? 's' : ''} processed
            </p>
          </div>
        )}

        {/* Reviewed Enrichments Summary */}
        {reviewedEnrichments.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-2">
              Previously reviewed ({reviewedEnrichments.length}):
            </p>
            <div className="flex flex-wrap gap-2">
              {reviewedEnrichments.map((enrichment) => {
                const Icon = enrichmentIcons[enrichment.type] || Sparkles;
                return (
                  <Badge
                    key={enrichment._id}
                    variant="outline"
                    className="text-xs"
                  >
                    <Icon className="w-3 h-3 mr-1" />
                    {enrichment.type}: {String(enrichment.value).substring(0, 20)}
                    {enrichment.status === 'accepted' && ' ✓'}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

