'use client';

import { LucideIcon } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { FlagChip } from '@/components/layouts';

interface CompactMetricCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconColor?: 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'gray' | 'red';
  badge?: {
    text: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  };
  className?: string;
  onClick?: () => void;
  stacked?: boolean; // Stacked layout (badge below value)
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// Canon replacement: renders like <StatTile> (mono-uppercase label, weight-300
// value, 2px top accent) while preserving the existing prop signature so all
// current callers keep working. `iconColor` maps onto colors.accent.* (gray
// falls back to the neutral mid border).
export default function CompactMetricCard({
  label,
  value,
  icon: Icon,
  iconColor = 'blue',
  badge,
  className,
  onClick,
  stacked = false,
}: CompactMetricCardProps) {
  const colors = useColors();

  const accentMap: Record<NonNullable<CompactMetricCardProps['iconColor']>, string> = {
    blue: colors.accent.blue,
    green: colors.accent.green,
    purple: colors.accent.purple,
    orange: colors.accent.orange,
    yellow: colors.accent.yellow,
    red: colors.accent.red,
    gray: colors.border.mid,
  };
  const accent = accentMap[iconColor] ?? colors.accent.blue;

  // Map the old shadcn badge variant onto a canon FlagChip severity.
  const badgeSeverity =
    badge?.variant === 'destructive' ? 'warn' : badge?.variant === 'secondary' ? 'info' : 'ok';

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderTop: `2px solid ${accent}`,
        borderRadius: 4,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: stacked ? 'flex-start' : 'center',
        gap: 10,
      }}
    >
      {Icon && (
        <Icon
          style={{ width: 16, height: 16, flexShrink: 0, color: accent, marginTop: stacked ? 2 : 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.text.muted,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 300,
            color: colors.text.primary,
            marginTop: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </div>
        {badge && (
          <div style={{ marginTop: 6 }}>
            <FlagChip label={badge.text} severity={badgeSeverity} />
          </div>
        )}
      </div>
    </div>
  );
}
