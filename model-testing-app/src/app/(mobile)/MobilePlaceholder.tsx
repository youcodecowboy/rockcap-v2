import { type LucideIcon } from 'lucide-react';

interface MobilePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export default function MobilePlaceholder({ title, description, icon: Icon }: MobilePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-[var(--m-page-px)]">
      <div className="w-10 h-10 rounded-lg bg-[var(--m-bg-inset)] flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-[var(--m-text-tertiary)]" />
      </div>
      <h1 className="text-[15px] font-medium text-[var(--m-text-primary)] mb-1">{title}</h1>
      <p className="text-[12px] text-[var(--m-text-tertiary)] max-w-[240px] text-center leading-relaxed">{description}</p>
    </div>
  );
}
