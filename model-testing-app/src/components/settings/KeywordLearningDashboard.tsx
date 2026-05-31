'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Panel, StatTile, Button, IconButton, StatusPill, EmptyState, SkeletonTable } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  Sparkles,
  Undo2,
  X,
  CheckCircle2,
} from 'lucide-react';
import { useState } from 'react';

export default function KeywordLearningDashboard() {
  const colors = useColors();
  const recentEvents = useQuery(api.keywordLearning.getRecentLearningEvents, { limit: 20 });
  const stats = useQuery(api.keywordLearning.getLearningStats);
  const undoLearnedKeyword = useMutation(api.keywordLearning.undoLearnedKeyword);
  const dismissEvent = useMutation(api.keywordLearning.dismissLearningEvent);
  const dismissAll = useMutation(api.keywordLearning.dismissAllLearningEvents);

  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const handleUndo = async (eventId: string) => {
    setProcessingIds((prev) => new Set(prev).add(eventId));
    try {
      await undoLearnedKeyword({ learningEventId: eventId as any });
    } catch (error) {
      console.error('Failed to undo keyword:', error);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  const handleDismiss = async (eventId: string) => {
    setProcessingIds((prev) => new Set(prev).add(eventId));
    try {
      await dismissEvent({ learningEventId: eventId as any });
    } catch (error) {
      console.error('Failed to dismiss event:', error);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  const handleDismissAll = async () => {
    try {
      await dismissAll({});
    } catch (error) {
      console.error('Failed to dismiss all:', error);
    }
  };

  const isLoading = recentEvents === undefined || stats === undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, background: colors.border.light }}>
        <StatTile label="Total Learned" value={stats?.totalKeywordsLearned ?? '-'} accent={colors.accent.yellow} />
        <StatTile label="This Week" value={stats?.thisWeek ?? '-'} accent={colors.accent.blue} />
        <StatTile label="This Month" value={stats?.thisMonth ?? '-'} accent={colors.accent.green} />
        <StatTile label="File Types" value={stats?.fileTypesWithLearning ?? '-'} accent={colors.accent.purple} />
      </div>

      {/* Recent Learning Events */}
      <Panel
        title="Recent Auto-Learned Keywords"
        accent={colors.accent.yellow}
        actions={
          recentEvents && recentEvents.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={handleDismissAll}>
              <X style={{ width: 14, height: 14 }} />
              Dismiss All
            </Button>
          ) : undefined
        }
      >
        <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
          Keywords automatically learned from user corrections. These are now used for
          deterministic document classification.
        </p>
        {isLoading ? (
          <SkeletonTable rows={4} cols={2} />
        ) : recentEvents && recentEvents.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentEvents.map((event) => (
              <div
                key={event._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 14,
                  background: colors.bg.cardAlt,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Sparkles style={{ width: 16, height: 16, color: colors.accent.yellow }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 500, color: colors.text.primary }}>{event.keyword}</span>
                      <StatusPill label={event.fileType} tone={colors.accent.blue} />
                    </div>
                    <p style={{ fontSize: 13, color: colors.text.muted }}>
                      Learned from {event.correctionCount} correction
                      {event.correctionCount !== 1 ? 's' : ''} &middot;{' '}
                      {new Date(event.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconButton
                    label="Undo - Remove this keyword from the file type"
                    onClick={() => handleUndo(event._id)}
                    disabled={processingIds.has(event._id)}
                  >
                    <Undo2 style={{ width: 16, height: 16 }} />
                  </IconButton>
                  <IconButton
                    label="Dismiss - Hide this notification"
                    onClick={() => handleDismiss(event._id)}
                    disabled={processingIds.has(event._id)}
                  >
                    <X style={{ width: 16, height: 16 }} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CheckCircle2 style={{ width: 24, height: 24 }} />}
            title="No recent learning events"
            body="Keywords will appear here when the system learns from user corrections."
          />
        )}
      </Panel>

      {/* How it works */}
      <Panel title="How Keyword Learning Works">
        <ol style={{ listStyle: 'decimal', listStylePosition: 'inside', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: colors.text.secondary, margin: 0, padding: 0 }}>
          <li>
            When you correct a document&apos;s file type (e.g., AI said &quot;IMR&quot; but you corrected
            to &quot;RedBook Valuation&quot;), the system records the document&apos;s keywords.
          </li>
          <li>
            After 3+ similar corrections, the system identifies common keywords across those
            documents.
          </li>
          <li>
            These keywords are automatically added to the correct file type definition to improve
            future classifications.
          </li>
          <li>
            You can undo any learned keyword if it was incorrectly associated, or dismiss the
            notification to keep the keyword.
          </li>
        </ol>
      </Panel>
    </div>
  );
}
