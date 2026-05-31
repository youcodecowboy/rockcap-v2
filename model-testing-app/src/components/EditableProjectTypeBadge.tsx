'use client';

import { ChevronDown } from 'lucide-react';
import { useColors } from '@/lib/useColors';

type ProjectType = 'new-build' | 'roof-renovation' | 'new-development' | 'renovation' | 'refurbishment' | 'extension' | 'commercial' | 'residential';

interface EditableProjectTypeBadgeProps {
  type: ProjectType | string | undefined;
  onTypeChange: (type: ProjectType) => void;
  className?: string;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const TYPE_LABELS: Record<ProjectType, string> = {
  'new-build': 'New Build',
  'roof-renovation': 'Roof Renovation',
  'new-development': 'New Development',
  'renovation': 'Renovation',
  'refurbishment': 'Refurbishment',
  'extension': 'Extension',
  'commercial': 'Commercial',
  'residential': 'Residential',
};

export default function EditableProjectTypeBadge({
  type,
  onTypeChange,
  className = '',
}: EditableProjectTypeBadgeProps) {
  const colors = useColors();
  const normalizedType = type || 'new-build';
  const currentType = (Object.keys(TYPE_LABELS).includes(normalizedType)
    ? normalizedType
    : 'new-build') as ProjectType;

  // Project entity tone = indigo.
  const tone = colors.entityTypes.project;

  return (
    <div className={className} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        value={currentType}
        onChange={(e) => onTypeChange(e.target.value as ProjectType)}
        style={{
          appearance: 'none',
          cursor: 'pointer',
          fontFamily: MONO,
          fontSize: 9,
          lineHeight: 1.3,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          padding: '2px 20px 2px 6px',
          borderRadius: 2,
          background: `${tone}20`,
          color: tone,
          border: `1px solid ${tone}40`,
          outline: 'none',
        }}
      >
        {(Object.keys(TYPE_LABELS) as ProjectType[]).map((value) => (
          <option key={value} value={value} style={{ color: colors.text.primary, background: colors.bg.card }}>
            {TYPE_LABELS[value]}
          </option>
        ))}
      </select>
      <ChevronDown
        size={11}
        style={{ position: 'absolute', right: 5, color: tone, pointerEvents: 'none', opacity: 0.7 }}
      />
    </div>
  );
}
