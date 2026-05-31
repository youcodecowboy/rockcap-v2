'use client';

import { useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Lightbulb,
} from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { Panel, Button, FlagChip, SkeletonCard } from '@/components/layouts';

interface MissingDocumentsCardProps {
  clientId: Id<"clients">;
  className?: string;
  onViewAll?: () => void;
}

// Thin theme-aware progress bar — canon has no Progress primitive.
function ProgressBar({ value, tone }: { value: number; tone: string }) {
  const colors = useColors();
  return (
    <div style={{ height: 6, borderRadius: 3, background: colors.bg.cardAlt, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: '100%', background: tone, transition: 'width 150ms linear' }} />
    </div>
  );
}

export default function MissingDocumentsCard({
  clientId,
  className,
  onViewAll,
}: MissingDocumentsCardProps) {
  const router = useRouter();
  const colors = useColors();

  // Get checklist summary
  const summary = useQuery(
    api.knowledgeLibrary.getChecklistSummary,
    { clientId }
  );

  // Get missing items
  const missingItems = useQuery(
    api.knowledgeLibrary.getMissingItems,
    { clientId }
  );

  // Handle click to go to Knowledge tab
  const handleViewAll = () => {
    if (onViewAll) {
      onViewAll();
    } else {
      router.push(`/clients/${clientId}?tab=knowledge`);
    }
  };

  const labelStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.text.muted,
    fontWeight: 500,
  };

  // Loading state
  if (summary === undefined || missingItems === undefined) {
    return (
      <div className={className}>
        <SkeletonCard lines={3} />
      </div>
    );
  }

  // No checklist initialized yet
  if (!summary || summary.overall.total === 0) {
    return (
      <div className={className}>
        <Panel
          title="Knowledge Library"
          actions={<Lightbulb size={14} color={colors.accent.yellow} />}
        >
          <p style={{ fontSize: 12, color: colors.text.muted, margin: 0 }}>
            No document requirements configured yet.
          </p>
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" size="sm" onClick={handleViewAll}>
              Set up requirements
              <ChevronRight size={12} />
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  // Calculate completion percentage
  const completionPercentage = Math.round(
    (summary.overall.fulfilled / summary.overall.total) * 100
  );

  // Get required items that are missing
  const requiredMissing = missingItems.filter(item => item.priority === 'required');
  const topMissingItems = requiredMissing.slice(0, 5);

  // All complete state
  if (summary.overall.missing === 0) {
    return (
      <div className={className}>
        <Panel
          title="Knowledge Library"
          accent={colors.accent.green}
          actions={<CheckCircle2 size={14} color={colors.accent.green} />}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: colors.accent.green }}>All Complete</span>
            <span style={{ fontSize: 12, color: colors.text.muted }}>
              {summary.overall.fulfilled}/{summary.overall.total}
            </span>
          </div>
          <ProgressBar value={100} tone={colors.accent.green} />
          <div style={{ marginTop: 12 }}>
            <Button variant="ghost" size="sm" onClick={handleViewAll}>
              View all documents
              <ChevronRight size={12} />
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className={className}>
      <Panel
        title="Knowledge Library"
        actions={
          <>
            <Lightbulb size={14} color={colors.accent.yellow} />
            <Button variant="ghost" size="sm" onClick={handleViewAll}>
              View All
              <ChevronRight size={12} />
            </Button>
          </>
        }
      >
        {/* Progress */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
              {completionPercentage}% Complete
            </span>
            <span style={{ fontSize: 11, color: colors.text.muted }}>
              {summary.overall.fulfilled}/{summary.overall.total} documents
            </span>
          </div>
          <ProgressBar value={completionPercentage} tone={colors.entityTypes.client} />
        </div>

        {/* Missing Required Alert */}
        {requiredMissing.length > 0 && (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 10px',
              borderRadius: 4,
              background: `${colors.accent.red}12`,
              border: `1px solid ${colors.accent.red}40`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: colors.accent.red }}>
              <AlertCircle size={14} />
              <span style={{ fontWeight: 500 }}>
                {requiredMissing.length} required document{requiredMissing.length !== 1 ? 's' : ''} missing
              </span>
            </div>
          </div>
        )}

        {/* Top Missing Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ ...labelStyle, margin: 0 }}>Priority Missing</p>
          {topMissingItems.map(item => (
            <div
              key={item._id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.text.secondary }}
            >
              <FileText size={14} color={colors.text.muted} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              {item.priority === 'required' && (
                <FlagChip label="Required" severity="warn" />
              )}
            </div>
          ))}
          {requiredMissing.length > 5 && (
            <p style={{ fontSize: 11, color: colors.text.muted, paddingLeft: 22, margin: 0 }}>
              +{requiredMissing.length - 5} more required documents
            </p>
          )}
        </div>

        {/* Category Breakdown */}
        {Object.keys(summary.byCategory).length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${colors.border.light}` }}>
            <p style={{ ...labelStyle, marginTop: 0, marginBottom: 8 }}>By Category</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(summary.byCategory).map(([category, stats]) => (
                <div key={category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: colors.text.muted }}>{category}</span>
                  <span style={{ color: stats.missing > 0 ? colors.accent.red : colors.accent.green }}>
                    {stats.fulfilled}/{stats.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
