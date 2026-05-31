'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';
import { Button, Input, StatusPill, EmptyState, FlagChip } from '@/components/layouts';
import MeetingCard from './MeetingCard';
import MeetingDetailView from './MeetingDetailView';
import CreateMeetingModal from './CreateMeetingModal';
import {
  Calendar,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Video,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

interface ClientMeetingsTabProps {
  clientId: Id<"clients">;
  clientName: string;
}

// Group meetings by month/year
function groupMeetingsByMonth(meetings: any[]) {
  const groups: Record<string, any[]> = {};

  meetings.forEach(meeting => {
    const date = new Date(meeting.meetingDate);
    const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(meeting);
  });

  return groups;
}

export default function ClientMeetingsTab({
  clientId,
  clientName,
}: ClientMeetingsTabProps) {
  const colors = useColors();
  const [selectedMeetingId, setSelectedMeetingId] = useState<Id<"meetings"> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Query meetings for this client
  const meetings = useQuery(api.meetings.getByClient, { clientId }) || [];
  const pendingActionsCount = useQuery(api.meetings.getPendingActionItemsCount, { clientId }) || 0;

  // Get selected meeting
  const selectedMeeting = useMemo(() => {
    if (!selectedMeetingId) return null;
    return meetings.find(m => m._id === selectedMeetingId);
  }, [meetings, selectedMeetingId]);

  // Get unique meeting types
  const meetingTypes = useMemo(() => {
    const types = new Set<string>();
    meetings.forEach(m => {
      if (m.meetingType) types.add(m.meetingType);
    });
    return Array.from(types);
  }, [meetings]);

  // Filter meetings
  const filteredMeetings = useMemo(() => {
    return meetings.filter(meeting => {
      // Search filter
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        const matchesSearch = (
          meeting.title?.toLowerCase().includes(queryLower) ||
          meeting.summary?.toLowerCase().includes(queryLower) ||
          meeting.attendees?.some((a: any) => a.name.toLowerCase().includes(queryLower))
        );
        if (!matchesSearch) return false;
      }

      // Type filter
      if (filterType && meeting.meetingType !== filterType) return false;

      return true;
    });
  }, [meetings, searchQuery, filterType]);

  // Group by month
  const groupedMeetings = useMemo(() => {
    return groupMeetingsByMonth(filteredMeetings);
  }, [filteredMeetings]);

  const hasActiveFilters = filterType !== null;

  const clearAllFilters = () => {
    setFilterType(null);
    setSearchQuery('');
  };

  const handleMeetingCreated = (meetingId: Id<"meetings">) => {
    setSelectedMeetingId(meetingId);
    setShowCreateModal(false);
  };

  const getMeetingTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      progress: 'Progress',
      kickoff: 'Kickoff',
      review: 'Review',
      site_visit: 'Site Visit',
      call: 'Call',
      other: 'Other',
    };
    return labels[type] || type;
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: colors.bg.light }}>
      {/* Left Sidebar - Meetings List */}
      <div
        className={`${isSidebarMinimized ? 'w-16' : 'w-80'} flex flex-col transition-all duration-300 ease-in-out relative overflow-visible`}
        style={{ background: colors.bg.card, borderRight: `1px solid ${colors.border.default}` }}
      >
        {/* Minimize Toggle Button */}
        <button
          onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
          className="absolute -right-3 top-4 z-10 p-1 rounded-full transition-colors"
          style={{ background: colors.bg.card, border: `1px solid ${colors.border.default}`, color: colors.text.muted }}
          title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
        >
          {isSidebarMinimized ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>

        {!isSidebarMinimized ? (
          <>
            {/* Header */}
            <div className="p-4" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: colors.text.muted,
                      fontWeight: 500,
                    }}
                  >
                    Meetings
                  </h2>
                  {pendingActionsCount > 0 && (
                    <FlagChip label={`${pendingActionsCount} pending`} severity="warn" />
                  )}
                </div>
              </div>

              {/* Add Meeting Button */}
              <div className="mb-3">
                <Button
                  variant="primary"
                  accent={colors.entityTypes.client}
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus className="w-4 h-4" />
                  Add Meeting
                </Button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: colors.text.muted }}
                />
                <Input
                  type="text"
                  placeholder="Search meetings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 32 } as any}
                />
              </div>

              {/* Collapsible Filters */}
              <div className="mt-3">
                <button
                  onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                  className="flex items-center justify-between w-full px-2 py-1.5 rounded transition-colors"
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: colors.text.muted,
                  }}
                >
                  <div className="flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    <span>Filters</span>
                    {hasActiveFilters && <FlagChip label="1" severity="info" />}
                  </div>
                  {isFiltersExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                {isFiltersExpanded && (
                  <div className="mt-2 space-y-2 pt-2" style={{ borderTop: `1px solid ${colors.border.default}` }}>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                        <X className="w-3 h-3" />
                        Clear Filters
                      </Button>
                    )}

                    {/* Type Filter */}
                    {meetingTypes.length > 0 && (
                      <div>
                        <label
                          className="mb-1 block"
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: 9,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: colors.text.muted,
                            fontWeight: 500,
                          }}
                        >
                          Type
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {meetingTypes.map(type => {
                            const active = filterType === type;
                            return (
                              <button
                                key={type}
                                onClick={() => setFilterType(active ? null : type)}
                                className="px-2 py-1 rounded"
                                style={{
                                  fontSize: 11,
                                  background: active ? `${colors.entityTypes.client}15` : colors.bg.cardAlt,
                                  color: active ? colors.entityTypes.client : colors.text.muted,
                                  border: `1px solid ${active ? `${colors.entityTypes.client}40` : colors.border.default}`,
                                }}
                              >
                                {getMeetingTypeLabel(type)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Meetings List - Grouped by Month */}
            <div className="flex-1 overflow-y-auto">
              {meetings === undefined ? (
                <div className="p-4" style={{ fontSize: 12, color: colors.text.muted }}>Loading...</div>
              ) : filteredMeetings.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<Video size={28} />}
                    title={hasActiveFilters || searchQuery ? 'No meetings match your filters' : 'No meetings yet'}
                  />
                </div>
              ) : (
                <div>
                  {Object.entries(groupedMeetings).map(([month, monthMeetings]) => (
                    <div key={month}>
                      <div
                        className="px-4 py-2 sticky top-0"
                        style={{
                          background: colors.bg.light,
                          borderBottom: `1px solid ${colors.border.default}`,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: colors.text.muted,
                          fontWeight: 500,
                        }}
                      >
                        {month}
                      </div>
                      <div style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                        {monthMeetings.map((meeting: any) => (
                          <div key={meeting._id} style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                            <MeetingCard
                              meeting={meeting}
                              isSelected={selectedMeetingId === meeting._id}
                              onClick={() => setSelectedMeetingId(meeting._id)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Minimized sidebar view */
          <>
            <div
              className="p-2 flex flex-col items-center gap-2"
              style={{ borderBottom: `1px solid ${colors.border.default}` }}
            >
              <button
                onClick={() => setShowCreateModal(true)}
                className="p-2 rounded"
                style={{ background: colors.entityTypes.client, color: '#ffffff' }}
                title="Add Meeting"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {filteredMeetings.map((meeting: any) => {
                const active = selectedMeetingId === meeting._id;
                return (
                  <button
                    key={meeting._id}
                    onClick={() => {
                      setSelectedMeetingId(meeting._id);
                      setIsSidebarMinimized(false);
                    }}
                    className="w-full p-2 flex justify-center"
                    style={{
                      background: active ? `${colors.entityTypes.client}15` : 'transparent',
                      color: active ? colors.entityTypes.client : colors.text.muted,
                    }}
                    title={meeting.title}
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: colors.bg.card }}>
        {selectedMeeting ? (
          <MeetingDetailView
            meeting={selectedMeeting}
            clientId={clientId}
            onClose={() => setSelectedMeetingId(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={<Video size={40} />}
              title={meetings.length === 0 ? 'No meetings yet' : 'Select a meeting'}
              body={
                meetings.length === 0
                  ? `Add meeting summaries to track discussions, decisions, and action items for ${clientName}.`
                  : 'Select a meeting from the sidebar to view details, or add a new meeting.'
              }
              action={
                <Button variant="primary" accent={colors.entityTypes.client} onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4" />
                  Add Meeting
                </Button>
              }
            />
          </div>
        )}
      </div>

      {/* Create Meeting Modal */}
      <CreateMeetingModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        clientId={clientId}
        clientName={clientName}
        onMeetingCreated={handleMeetingCreated}
      />
    </div>
  );
}
