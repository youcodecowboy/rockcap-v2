'use client';

import { Calendar, Users, CheckSquare, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
}

interface MeetingCardProps {
  meeting: Meeting;
  isSelected: boolean;
  onClick: () => void;
}

const meetingTypeColors: Record<string, string> = {
  progress: 'bg-blue-100 text-blue-700',
  kickoff: 'bg-green-100 text-green-700',
  review: 'bg-purple-100 text-purple-700',
  site_visit: 'bg-orange-100 text-orange-700',
  call: 'bg-gray-100 text-gray-700',
  other: 'bg-gray-100 text-gray-600',
};

const meetingTypeLabels: Record<string, string> = {
  progress: 'Progress',
  kickoff: 'Kickoff',
  review: 'Review',
  site_visit: 'Site Visit',
  call: 'Call',
  other: 'Other',
};

export default function MeetingCard({ meeting, isSelected, onClick }: MeetingCardProps) {
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
      className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''
      }`}
    >
      {/* Header: Date + Type Badge */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Calendar className="w-3 h-3" />
          <span>{formattedDate}{showYear ? `, ${year}` : ''}</span>
        </div>
        {meeting.meetingType && (
          <Badge
            variant="secondary"
            className={`text-[10px] px-1.5 py-0.5 ${meetingTypeColors[meeting.meetingType] || meetingTypeColors.other}`}
          >
            {meetingTypeLabels[meeting.meetingType] || meeting.meetingType}
          </Badge>
        )}
      </div>

      {/* Title */}
      <h4 className="font-medium text-gray-900 text-sm mb-1 line-clamp-1">
        {meeting.title}
      </h4>

      {/* Summary Preview */}
      <p className="text-xs text-gray-600 line-clamp-2 mb-2">
        {meeting.summary}
      </p>

      {/* Footer: Attendees + Action Items */}
      <div className="flex items-center justify-between text-xs">
        {/* Attendees */}
        <div className="flex items-center gap-1 text-gray-500">
          <Users className="w-3 h-3" />
          <span>{meeting.attendees.length}</span>
        </div>

        {/* Action Items Status */}
        {totalActions > 0 && (
          <div className="flex items-center gap-2">
            {pendingActions > 0 && (
              <div className="flex items-center gap-1 text-amber-600">
                <AlertCircle className="w-3 h-3" />
                <span>{pendingActions}</span>
              </div>
            )}
            {completedActions > 0 && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckSquare className="w-3 h-3" />
                <span>{completedActions}/{totalActions}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
