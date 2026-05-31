'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FolderKanban, FileText, Clock } from 'lucide-react';
import { useColors } from '@/lib/useColors';

interface FolderCardProps {
  type: 'client' | 'project';
  id: string;
  name: string;
  documentCount: number;
  lastUpdated: string | null;
  clientName?: string; // For project folders
  onClick?: () => void;
}

export default function FolderCard({
  type,
  id,
  name,
  documentCount,
  lastUpdated,
  clientName,
  onClick,
}: FolderCardProps) {
  const router = useRouter();
  const colors = useColors();
  const [hover, setHover] = useState(false);

  const accent = type === 'client' ? colors.entityTypes.client : colors.entityTypes.project;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      if (type === 'client') {
        router.push(`/docs?clientId=${id}`);
      } else {
        router.push(`/docs/project/${id}`);
      }
    }
  };

  const formatLastUpdated = (dateString: string | null) => {
    if (!dateString) return 'Never';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: colors.bg.card,
        border: `1px solid ${hover ? accent : colors.border.default}`,
        borderTop: `2px solid ${accent}`,
        borderRadius: 4,
        padding: 14,
        cursor: 'pointer',
        transition: 'border-color 100ms linear',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {type === 'client' ? (
            <Building2 size={18} style={{ color: accent, flexShrink: 0 }} />
          ) : (
            <FolderKanban size={18} style={{ color: accent, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: hover ? accent : colors.text.primary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'color 100ms linear',
              }}
            >
              {name}
            </h3>
            {clientName && (
              <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {clientName}
              </p>
            )}
          </div>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            padding: '2px 7px',
            borderRadius: 2,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 9,
            color: colors.text.muted,
            border: `1px solid ${colors.border.default}`,
          }}
        >
          <FileText size={11} />
          {documentCount}
        </span>
      </div>

      {lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: colors.text.muted }}>
          <Clock size={11} />
          <span>Updated {formatLastUpdated(lastUpdated)}</span>
        </div>
      )}
    </div>
  );
}
