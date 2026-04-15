'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { ArrowLeft, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../../convex/_generated/api';
import BriefStatsBar from './BriefStatsBar';
import BriefSection from './BriefSection';
import BriefScheduleTimeline from './BriefScheduleTimeline';

export default function BriefContent() {
  const router = useRouter();
  const brief = useQuery(api.dailyBriefs.getToday, {});
  const googleStatus = useQuery(api.googleCalendar.getSyncStatus, {});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTriggered, setHasTriggered] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/daily-brief/generate', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate brief');
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate on first visit if no brief exists
  useEffect(() => {
    if (brief === null && !generating && !error && !hasTriggered) {
      setHasTriggered(true);
      handleGenerate();
    }
  }, [brief, generating, error, hasTriggered]);

  const content = brief?.content;
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sticky top-[var(--m-header-h)] bg-[var(--m-bg)] z-10">
        <button onClick={() => router.back()} className="p-1 text-[var(--m-text-secondary)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-[15px] font-medium text-[var(--m-text-primary)]">Daily Brief</span>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="p-1 text-[var(--m-text-tertiary)] disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-[var(--m-page-px)]">
        {/* Google Calendar prompt */}
        {googleStatus && !googleStatus.isConnected && (
          <div className="bg-blue-50 border border-blue-200 rounded-[var(--m-card-radius)] px-4 py-3 mb-4">
            <p className="text-[13px] text-blue-700">
              Connect Google Calendar in Settings to see your schedule in the daily brief.
            </p>
          </div>
        )}

        {/* Loading state */}
        {(brief === undefined || generating) && !content && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-full bg-[var(--m-bg-brand)] flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5 text-[var(--m-text-on-brand)]" />
            </div>
            <Loader2 className="w-5 h-5 animate-spin text-[var(--m-text-tertiary)] mb-3" />
            <p className="text-[14px] text-[var(--m-text-secondary)] font-medium">Preparing your daily brief...</p>
            <p className="text-[12px] text-[var(--m-text-tertiary)] mt-1">Analysing tasks, events, and activity</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[var(--m-card-radius)] px-4 py-3 mb-4">
            <p className="text-[13px] text-red-700">{error}</p>
            <button onClick={handleGenerate} className="text-[13px] text-red-700 font-medium mt-1 underline">
              Try again
            </button>
          </div>
        )}

        {/* Brief content */}
        {content && (
          <>
            {/* Date + meta */}
            <div className="mb-4">
              <h2 className="text-[20px] font-semibold text-[var(--m-text-primary)] tracking-[-0.02em]">
                {today}
              </h2>
              <p className="text-[12px] text-[var(--m-text-tertiary)] mt-1">
                Generated at {new Date(brief.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                {content.summary ? ` · ${content.summary.overdue + content.summary.openFlags} items need attention` : ''}
              </p>
            </div>

            {/* Stats */}
            {content.summary && (
              <BriefStatsBar
                overdue={content.summary.overdue}
                dueToday={content.summary.dueToday}
                meetings={content.summary.meetings}
                openFlags={content.summary.openFlags}
              />
            )}

            {/* Attention Needed */}
            {content.attentionNeeded && (
              <BriefSection
                title="Attention Needed"
                color="bg-[var(--m-error)]"
                badgeColor="bg-[var(--m-error)]"
                items={content.attentionNeeded.items || []}
                insight={content.attentionNeeded.insight}
              />
            )}

            {/* Today's Schedule */}
            {content.todaySchedule && (
              <BriefScheduleTimeline
                items={content.todaySchedule.items || []}
                insight={content.todaySchedule.insight}
              />
            )}

            {/* Activity Recap */}
            {content.activityRecap && (
              <BriefSection
                title="Activity Recap"
                color="bg-blue-500"
                badgeColor="bg-blue-500"
                items={(content.activityRecap.items || []).map((item: any) => ({
                  ...item,
                  title: item.summary || item.title,
                  context: item.count ? `${item.count} ${item.type}` : item.context,
                }))}
                insight={content.activityRecap.insight}
              />
            )}

            {/* Looking Ahead */}
            {content.lookingAhead && (
              <BriefSection
                title="Looking Ahead"
                color="bg-[var(--m-success)]"
                badgeColor="bg-[var(--m-success)]"
                items={content.lookingAhead.items || []}
                insight={content.lookingAhead.insight}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
