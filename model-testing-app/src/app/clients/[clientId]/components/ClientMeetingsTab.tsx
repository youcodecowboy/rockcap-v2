'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
    <div className="flex h-full bg-gray-50 overflow-hidden">
      {/* Left Sidebar - Meetings List */}
      <div className={`${isSidebarMinimized ? 'w-16' : 'w-80'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out relative overflow-visible`}>
        {/* Minimize Toggle Button */}
        <button
          onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
          className="absolute -right-3 top-4 z-10 p-1 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 transition-colors"
          title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
        >
          {isSidebarMinimized ? (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {!isSidebarMinimized ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">Meetings</h2>
                  {pendingActionsCount > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {pendingActionsCount} pending
                    </Badge>
                  )}
                </div>
              </div>

              {/* Add Meeting Button */}
              <Button
                onClick={() => setShowCreateModal(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 mb-3"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Meeting
              </Button>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search meetings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9"
                />
              </div>

              {/* Collapsible Filters */}
              <div className="mt-3">
                <button
                  onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    <span>Filters</span>
                    {hasActiveFilters && (
                      <Badge variant="secondary" className="text-[10px] px-1">1</Badge>
                    )}
                  </div>
                  {isFiltersExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                {isFiltersExpanded && (
                  <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                    {hasActiveFilters && (
                      <Button
                        onClick={clearAllFilters}
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs h-7"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear Filters
                      </Button>
                    )}

                    {/* Type Filter */}
                    {meetingTypes.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Type</label>
                        <div className="flex flex-wrap gap-1">
                          {meetingTypes.map(type => (
                            <button
                              key={type}
                              onClick={() => setFilterType(filterType === type ? null : type)}
                              className={`px-2 py-1 text-xs rounded ${
                                filterType === type
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {getMeetingTypeLabel(type)}
                            </button>
                          ))}
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
                <div className="p-4 text-sm text-gray-500">Loading...</div>
              ) : filteredMeetings.length === 0 ? (
                <div className="p-4 text-center">
                  <Video className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    {hasActiveFilters || searchQuery
                      ? 'No meetings match your filters.'
                      : 'No meetings yet.'}
                  </p>
                </div>
              ) : (
                <div>
                  {Object.entries(groupedMeetings).map(([month, monthMeetings]) => (
                    <div key={month}>
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-0">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase">
                          {month}
                        </h3>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {monthMeetings.map((meeting: any) => (
                          <MeetingCard
                            key={meeting._id}
                            meeting={meeting}
                            isSelected={selectedMeetingId === meeting._id}
                            onClick={() => setSelectedMeetingId(meeting._id)}
                          />
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
            <div className="p-2 border-b border-gray-200 flex flex-col items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                title="Add Meeting"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {filteredMeetings.map((meeting: any) => (
                <button
                  key={meeting._id}
                  onClick={() => {
                    setSelectedMeetingId(meeting._id);
                    setIsSidebarMinimized(false);
                  }}
                  className={`w-full p-2 flex justify-center ${
                    selectedMeetingId === meeting._id
                      ? 'bg-blue-100 text-blue-600'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                  title={meeting.title}
                >
                  <Calendar className="w-4 h-4" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {selectedMeeting ? (
          <MeetingDetailView
            meeting={selectedMeeting}
            clientId={clientId}
            onClose={() => setSelectedMeetingId(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center max-w-md">
              <Video className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {meetings.length === 0 ? 'No meetings yet' : 'Select a meeting'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {meetings.length === 0
                  ? `Add meeting summaries to track discussions, decisions, and action items for ${clientName}.`
                  : 'Select a meeting from the sidebar to view details, or add a new meeting.'}
              </p>
              <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Meeting
              </Button>
            </div>
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
