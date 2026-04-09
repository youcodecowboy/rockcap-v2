'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import { ChevronDown } from 'lucide-react';

interface ClientMeetingsTabProps {
  clientId: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ClientMeetingsTab({ clientId }: ClientMeetingsTabProps) {
  const meetings = useQuery(api.meetings.getByClient, { clientId: clientId as Id<'clients'> });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (meetings === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading meetings...
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        No meetings yet
      </div>
    );
  }

  const sorted = [...meetings].sort(
    (a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime()
  );

  return (
    <div>
      {sorted.map((meeting) => {
        const isExpanded = expandedId === meeting._id;
        const summaryPreview =
          meeting.summary && meeting.summary.length > 80
            ? meeting.summary.slice(0, 80) + '...'
            : meeting.summary;

        return (
          <div
            key={meeting._id}
            className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]"
          >
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setExpandedId((prev) => (prev === meeting._id ? null : meeting._id))}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--m-text-primary)]">
                  {meeting.title}
                </div>
                <div className="text-[11px] text-[var(--m-text-tertiary)]">
                  {formatDate(meeting.meetingDate)}
                  {meeting.attendees && meeting.attendees.length > 0 && (
                    <> · {meeting.attendees.length} attendee{meeting.attendees.length !== 1 ? 's' : ''}</>
                  )}
                </div>
                {!isExpanded && summaryPreview && (
                  <div className="text-[12px] text-[var(--m-text-secondary)] mt-0.5">
                    {summaryPreview}
                  </div>
                )}
              </div>
              <ChevronDown
                size={16}
                className="ml-2 flex-shrink-0 text-[var(--m-text-tertiary)] transition-transform"
                style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }}
              />
            </button>

            {isExpanded && (
              <div className="pl-2 mt-2">
                {meeting.summary && (
                  <div className="text-[12px] text-[var(--m-text-secondary)]">
                    {meeting.summary}
                  </div>
                )}

                {meeting.keyPoints && meeting.keyPoints.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)] mt-3 mb-1">
                      Key Points
                    </div>
                    {meeting.keyPoints.map((point: string, i: number) => (
                      <div key={i} className="text-[12px] text-[var(--m-text-secondary)] ml-3">
                        • {point}
                      </div>
                    ))}
                  </div>
                )}

                {meeting.decisions && meeting.decisions.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)] mt-3 mb-1">
                      Decisions
                    </div>
                    {meeting.decisions.map((decision: string, i: number) => (
                      <div key={i} className="text-[12px] text-[var(--m-text-secondary)] ml-3">
                        • {decision}
                      </div>
                    ))}
                  </div>
                )}

                {meeting.actionItems && meeting.actionItems.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)] mt-3 mb-1">
                      Action Items
                    </div>
                    {meeting.actionItems.map((item: { description: string; assignee?: string; dueDate?: string; status?: string }, i: number) => (
                      <div key={i} className="text-[12px] text-[var(--m-text-secondary)] ml-3 flex items-center gap-1.5 flex-wrap">
                        <span>• {item.description}</span>
                        {item.assignee && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-[var(--m-bg-tertiary)] text-[var(--m-text-secondary)]">
                            {item.assignee}
                          </span>
                        )}
                        {item.status && (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                              item.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {item.status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
