'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';
import { Button, IconButton, StatusPill, FlagChip } from '@/components/layouts';
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

function SectionHeading({ icon, children, colors }: { icon: React.ReactNode; children: React.ReactNode; colors: ReturnType<typeof useColors>; }) {
  return (
    <h2
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: colors.text.muted,
        fontWeight: 500,
        margin: '0 0 12px 0',
      }}
    >
      {icon}
      {children}
    </h2>
  );
}

export default function MeetingDetailView({ meeting, clientId, onClose }: MeetingDetailViewProps) {
  const colors = useColors();
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
      <div
        className="sticky top-0 z-10"
        style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}` }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {meeting.meetingType && (
                  <StatusPill
                    label={meetingTypeLabels[meeting.meetingType] || meeting.meetingType}
                    tone={meetingTypeTone(meeting.meetingType, colors)}
                  />
                )}
                <div
                  className="flex items-center gap-1.5"
                  style={{ fontSize: 13, color: colors.text.muted }}
                >
                  <Calendar className="w-4 h-4" />
                  {formattedDate}
                </div>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: colors.text.primary, margin: 0 }}>
                {meeting.title}
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <IconButton label="Flag for Review" onClick={() => setFlagModalOpen(true)}>
                <Flag className="w-4 h-4" style={{ color: colors.accent.orange }} />
              </IconButton>
              <IconButton label="Delete meeting" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" style={{ color: colors.accent.red }} />
              </IconButton>
            </div>
          </div>

          {/* Attendees */}
          <div className="flex items-center gap-2" style={{ fontSize: 13, color: colors.text.muted }}>
            <Users className="w-4 h-4" />
            <span style={{ fontWeight: 500, color: colors.text.secondary }}>
              {meeting.attendees.length} attendees:
            </span>
            <span>
              {meeting.attendees.slice(0, 3).map(a => a.name).join(', ')}
              {meeting.attendees.length > 3 && ` +${meeting.attendees.length - 3} more`}
            </span>
          </div>

          {/* Source Document */}
          {meeting.sourceDocumentName && (
            <div className="mt-2 flex items-center gap-2" style={{ fontSize: 13, color: colors.text.muted }}>
              <FileText className="w-4 h-4" />
              <span>From: {meeting.sourceDocumentName}</span>
              {meeting.extractionConfidence && (
                <FlagChip label={`${Math.round(meeting.extractionConfidence * 100)}% confidence`} severity="info" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Verification Banner */}
      {meeting.verified === false && (
        <div
          className="mx-6 mt-4 p-4 rounded"
          style={{ background: `${colors.accent.yellow}15`, border: `1px solid ${colors.accent.yellow}40` }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: colors.accent.yellow }} />
            <div className="flex-1">
              <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                This meeting was auto-extracted{meeting.sourceDocumentName ? ` from "${meeting.sourceDocumentName}"` : ''}. Please review before approving.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  variant="primary"
                  accent={colors.accent.green}
                  size="sm"
                  onClick={handleVerify}
                  disabled={isVerifying}
                >
                  {isVerifying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Approve Meeting
                </Button>
                <Button variant="danger" size="sm" onClick={handleDismiss}>
                  <Trash2 className="w-4 h-4" />
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
          <SectionHeading icon={<MessageSquare className="w-4 h-4" />} colors={colors}>Summary</SectionHeading>
          <p style={{ color: colors.text.primary, lineHeight: 1.65 }}>{meeting.summary}</p>
        </section>

        {/* Key Points */}
        {meeting.keyPoints.length > 0 && (
          <section>
            <SectionHeading icon={<Lightbulb className="w-4 h-4" />} colors={colors}>Key Points</SectionHeading>
            <ul className="space-y-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {meeting.keyPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span style={{ color: colors.accent.blue, marginTop: 2 }}>•</span>
                  <span style={{ color: colors.text.primary }}>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Decisions */}
        {meeting.decisions.length > 0 && (
          <section>
            <SectionHeading icon={<CheckSquare className="w-4 h-4" />} colors={colors}>Decisions Made</SectionHeading>
            <ul className="space-y-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {meeting.decisions.map((decision, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span style={{ color: colors.accent.green, marginTop: 2 }}>✓</span>
                  <span style={{ color: colors.text.primary }}>{decision}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Action Items */}
        {meeting.actionItems.length > 0 && (
          <section>
            <SectionHeading icon={<ListChecks className="w-4 h-4" />} colors={colors}>
              Action Items
              <FlagChip label={`${completedActions.length}/${meeting.actionItems.length} complete`} severity="info" />
            </SectionHeading>
            <div className="space-y-3">
              {meeting.actionItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded"
                  style={{
                    background: item.status === 'completed' ? colors.bg.cardAlt : colors.bg.card,
                    border: `1px solid ${colors.border.default}`,
                  }}
                >
                  <Checkbox
                    checked={item.status === 'completed'}
                    onCheckedChange={() => handleToggleActionItem(item.id, item.status)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      style={{
                        fontSize: 13,
                        color: item.status === 'completed' ? colors.text.muted : colors.text.primary,
                        textDecoration: item.status === 'completed' ? 'line-through' : 'none',
                      }}
                    >
                      {item.description}
                    </p>
                    <div className="flex items-center gap-3 mt-1" style={{ fontSize: 11, color: colors.text.muted }}>
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
                    >
                      {promotingItemId === item.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <ArrowRight className="w-3 h-3" />
                          Create Task
                        </>
                      )}
                    </Button>
                  )}
                  {item.taskId && (
                    <FlagChip label="Task Created" severity="ok" />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Attendees Detail */}
        <section>
          <SectionHeading icon={<Users className="w-4 h-4" />} colors={colors}>Attendees</SectionHeading>
          <div className="grid grid-cols-2 gap-3">
            {meeting.attendees.map((attendee, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded"
                style={{ background: colors.bg.card, border: `1px solid ${colors.border.default}` }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: colors.bg.cardAlt, color: colors.text.muted }}
                >
                  <User className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: colors.text.primary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {attendee.name}
                  </p>
                  <div className="flex items-center gap-2" style={{ fontSize: 11, color: colors.text.muted }}>
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
            <SectionHeading icon={<FileText className="w-4 h-4" />} colors={colors}>Additional Notes</SectionHeading>
            <p style={{ color: colors.text.primary, whiteSpace: 'pre-wrap' }}>{meeting.notes}</p>
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
