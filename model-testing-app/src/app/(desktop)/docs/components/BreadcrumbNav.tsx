'use client';

import { ChevronRight, Home, Inbox } from 'lucide-react';
import { useColors } from '@/lib/useColors';

interface BreadcrumbNavProps {
  clientName?: string;
  projectName?: string;
  folderName?: string;
  isInbox?: boolean;
  onHomeClick: () => void;
  onClientClick?: () => void;
  onProjectClick?: () => void;
}

export default function BreadcrumbNav({
  clientName,
  projectName,
  folderName,
  isInbox,
  onHomeClick,
  onClientClick,
  onProjectClick,
}: BreadcrumbNavProps) {
  const colors = useColors();

  const crumbBtn = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    borderRadius: 4,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    transition: 'background 100ms linear, color 100ms linear',
  } as const;

  const sep = <ChevronRight className="w-4 h-4" style={{ color: colors.text.dim }} />;

  return (
    <nav className="flex items-center gap-1">
      {/* Home */}
      <button
        onClick={onHomeClick}
        style={{ ...crumbBtn, color: colors.text.muted }}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; e.currentTarget.style.color = colors.text.primary; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.text.muted; }}
      >
        <Home className="w-4 h-4" />
        <span>Documents</span>
      </button>

      {/* Inbox path */}
      {isInbox && (
        <>
          {sep}
          <span
            className="flex items-center gap-1"
            style={{ padding: '4px 8px', fontSize: 12, fontWeight: 500, color: colors.text.primary }}
          >
            <Inbox className="w-4 h-4" />
            Inbox
          </span>
        </>
      )}

      {/* Client */}
      {clientName && !isInbox && (
        <>
          {sep}
          {folderName || projectName ? (
            <button
              onClick={onClientClick}
              style={{ ...crumbBtn, color: colors.text.muted }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; e.currentTarget.style.color = colors.text.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.text.muted; }}
            >
              {clientName}
            </button>
          ) : (
            <span style={{ padding: '4px 8px', fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
              {clientName}
            </span>
          )}
        </>
      )}

      {/* Project */}
      {projectName && (
        <>
          {sep}
          {folderName ? (
            <button
              onClick={onProjectClick}
              style={{ ...crumbBtn, color: colors.text.muted }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; e.currentTarget.style.color = colors.text.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.text.muted; }}
            >
              {projectName}
            </button>
          ) : (
            <span style={{ padding: '4px 8px', fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
              {projectName}
            </span>
          )}
        </>
      )}

      {/* Folder */}
      {folderName && (
        <>
          {sep}
          <span style={{ padding: '4px 8px', fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
            {folderName}
          </span>
        </>
      )}
    </nav>
  );
}
