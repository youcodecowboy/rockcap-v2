'use client';

interface CreationModeToggleProps {
  mode: 'task' | 'meeting';
  onModeChange: (mode: 'task' | 'meeting') => void;
}

export default function CreationModeToggle({ mode, onModeChange }: CreationModeToggleProps) {
  return (
    <div className="flex gap-1 p-1 bg-[var(--m-bg-subtle)] rounded-lg">
      <button
        onClick={() => onModeChange('task')}
        className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
          mode === 'task'
            ? 'bg-[var(--m-bg-card)] text-[var(--m-text-primary)] shadow-sm'
            : 'text-[var(--m-text-tertiary)]'
        }`}
      >
        Task
      </button>
      <button
        onClick={() => onModeChange('meeting')}
        className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
          mode === 'meeting'
            ? 'bg-[var(--m-bg-card)] text-[var(--m-text-primary)] shadow-sm'
            : 'text-[var(--m-text-tertiary)]'
        }`}
      >
        Meeting
      </button>
    </div>
  );
}
