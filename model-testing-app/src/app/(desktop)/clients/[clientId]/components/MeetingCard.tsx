'use client';

import { useState } from 'react';
import { Calendar, Users, CheckSquare, AlertCircle } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { StatusPill } from '@/components/layouts';
import { FlagIndicator } from '@/components/FlagIndicator';

interface Attendee {
  name: string;
  role?: string;
  company?: string;
}

interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  status: 'pending' | 'completed' | 'cancelled';
}

interface Meeting {
  _id: string;
  title: string;
  meetingDate: string;
  meetingType?: 'progress' | 'kickoff' | 'review' | 'site_visit' | 'call' | 'other';
  attendees: Attendee[];
  summary: string;
  actionItems: ActionItem[];
  verified?: boolean;
}

interface MeetingCardProps {
  meeting: Meeting;
  isSelected: boolean;
  onClick: () => void;
}

function meetingTypeTone(type: string | undefined, colors: ReturnType<typeof useColors>): string {
  switch (type) {
    case 'progress':
      return colors.accent.blue;
    case 'kickoff':
      return colors.accent.green;
    case 'review':
      return colors.accent.purple;
    case 'site_visit':
      return colors.accent.orange;
    default:
      return colors.text.muted;
  }
}

const meetingTypeLabels: Record<string, string> = {
  progress: 'Progress',
  kickoff: 'Kickoff',
  review: 'Review',
  site_visit: 'Site Visit',
  call: 'Call',
  other: 'Other',
};

export default function MeetingCard({ meeting, isSelected, onClick }: MeetingCardProps) {
  const colors = useColors();
  const [hover, setHover] = useState(false);

  const pendingActions = meeting.actionItems.filter(a => a.status === 'pending').length;
  const completedActions = meeting.actionItems.filter(a => a.status === 'completed').length;
  const totalActions = meeting.actionItems.length;

  const formattedDate = new Date(meeting.meetingDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const year = new Date(meeting.meetingDate).getFullYear();
  const currentYear = new Date().getFullYear();
  const showYear = year !== currentYear;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: 12,
        cursor: 'pointer',
        border: 'none',
        borderLeft: isSelected ? `3px solid ${colors.entityTypes.client}` : '3px solid transparent',
        background: isSelected ? `${colors.entityTypes.client}15` : hover ? colors.bg.cardAlt : 'transparent',
        transition: 'background 100ms linear',
      }}
    >
      {/* Header: Date + Type Pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 10,
            color: colors.text.muted,
          }}
        >
          <Calendar size={12} />
          <span>{formattedDate}{showYear ? `, ${year}` : ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {meeting.verified === false && (
            <StatusPill label="Needs Review" tone={colors.accent.yellow} />
          )}
          {meeting.meetingType && (
            <StatusPill
              label={meetingTypeLabels[meeting.meetingType] || meeting.meetingType}
              tone={meetingTypeTone(meeting.meetingType, colors)}
            />
          )}
        </div>
      </div>

      {/* Title */}
      <h4
        style={{
          fontWeight: 500,
          color: colors.text.primary,
          fontSize: 13,
          margin: '0 0 4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{meeting.title}</span>
        <FlagIndicator entityType="meeting" entityId={meeting._id} />
      </h4>

      {/* Summary Preview */}
      <p
        style={{
          fontSize: 12,
          color: colors.text.muted,
          margin: '0 0 8px 0',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {meeting.summary}
      </p>

      {/* Footer: Attendees + Action Items */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: colors.text.muted }}>
          <Users size={12} />
          <span>{meeting.attendees.length}</span>
        </div>

        {totalActions > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {pendingActions > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: colors.accent.yellow }}>
                <AlertCircle size={12} />
                <span>{pendingActions}</span>
              </div>
            )}
            {completedActions > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: colors.accent.green }}>
                <CheckSquare size={12} />
                <span>{completedActions}/{totalActions}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
