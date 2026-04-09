'use client';

import Link from 'next/link';
import { File, FolderKanban, Building, X } from 'lucide-react';

export interface EntityReference {
  type: 'document' | 'project' | 'client';
  id: string;
  name: string;
  meta?: any;
}

interface ReferenceChipProps {
  reference: EntityReference;
  removable?: boolean;
  onRemove?: () => void;
}

const ICON_MAP = {
  document: File,
  project: FolderKanban,
  client: Building,
};

const COLOR_MAP = {
  document: 'bg-blue-50 text-blue-700 border-blue-200',
  project: 'bg-purple-50 text-purple-700 border-purple-200',
  client: 'bg-green-50 text-green-700 border-green-200',
};

function getEntityHref(ref: EntityReference): string {
  switch (ref.type) {
    case 'document':
      return `/docs/reader/${ref.id}`;
    case 'project':
      return ref.meta?.clientId
        ? `/clients/${ref.meta.clientId}/projects/${ref.id}`
        : '#';
    case 'client':
      return `/clients/${ref.id}`;
    default:
      return '#';
  }
}

export default function ReferenceChip({ reference, removable, onRemove }: ReferenceChipProps) {
  const Icon = ICON_MAP[reference.type];
  const colors = COLOR_MAP[reference.type];

  const content = (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors}`}>
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate max-w-[140px]">{reference.name}</span>
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );

  if (removable) return content;

  return (
    <Link href={getEntityHref(reference)} className="hover:opacity-80 transition-opacity">
      {content}
    </Link>
  );
}
