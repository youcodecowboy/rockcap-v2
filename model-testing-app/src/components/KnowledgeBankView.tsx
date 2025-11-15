'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import KnowledgeBankEntryCard from './KnowledgeBankEntryCard';
import KnowledgeBankSummary from './KnowledgeBankSummary';

interface KnowledgeBankViewProps {
  clientId?: Id<"clients"> | null;
  projectId?: Id<"projects"> | null;
  compact?: boolean;
  onClientSelect?: (clientId: Id<"clients"> | null) => void;
  onProjectSelect?: (projectId: Id<"projects"> | null) => void;
}

export default function KnowledgeBankView({
  clientId,
  projectId,
  compact = false,
  onClientSelect,
  onProjectSelect,
}: KnowledgeBankViewProps) {
  const [selectedEntryType, setSelectedEntryType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const entries = useQuery(
    api.knowledgeBank.getByClient,
    clientId ? { clientId } : 'skip'
  );

  const projectEntries = useQuery(
    api.knowledgeBank.getByProject,
    projectId ? { projectId } : 'skip'
  );

  const summary = useQuery(
    api.knowledgeBank.aggregateClientSummary,
    clientId ? { clientId } : "skip"
  );

  const displayedEntries = projectId ? projectEntries : entries;

  // Filter entries
  const filteredEntries = displayedEntries?.filter(entry => {
    if (selectedEntryType && entry.entryType !== selectedEntryType) {
      return false;
    }
    if (searchQuery) {
      const queryLower = searchQuery.toLowerCase();
      return (
        entry.title.toLowerCase().includes(queryLower) ||
        entry.content.toLowerCase().includes(queryLower) ||
        entry.keyPoints.some(kp => kp.toLowerCase().includes(queryLower)) ||
        entry.tags.some(tag => tag.toLowerCase().includes(queryLower))
      );
    }
    return true;
  }) || [];

  // Get unique entry types for filter
  const entryTypes = displayedEntries
    ? Array.from(new Set(displayedEntries.map(e => e.entryType)))
    : [];

  if (compact) {
    return (
      <div className="space-y-4">
        {filteredEntries.length === 0 ? (
          <div className="text-sm text-gray-500 p-4">No knowledge bank entries found.</div>
        ) : (
          filteredEntries.map((entry) => (
            <KnowledgeBankEntryCard key={entry._id} entry={entry} compact={true} />
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Search entries..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        
        {entryTypes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedEntryType(null)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                selectedEntryType === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {entryTypes.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedEntryType(type)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  selectedEntryType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary View */}
      {summary && clientId && (
        <KnowledgeBankSummary summary={summary} />
      )}

      {/* Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="text-sm text-gray-500 p-4 text-center">
          {searchQuery || selectedEntryType
            ? 'No entries match your filters.'
            : 'No knowledge bank entries found.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <KnowledgeBankEntryCard key={entry._id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

