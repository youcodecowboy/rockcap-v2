'use client';

import { KnowledgeBankEntry } from '@/types';

interface KnowledgeBankEntryCardProps {
  entry: KnowledgeBankEntry;
  compact?: boolean;
}

export default function KnowledgeBankEntryCard({ entry, compact = false }: KnowledgeBankEntryCardProps) {
  const getEntryTypeColor = (type: string) => {
    switch (type) {
      case 'deal_update':
        return 'bg-green-100 text-green-800';
      case 'project_status':
        return 'bg-blue-100 text-blue-800';
      case 'call_transcript':
        return 'bg-purple-100 text-purple-800';
      case 'email':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (compact) {
    return (
      <div className="p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-medium text-sm text-gray-900 line-clamp-1">{entry.title}</h4>
          <span className={`px-2 py-0.5 text-xs rounded ${getEntryTypeColor(entry.entryType)}`}>
            {entry.entryType.replace('_', ' ')}
          </span>
        </div>
        <p className="text-xs text-gray-600 line-clamp-2 mb-2">{entry.content}</p>
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {entry.tags.slice(0, 2).map((tag, idx) => (
              <span key={idx} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                {tag}
              </span>
            ))}
          </div>
          <span className="text-xs text-gray-500">
            {new Date(entry.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900">{entry.title}</h3>
        <span className={`px-2 py-1 text-xs font-medium rounded ${getEntryTypeColor(entry.entryType)}`}>
          {entry.entryType.replace('_', ' ')}
        </span>
      </div>
      
      <p className="text-sm text-gray-700 mb-3">{entry.content}</p>
      
      {entry.keyPoints.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-500 mb-1">Key Points:</h4>
          <ul className="list-disc list-inside space-y-1">
            {entry.keyPoints.slice(0, 3).map((point, idx) => (
              <li key={idx} className="text-xs text-gray-600">{point}</li>
            ))}
          </ul>
        </div>
      )}

      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
        <div className="mb-3 p-2 bg-gray-50 rounded text-xs">
          {entry.metadata.loanAmount && (
            <div>Loan Amount: {entry.metadata.loanAmount}</div>
          )}
          {entry.metadata.interestRate && (
            <div>Interest Rate: {entry.metadata.interestRate}</div>
          )}
          {entry.metadata.loanNumber && (
            <div>Loan Number: {entry.metadata.loanNumber}</div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag, idx) => (
            <span key={idx} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {tag}
            </span>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {new Date(entry.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

