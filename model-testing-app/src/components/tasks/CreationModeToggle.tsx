'use client';

import { useColors } from '@/lib/useColors';

interface CreationModeToggleProps {
  mode: 'task' | 'meeting';
  onModeChange: (mode: 'task' | 'meeting') => void;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function CreationModeToggle({ mode, onModeChange }: CreationModeToggleProps) {
  const colors = useColors();
  const tab = (value: 'task' | 'meeting', label: string) => {
    const active = mode === value;
    return (
      <button
        onClick={() => onModeChange(value)}
        className="flex-1"
        style={{
          padding: '6px 0',
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          fontWeight: 500,
          borderRadius: 3,
          cursor: 'pointer',
          border: `1px solid ${active ? colors.border.default : 'transparent'}`,
          background: active ? colors.bg.card : 'transparent',
          color: active ? colors.text.primary : colors.text.muted,
          transition: 'background 100ms linear, color 100ms linear',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="flex gap-1"
      style={{
        padding: 3,
        background: colors.bg.cardAlt,
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
      }}
    >
      {tab('task', 'Task')}
      {tab('meeting', 'Meeting')}
    </div>
  );
}
