import Link from 'next/link';
import { Pencil, CheckSquare, Upload, UserPlus } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';

const actions: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/m-notes', label: 'New Note', icon: Pencil },
  { href: '/m-tasks', label: 'New Task', icon: CheckSquare },
  { href: '/m-docs', label: 'Upload', icon: Upload },
  { href: '/m-contacts', label: 'New Contact', icon: UserPlus },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-2 px-[var(--m-page-px)] pb-4">
      {actions.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-2 px-2.5 py-2 bg-black rounded-md active:opacity-80"
        >
          <div className="w-6 h-6 rounded-[5px] bg-white/15 flex items-center justify-center flex-shrink-0">
            <Icon className="w-3 h-3 text-white" />
          </div>
          <span className="text-[12px] font-medium text-white">{label}</span>
        </Link>
      ))}
    </div>
  );
}
