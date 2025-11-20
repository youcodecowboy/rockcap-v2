'use client';

import { useState, useMemo } from 'react';
import { MessageSquare, Plus, Clock, ChevronDown, ChevronRight, Search, X, Trash2 } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface ChatHistoryProps {
  currentSessionId: Id<"chatSessions"> | null;
  onSelectSession: (sessionId: Id<"chatSessions">) => void;
  onNewChat: () => void;
  onDeleteSession?: (sessionId: Id<"chatSessions">) => void;
  contextType: 'global' | 'client' | 'project';
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
}

export default function ChatHistory({
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  contextType,
  clientId,
  projectId,
}: ChatHistoryProps) {
  // State for collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<{
    today: boolean;
    yesterday: boolean;
    older: boolean;
  }>({
    today: false,
    yesterday: false,
    older: true, // Older section collapsed by default
  });

  // State for search
  const [searchQuery, setSearchQuery] = useState('');

  // Get sessions based on context
  const sessions = useQuery(api.chatSessions.list, {
    contextType,
    clientId,
    projectId,
  });

  // Filter sessions based on search query
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchQuery.trim()) return sessions;
    
    const query = searchQuery.toLowerCase().trim();
    return sessions.filter(session => 
      session.title.toLowerCase().includes(query)
    );
  }, [sessions, searchQuery]);

  const toggleSection = (section: 'today' | 'yesterday' | 'older') => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    // For older dates, show formatted date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const groupSessionsByDate = (sessions: any[] | undefined) => {
    if (!sessions) return { today: [], yesterday: [], older: [] };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = {
      today: [] as any[],
      yesterday: [] as any[],
      older: [] as any[],
    };

    sessions.forEach(session => {
      const sessionDate = new Date(session.lastMessageAt);
      const sessionDay = new Date(
        sessionDate.getFullYear(),
        sessionDate.getMonth(),
        sessionDate.getDate()
      );

      if (sessionDay.getTime() === today.getTime()) {
        groups.today.push(session);
      } else if (sessionDay.getTime() === yesterday.getTime()) {
        groups.yesterday.push(session);
      } else {
        groups.older.push(session);
      }
    });

    return groups;
  };

  const grouped = groupSessionsByDate(searchQuery.trim() ? filteredSessions : sessions);

  const SessionItem = ({ session }: { session: any }) => {
    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onDeleteSession && confirm(`Are you sure you want to delete "${session.title}"?`)) {
        onDeleteSession(session._id);
      }
    };

    return (
      <div className="relative group/item">
        <button
          onClick={() => onSelectSession(session._id)}
          className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors ${
            currentSessionId === session._id ? 'bg-gray-100' : ''
          }`}
        >
          <div className="flex items-start gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {session.title}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {session.messageCount} message{session.messageCount !== 1 ? 's' : ''} • {formatDate(session.lastMessageAt)}
              </div>
            </div>
          </div>
        </button>
        {onDeleteSession && (
          <button
            onClick={handleDelete}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover/item:opacity-100 hover:bg-red-50 rounded transition-all text-red-600"
            title="Delete chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
        
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded transition-colors"
              title="Clear search"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Search Results - Show flat list when searching */}
        {searchQuery.trim() && filteredSessions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-3 h-3 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase">
                Search Results ({filteredSessions.length})
              </h3>
            </div>
            <div className="space-y-1">
              {filteredSessions.map(session => (
                <SessionItem key={session._id} session={session} />
              ))}
            </div>
          </div>
        )}

        {/* Today - Only show when not searching */}
        {!searchQuery.trim() && grouped.today.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('today')}
              className="flex items-center gap-2 mb-2 w-full text-left hover:bg-gray-100 rounded px-1 py-1 transition-colors"
            >
              {collapsedSections.today ? (
                <ChevronRight className="w-3 h-3 text-gray-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-gray-400" />
              )}
              <Clock className="w-3 h-3 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Today</h3>
            </button>
            {!collapsedSections.today && (
              <div className="space-y-1">
                {grouped.today.map(session => (
                  <SessionItem key={session._id} session={session} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Yesterday - Only show when not searching */}
        {!searchQuery.trim() && grouped.yesterday.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('yesterday')}
              className="flex items-center gap-2 mb-2 w-full text-left hover:bg-gray-100 rounded px-1 py-1 transition-colors"
            >
              {collapsedSections.yesterday ? (
                <ChevronRight className="w-3 h-3 text-gray-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-gray-400" />
              )}
              <Clock className="w-3 h-3 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Yesterday</h3>
            </button>
            {!collapsedSections.yesterday && (
              <div className="space-y-1">
                {grouped.yesterday.map(session => (
                  <SessionItem key={session._id} session={session} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Older - Only show when not searching */}
        {!searchQuery.trim() && grouped.older.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('older')}
              className="flex items-center gap-2 mb-2 w-full text-left hover:bg-gray-100 rounded px-1 py-1 transition-colors"
            >
              {collapsedSections.older ? (
                <ChevronRight className="w-3 h-3 text-gray-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-gray-400" />
              )}
              <Clock className="w-3 h-3 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Older</h3>
            </button>
            {!collapsedSections.older && (
              <div className="space-y-1">
                {grouped.older.map(session => (
                  <SessionItem key={session._id} session={session} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {sessions && sessions.length === 0 && !searchQuery && (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No chat history yet</p>
            <p className="text-xs text-gray-400 mt-1">Start a new conversation</p>
          </div>
        )}

        {/* No Search Results */}
        {searchQuery && filteredSessions.length === 0 && (
          <div className="text-center py-8">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No chats found</p>
            <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
}

