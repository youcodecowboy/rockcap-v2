'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Building2,
  FolderKanban,
  ListTodo,
  Video,
  CheckSquare,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ENTITY_TYPE_LABELS, buildEntityLink } from './utils';

interface EntityContextHeaderProps {
  entityType: string;
  entityId: string;
  clientId?: string;
  projectId?: string;
  compact?: boolean;
}

const ENTITY_ICON_CONFIG: Record<string, { icon: typeof FileText; bg: string; color: string }> = {
  document: { icon: FileText, bg: 'bg-blue-50', color: 'text-blue-600' },
  client: { icon: Building2, bg: 'bg-green-50', color: 'text-green-600' },
  project: { icon: FolderKanban, bg: 'bg-purple-50', color: 'text-purple-600' },
  task: { icon: ListTodo, bg: 'bg-amber-50', color: 'text-amber-600' },
  meeting: { icon: Video, bg: 'bg-cyan-50', color: 'text-cyan-600' },
  checklist_item: { icon: CheckSquare, bg: 'bg-orange-50', color: 'text-orange-600' },
};

export default function EntityContextHeader({
  entityType,
  entityId,
  clientId,
  projectId,
  compact = false,
}: EntityContextHeaderProps) {
  const router = useRouter();
  const entityLabel = ENTITY_TYPE_LABELS[entityType] || entityType;

  const entityContext = useQuery(api.flags.getEntityContext, {
    entityType: entityType as any,
    entityId,
  });

  const iconConfig = ENTITY_ICON_CONFIG[entityType] || ENTITY_ICON_CONFIG.document;
  const IconComponent = iconConfig.icon;
  const entityLink = buildEntityLink(entityType, entityId, clientId, projectId);

  // Loading state
  if (entityContext === undefined) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        <span className="text-sm text-gray-400">Loading {entityLabel}...</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
      {/* Entity icon */}
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-lg ${iconConfig.bg} flex items-center justify-center`}
      >
        <IconComponent className={`h-5 w-5 ${iconConfig.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Entity type label */}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {entityLabel}
        </span>

        {/* Badges */}
        {entityContext.badges && entityContext.badges.length > 0 && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {entityContext.badges.map((badge) => (
              <Badge key={badge} variant="outline" className="text-[10px] px-1.5 py-0">
                {badge}
              </Badge>
            ))}
          </div>
        )}

        {/* Entity name */}
        <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">
          {entityContext.name}
        </p>

        {/* Subtitle */}
        {entityContext.subtitle && (
          <p className="text-xs text-gray-500 truncate">{entityContext.subtitle}</p>
        )}

        {/* Summary (only when not compact) */}
        {!compact && entityContext.summary && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{entityContext.summary}</p>
        )}
      </div>

      {/* View button */}
      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-900"
        onClick={() => router.push(entityLink)}
      >
        View
        <ExternalLink className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
}
