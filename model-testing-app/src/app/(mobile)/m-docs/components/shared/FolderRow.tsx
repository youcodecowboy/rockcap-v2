import { Folder } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

interface FolderRowProps {
  name: string;
  docCount: number;
  variant?: 'client' | 'project';
  onTap: () => void;
}

export default function FolderRow({ name, docCount, variant = 'client', onTap }: FolderRowProps) {
  const iconBg = variant === 'project' ? 'bg-[#eff6ff]' : 'bg-[#fef3c7]';
  const iconColor = variant === 'project' ? 'text-[#1e40af]' : 'text-[#a16207]';

  return (
    <button
      onClick={onTap}
      className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
    >
      <div className={`w-7 h-7 rounded-md ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Folder className={`w-3.5 h-3.5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--m-text-primary)]">{name}</div>
        <div className="text-[10px] text-[var(--m-text-tertiary)]">{docCount} document{docCount !== 1 ? 's' : ''}</div>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-placeholder)] flex-shrink-0" />
    </button>
  );
}
