'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Calendar,
  Users,
  FileText,
  CheckSquare,
  ListChecks,
  MessageSquare,
  Lightbulb,
  ArrowRight,
  Trash2,
  ExternalLink,
  User,
  Building2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Flag,
} from 'lucide-react';
import FlagCreationModal from '@/components/FlagCreationModal';

interface Attendee {
  name: string;
  role?: string;
  company?: string;
  contactId?: Id<"contacts">;
}

interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  dueDate?: string;
  status: 'pending' | 'completed' | 'cancelled';
  taskId?: Id<"tasks">;
  createdAt: string;
  completedAt?: string;
}

interface Meeting {
  _id: Id<"meetings">;
  title: string;
  meetingDate: string;
  meetingType?: 'progress' | 'kickoff' | 'review' | 'site_visit' | 'call' | 'other';
  attendees: Attendee[];
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  sourceDocumentId?: Id<"documents">;
  sourceDocumentName?: string;
  extractionConfidence?: number;
  verified?: boolean;
  notes?: string;
  createdAt: string;
}

interface MeetingDetailViewProps {
  meeting: Meeting;
  clientId: Id<"clients">;
  onClose: () => void;
}

const meetingTypeLabels: Record<string, string> = {
  progress: 'Progress Meeting',
  kickoff: 'Kickoff Meeting',
  review: 'Review Meeting',
  site_visit: 'Site Visit',
  call: 'Phone Call',
  other: 'Meeting',
};

const meetingTypeColors: Record<string, string> = {
  progress: 'bg-blue-100 text-blue-700',
  kickoff: 'bg-green-100 text-green-700',
  review: 'bg-purple-100 text-purple-700',
  site_visit: 'bg-orange-100 text-orange-700',
  call: 'bg-gray-100 text-gray-700',
  other: 'bg-gray-100 text-gray-600',
};

export default function MeetingDetailView({ meeting, clientId, onClose }: MeetingDetailViewProps) {
  const [promotingItemId, setPromotingItemId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);

  const currentUser = useQuery(api.users.getCurrent, {});
  const updateActionItemStatus = useMutation(api.meetings.updateActionItemStatus);
  const promoteToTask = useMutation(api.meetings.promoteActionItemToTask);
  const deleteMeeting = useMutation(api.meetings.deleteMeeting);
  const verifyMeeting = useMutation(api.meetings.verifyMeeting);

  const formattedDate = new Date(meeting.meetingDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const pendingActions = meeting.actionItems.filter(a => a.status === 'pending');
  const completedActions = meeting.actionItems.filter(a => a.status === 'completed');

  const handleToggleActionItem = async (itemId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    await updateActionItemStatus({
      meetingId: meeting._id,
      actionItemId: itemId,
      status: newStatus,
    });
  };

  const handlePromoteToTask = async (item: ActionItem) => {
    if (!currentUser?._id) return;

    setPromotingItemId(item.id);
    try {
      await promoteToTask({
        meetingId: meeting._id,
        actionItemId: item.id,
        createdBy: currentUser._id,
        taskTitle: item.description,
        taskDueDate: item.dueDate,
      });
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setPromotingItemId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;

    try {
      await deleteMeeting({ meetingId: meeting._id });
      onClose();
    } catch (error) {
      console.error('Failed to delete meeting:', error);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      await verifyMeeting({ meetingId: meeting._id });
    } catch (error) {
      console.error('Failed to verify meeting:', error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDismiss = async () => {
    if (!confirm('Dismiss this auto-extracted meeting? This will delete it.')) return;
    try {
      await deleteMeeting({ meetingId: meeting._id });
      onClose();
    } catch (error) {
      console.error('Failed to dismiss meeting:', error);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {meeting.meetingType && (
                  <Badge
                    variant="secondary"
                    className={`${meetingTypeColors[meeting.meetingType] || meetingTypeColors.other}`}
                  >
                    {meetingTypeLabels[meeting.meetingType] || meeting.meetingType}
                  </Badge>
                )}
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Calendar className="w-4 h-4" />
                  {formattedDate}
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFlagModalOpen(true)}
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                title="Flag for Review"
              >
                <Flag className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Attendees */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Users className="w-4 h-4" />
            <span className="font-medium">{meeting.attendees.length} attendees:</span>
            <span className="text-gray-500">
              {meeting.attendees.slice(0, 3).map(a => a.name).join(', ')}
              {meeting.attendees.length > 3 && ` +${meeting.attendees.length - 3} more`}
            </span>
          </div>

          {/* Source Document */}
          {meeting.sourceDocumentName && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
              <FileText className="w-4 h-4" />
              <span>From: {meeting.sourceDocumentName}</span>
              {meeting.extractionConfidence && (
                <Badge variant="outline" className="text-xs">
                  {Math.round(meeting.extractionConfidence * 100)}% confidence
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Verification Banner */}
      {meeting.verified === false && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                This meeting was auto-extracted{meeting.sourceDocumentName ? ` from "${meeting.sourceDocumentName}"` : ''}. Please review before approving.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  onClick={handleVerify}
                  disabled={isVerifying}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isVerifying ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                  )}
                  Approve Meeting
                </Button>
                <Button
                  onClick={handleDismiss}
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Summary */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Summary
          </h2>
          <p className="text-gray-700 leading-relaxed">{meeting.summary}</p>
        </section>

        {/* Key Points */}
        {meeting.keyPoints.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Key Points
            </h2>
            <ul className="space-y-2">
              {meeting.keyPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span className="text-gray-700">{point}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Decisions */}
        {meeting.decisions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
              <CheckSquare className="w-4 h-4" />
              Decisions Made
            </h2>
            <ul className="space-y-2">
              {meeting.decisions.map((decision, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span className="text-gray-700">{decision}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Action Items */}
        {meeting.actionItems.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
              <ListChecks className="w-4 h-4" />
              Action Items
              <Badge variant="secondary" className="text-xs">
                {completedActions.length}/{meeting.actionItems.length} complete
              </Badge>
            </h2>
            <div className="space-y-3">
              {meeting.actionItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    item.status === 'completed'
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <Checkbox
                    checked={item.status === 'completed'}
                    onCheckedChange={() => handleToggleActionItem(item.id, item.status)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${item.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {item.description}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {item.assignee && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {item.assignee}
                        </span>
                      )}
                      {item.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.status === 'pending' && !item.taskId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePromoteToTask(item)}
                      disabled={promotingItemId === item.id || !currentUser}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs"
                    >
                      {promotingItemId === item.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <ArrowRight className="w-3 h-3 mr-1" />
                          Create Task
                        </>
                      )}
                    </Button>
                  )}
                  {item.taskId && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Task Created
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Attendees Detail */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Attendees
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {meeting.attendees.map((attendee, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white"
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {attendee.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {attendee.role && <span>{attendee.role}</span>}
                    {attendee.role && attendee.company && <span>•</span>}
                    {attendee.company && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {attendee.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Notes */}
        {meeting.notes && (
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Additional Notes
            </h2>
            <p className="text-gray-700 whitespace-pre-wrap">{meeting.notes}</p>
          </section>
        )}
      </div>

      <FlagCreationModal
        isOpen={flagModalOpen}
        onClose={() => setFlagModalOpen(false)}
        entityType="meeting"
        entityId={meeting._id}
        entityName={meeting.title}
        entityContext={formattedDate}
        clientId={clientId}
      />
    </div>
  );
}
