'use client';

import { KnowledgeBankSummary as KnowledgeBankSummaryType } from '@/types';

interface KnowledgeBankSummaryProps {
  summary: KnowledgeBankSummaryType;
}

export default function KnowledgeBankSummary({ summary }: KnowledgeBankSummaryProps) {
  return (
    <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
      <h3 className="font-semibold text-gray-900 mb-3">Client Summary</h3>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-2xl font-bold text-blue-600">{summary.totalEntries}</div>
          <div className="text-xs text-gray-600">Total Entries</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600">{summary.relatedProjects.length}</div>
          <div className="text-xs text-gray-600">Related Projects</div>
        </div>
      </div>

      {summary.recentDealUpdates.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Recent Deal Updates</h4>
          <div className="space-y-1">
            {summary.recentDealUpdates.slice(0, 3).map((entry) => (
              <div key={entry._id} className="text-xs text-gray-600 truncate">
                • {entry.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.allTags.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-700 mb-2">Tags</h4>
          <div className="flex flex-wrap gap-1">
            {summary.allTags.slice(0, 8).map((tag, idx) => (
              <span key={idx} className="px-2 py-0.5 text-xs bg-white text-gray-600 rounded border border-gray-200">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

