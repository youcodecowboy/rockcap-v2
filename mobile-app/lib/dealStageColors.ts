/**
 * Deal stage category → color tone mapping.
 *
 * HubSpot returns `stage` as an opaque ID (e.g. "2388762828") and we resolve
 * `stageName` via pipelines.ts at sync time. But pipeline names vary per
 * tenant ("Contract Sent", "Appointment", "Proposal", etc.). Rather than
 * hardcode every stage ID, we categorize by the stageName using keywords.
 */

export type StageCategory = 'amber' | 'blue' | 'purple' | 'green' | 'grey';

const KEYWORD_MAP: { keywords: string[]; category: StageCategory }[] = [
  // Closed stages take priority (checked first)
  { keywords: ['closed won', 'won', 'closedwon'], category: 'green' },
  { keywords: ['closed lost', 'lost', 'closedlost'], category: 'grey' },
  // Near-close activity
  { keywords: ['contract', 'appointment', 'scheduled'], category: 'amber' },
  // Mid-pipeline proposals
  { keywords: ['proposal', 'initial', 'qualification'], category: 'blue' },
  // Active negotiation
  { keywords: ['negotiation', 'discovery', 'demo'], category: 'purple' },
];

const TONES: Record<StageCategory, { bg: string; text: string }> = {
  amber: { bg: '#fef3c7', text: '#d97706' },
  blue: { bg: '#dbeafe', text: '#2563eb' },
  purple: { bg: '#f3e8ff', text: '#9333ea' },
  green: { bg: '#dcfce7', text: '#059669' },
  grey: { bg: '#f5f5f4', text: '#525252' },
};

export function categorizeStage(stageName?: string): StageCategory {
  if (!stageName) return 'blue';
  const lower = stageName.toLowerCase();
  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some((k) => lower.includes(k))) return entry.category;
  }
  return 'blue'; // default for unrecognized
}

export function stageTone(stageName?: string): { bg: string; text: string } {
  return TONES[categorizeStage(stageName)];
}
