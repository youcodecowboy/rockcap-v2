'use client';

import { MessageSquare, Plus, Clock } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface ChatHistoryProps {
  currentSessionId: Id<"chatSessions"> | null;
  onSelectSession: (sessionId: Id<"chatSessions">) => void;
  onNewChat: () => void;
  contextType: 'global' | 'client' | 'project';
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
}

export default function ChatHistory({
  currentSessionId,
  onSelectSession,
  onNewChat,
  contextType,
  clientId,
  projectId,
}: ChatHistoryProps) {
  // Get sessions based on context
  const sessions = useQuery(api.chatSessions.list, {
    contextType,
    clientId,
    projectId,
  });

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

  const grouped = groupSessionsByDate(sessions);

  const SessionItem = ({ session }: { session: any }) => (
    <button
      onClick={() => onSelectSession(session._id)}
      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors group ${
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
            {session.messageCount} message{session.messageCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Today */}
        {grouped.today.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3 h-3 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Today</h3>
            </div>
            <div className="space-y-1">
              {grouped.today.map(session => (
                <SessionItem key={session._id} session={session} />
              ))}
            </div>
          </div>
        )}

        {/* Yesterday */}
        {grouped.yesterday.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3 h-3 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Yesterday</h3>
            </div>
            <div className="space-y-1">
              {grouped.yesterday.map(session => (
                <SessionItem key={session._id} session={session} />
              ))}
            </div>
          </div>
        )}

        {/* Older */}
        {grouped.older.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3 h-3 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Older</h3>
            </div>
            <div className="space-y-1">
              {grouped.older.map(session => (
                <SessionItem key={session._id} session={session} />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {sessions && sessions.length === 0 && (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No chat history yet</p>
            <p className="text-xs text-gray-400 mt-1">Start a new conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}

