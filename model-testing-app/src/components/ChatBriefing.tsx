'use client';

import { AlertTriangle, TrendingUp, CircleDot } from 'lucide-react';

export interface BriefingItem {
  type: 'update' | 'warning' | 'missing';
  text: string;
  action?: string; // Pre-fill text for chat input
}

interface ChatBriefingProps {
  items: BriefingItem[];
  entityName: string;
  entityType: 'client' | 'project';
  onAskAbout: (text: string) => void;
}

export default function ChatBriefing({ items, entityName, entityType, onAskAbout }: ChatBriefingProps) {
  if (items.length === 0) return null;

  const icons = {
    update: <TrendingUp className="w-3.5 h-3.5 text-blue-500" />,
    warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
    missing: <CircleDot className="w-3.5 h-3.5 text-zinc-400" />,
  };

  return (
    <div className="mx-3 mb-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="text-xs font-medium text-zinc-500 mb-2">
        {entityType === 'client' ? 'Client' : 'Project'}: {entityName}
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <button
            key={i}
            className="w-full text-left flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            onClick={() => onAskAbout(item.action || `Tell me about: ${item.text}`)}
          >
            {icons[item.type]}
            <span>{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Generate briefing items from intelligence data.
 * This runs client-side — no API call needed.
 */
export function generateBriefingItems(intel: any): BriefingItem[] {
  if (!intel) return [];
  const items: BriefingItem[] = [];

  // Count filled fields
  let filledCount = 0;
  let totalFields = 0;
  const skip = new Set(['_id', '_creationTime', 'clientId', 'projectId', 'clientType', 'lastUpdated', 'lastUpdatedBy', 'version', 'extractedAttributes']);
  for (const [key, value] of Object.entries(intel)) {
    if (skip.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, any>);
      totalFields += entries.length;
      filledCount += entries.filter(([, v]) => v != null && v !== '').length;
    }
  }

  if (totalFields > 0) {
    const pct = Math.round((filledCount / totalFields) * 100);
    items.push({
      type: 'update',
      text: `${filledCount}/${totalFields} fields filled (${pct}%)`,
      action: 'What key fields are still missing?',
    });
  }

  // Check for missing critical financials
  const fin = intel.financials || {};
  const missingFinancials: string[] = [];
  if (!fin.loanAmount) missingFinancials.push('Loan Amount');
  if (!fin.ltv) missingFinancials.push('LTV');
  if (!fin.grossDevelopmentValue) missingFinancials.push('GDV');
  if (missingFinancials.length > 0) {
    items.push({
      type: 'missing',
      text: `Missing: ${missingFinancials.join(', ')}`,
      action: `Can you find the ${missingFinancials[0]} in the documents?`,
    });
  }

  return items;
}
