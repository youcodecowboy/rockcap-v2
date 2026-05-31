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
} from 'lucide-react';
import { Button, StatusPill, Skeleton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { ENTITY_TYPE_LABELS, buildEntityLink } from './utils';

interface EntityContextHeaderProps {
  entityType: string;
  entityId: string;
  clientId?: string;
  projectId?: string;
  compact?: boolean;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const ENTITY_ICON_CONFIG: Record<
  string,
  { icon: typeof FileText; accent: keyof ReturnType<typeof useColors>['accent'] }
> = {
  document: { icon: FileText, accent: 'blue' },
  client: { icon: Building2, accent: 'green' },
  project: { icon: FolderKanban, accent: 'purple' },
  task: { icon: ListTodo, accent: 'yellow' },
  meeting: { icon: Video, accent: 'cyan' },
  checklist_item: { icon: CheckSquare, accent: 'orange' },
};

export default function EntityContextHeader({
  entityType,
  entityId,
  clientId,
  projectId,
  compact = false,
}: EntityContextHeaderProps) {
  const router = useRouter();
  const colors = useColors();
  const entityLabel = ENTITY_TYPE_LABELS[entityType] || entityType;

  const entityContext = useQuery(api.flags.getEntityContext, {
    entityType: entityType as any,
    entityId,
  });

  const iconConfig = ENTITY_ICON_CONFIG[entityType] || ENTITY_ICON_CONFIG.document;
  const IconComponent = iconConfig.icon;
  const accent = colors.accent[iconConfig.accent];
  const entityLink = buildEntityLink(entityType, entityId, clientId, projectId);

  // Loading state
  if (entityContext === undefined) {
    return (
      <div
        className="flex items-center gap-3 px-5 py-3"
        style={{ borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light }}
      >
        <Skeleton width={40} height={40} />
        <Skeleton width={160} height={12} />
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 px-5 py-3"
      style={{ borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light }}
    >
      {/* Entity icon */}
      <div
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center"
        style={{ background: `${accent}15`, border: `1px solid ${accent}40`, borderRadius: 4 }}
      >
        <IconComponent className="h-5 w-5" style={{ color: accent }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Entity type label */}
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.text.muted,
            fontWeight: 500,
          }}
        >
          {entityLabel}
        </span>

        {/* Badges */}
        {entityContext.badges && entityContext.badges.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1">
            {entityContext.badges.map((badge) => (
              <StatusPill key={badge} label={badge} tone={colors.text.muted} />
            ))}
          </div>
        )}

        {/* Entity name */}
        <p
          className="text-sm font-semibold truncate mt-0.5"
          style={{ color: colors.text.primary }}
        >
          {entityContext.name}
        </p>

        {/* Subtitle */}
        {entityContext.subtitle && (
          <p className="text-xs truncate" style={{ color: colors.text.muted }}>
            {entityContext.subtitle}
          </p>
        )}

        {/* Summary (only when not compact) */}
        {!compact && entityContext.summary && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: colors.text.muted }}>
            {entityContext.summary}
          </p>
        )}
      </div>

      {/* View button */}
      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0"
        onClick={() => router.push(entityLink)}
      >
        View
        <ExternalLink className="h-3 w-3" />
      </Button>
    </div>
  );
}
