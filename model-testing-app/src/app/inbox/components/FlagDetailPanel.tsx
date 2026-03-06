'use client';

import { Flag } from 'lucide-react';

interface FlagDetailPanelProps {
  flagId: string;
}

/**
 * Placeholder for the full flag detail view.
 * Task 8 will build this out with thread view, reply form, and actions.
 */
export default function FlagDetailPanel({ flagId }: FlagDetailPanelProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Flag className="w-10 h-10 mx-auto mb-3 text-orange-400" />
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Flag Detail</h3>
        <p className="text-xs text-gray-500 max-w-xs">
          Full thread view and reply functionality will be available here.
        </p>
        <p className="text-[10px] text-gray-300 mt-2 font-mono">{flagId}</p>
      </div>
    </div>
  );
}
