/**
 * ClientHubSpotSection — desktop port of the mobile Overview hero zone.
 *
 * Surfaces HubSpot-enriched data on the desktop client profile so it matches
 * the mobile experience shipped in PR #11. Renders:
 *   - Sync strip: owner, last sync time, "Open in HubSpot" link
 *   - Deals summary cards (Open / Won / Lost totals)
 *   - Recent activity (2 most recent engagement rows)
 *   - Beauhurst KPIs mini (turnover / EBITDA / headcount / stage) when present
 *
 * Silently returns null when this client has no promoted HubSpot company
 * attached — keeps the Overview tab clean for non-HubSpot clients.
 */

'use client';

import { useQuery } from 'convex/react';
import {
  User, ExternalLink,
  StickyNote, Mail, Video, Phone, CheckSquare,
} from 'lucide-react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Panel, Row } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface ClientHubSpotSectionProps {
  clientId: Id<'clients'>;
}

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null) return '—';
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

function fmtRelative(iso?: string): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function fmtDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + time;
  }
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) + ', ' + time;
}

const ACTIVITY_META: Record<string, { Icon: typeof StickyNote; label: string; accentKey: 'purple' | 'orange' | 'green' | 'blue' | 'yellow' }> = {
  NOTE: { Icon: StickyNote, label: 'Note', accentKey: 'purple' },
  EMAIL: { Icon: Mail, label: 'Email', accentKey: 'orange' },
  INCOMING_EMAIL: { Icon: Mail, label: 'Email', accentKey: 'green' },
  MEETING: { Icon: Video, label: 'Meeting', accentKey: 'blue' },
  CALL: { Icon: Phone, label: 'Call', accentKey: 'yellow' },
  TASK: { Icon: CheckSquare, label: 'Task', accentKey: 'orange' },
};

function fmtBeauhurstMoney(raw: any): string {
  if (!raw) return '—';
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!isFinite(n) || n === 0) return '—';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${Math.round(n)}`;
}

export default function ClientHubSpotSection({ clientId }: ClientHubSpotSectionProps) {
  const colors = useColors();

  // Resolve the linked HubSpot company — the bridge we use everywhere else.
  const promotedCompanies = useQuery(api.companies.listByPromotedClient, { clientId });
  const primaryCompany = promotedCompanies?.[0];

  // Deals + recent activity keyed on the client (already handles the
  // company → client resolution inside the query handler).
  const openDeals = useQuery(api.deals.listOpenForClient, { clientId }) ?? [];
  const allDeals = useQuery(api.deals.listForClient, { clientId }) ?? [];
  const recentActivity = useQuery(api.activities.listRecentForClient, { clientId, limit: 2 }) ?? [];

  // Don't render anything if this client has no promoted HubSpot company —
  // keeps the page clean for legacy / non-HubSpot clients.
  if (!primaryCompany) return null;

  const openTotal = openDeals.reduce((s: number, d: any) => s + (d.amount ?? 0), 0);
  const won = allDeals.filter((d: any) => d.isClosedWon === true);
  const lost = allDeals.filter((d: any) => d.isClosed === true && d.isClosedWon !== true);
  const wonTotal = won.reduce((s: number, d: any) => s + (d.amount ?? 0), 0);
  const lostTotal = lost.reduce((s: number, d: any) => s + (d.amount ?? 0), 0);

  const md = primaryCompany.metadata as Record<string, any> | undefined;
  const beauhurstTurnover = md?.beauhurst_data_turnover;
  const beauhurstEbitda = md?.beauhurst_data_ebitda;
  const beauhurstHeadcount = md?.beauhurst_data_headcount;
  const beauhurstStage = md?.beauhurst_data_stage_of_evolution;
  const hasBeauhurst =
    beauhurstTurnover || beauhurstEbitda || beauhurstHeadcount || beauhurstStage;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Sync strip — owner + last sync + HubSpot link */}
      <div className="flex flex-wrap items-center gap-2" style={{ paddingLeft: 2, paddingRight: 2 }}>
        {primaryCompany.ownerName ? (
          <div
            className="flex items-center gap-1"
            style={{
              background: colors.bg.cardAlt,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            <User size={11} style={{ color: colors.text.muted }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: colors.text.secondary }}>
              {primaryCompany.ownerName}
            </span>
          </div>
        ) : null}
        {primaryCompany.lastHubSpotSync ? (
          <span style={{ fontSize: 11, color: colors.text.muted, fontFamily: MONO }}>
            Synced {fmtRelative(primaryCompany.lastHubSpotSync)}
          </span>
        ) : null}
        {primaryCompany.hubspotUrl ? (
          <a
            href={primaryCompany.hubspotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1"
            style={{ fontSize: 11, fontWeight: 500, color: colors.accent.blue, textDecoration: 'none' }}
          >
            HubSpot
            <ExternalLink size={11} />
          </a>
        ) : null}
      </div>

      {/* Deals + Activity row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Open Deals panel */}
        <Panel
          title="Open deals"
          accent={colors.entityTypes.client}
          actions={
            <span style={{ fontSize: 10, color: colors.text.muted, fontFamily: MONO }}>
              {allDeals.length} total
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 300, color: colors.text.primary }}>
                {formatMoney(openTotal)}
              </span>
              <span style={{ fontSize: 11, color: colors.text.muted }}>
                in {openDeals.length} open deals
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {openDeals
                .slice()
                .sort((a: any, b: any) => (b.amount ?? 0) - (a.amount ?? 0))
                .slice(0, 2)
                .map((d: any) => (
                  <div
                    key={d._id}
                    className="flex justify-between items-start"
                    style={{
                      padding: 8,
                      background: colors.bg.cardAlt,
                      border: `1px solid ${colors.border.light}`,
                      borderRadius: 4,
                    }}
                  >
                    <div className="flex-1 min-w-0" style={{ marginRight: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: colors.text.primary }} className="truncate">
                        {d.name}
                      </div>
                      <div style={{ fontSize: 10, color: colors.text.muted }}>
                        {d.stageName ?? d.stage ?? '—'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.text.primary, fontFamily: MONO }}>
                      {formatMoney(d.amount)}
                    </div>
                  </div>
                ))}
              {openDeals.length === 0 ? (
                <p style={{ fontSize: 11, color: colors.text.muted, fontStyle: 'italic' }}>No open deals</p>
              ) : null}
            </div>
            <div
              className="flex justify-between"
              style={{ paddingTop: 8, borderTop: `1px solid ${colors.border.light}`, fontSize: 11 }}
            >
              <span style={{ color: colors.text.muted }}>
                Won{' '}
                <span style={{ color: colors.entityTypes.client, fontWeight: 600, fontFamily: MONO }}>
                  {formatMoney(wonTotal)}
                </span>
              </span>
              <span style={{ color: colors.text.muted }}>
                Lost{' '}
                <span style={{ color: colors.text.secondary, fontWeight: 600, fontFamily: MONO }}>
                  {formatMoney(lostTotal)}
                </span>
              </span>
            </div>
          </div>
        </Panel>

        {/* Recent Activity panel */}
        <Panel title="Recent activity" accent={colors.accent.orange}>
          {recentActivity.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentActivity.map((a: any) => {
                const meta = ACTIVITY_META[a.activityType] ?? ACTIVITY_META.NOTE;
                const Icon = meta.Icon;
                const tint = colors.accent[meta.accentKey];
                return (
                  <div key={a._id} className="flex items-start gap-2.5">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 4,
                        background: `${tint}15`,
                        border: `1px solid ${tint}40`,
                      }}
                    >
                      <Icon size={15} style={{ color: tint }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 10, color: colors.text.muted }}>
                        <span style={{ fontWeight: 600, color: colors.text.secondary }}>{meta.label}</span>
                        {' · '}
                        {fmtDateTime(a.activityDate)}
                      </div>
                      <div style={{ fontSize: 11, color: colors.text.primary }} className="truncate">
                        {a.subject || a.bodyPreview || '(no subject)'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: colors.text.muted, fontStyle: 'italic' }}>No activity yet</p>
          )}
        </Panel>
      </div>

      {/* Beauhurst KPIs mini — only render if we have any data */}
      {hasBeauhurst ? (
        <Panel title="Beauhurst intel" accent={colors.accent.blue}>
          <Row label="Turnover" value={fmtBeauhurstMoney(beauhurstTurnover)} mono />
          <Row label="EBITDA" value={fmtBeauhurstMoney(beauhurstEbitda)} mono />
          <Row label="Headcount" value={beauhurstHeadcount ?? '—'} mono />
          <Row label="Stage" value={beauhurstStage ?? '—'} />
        </Panel>
      ) : null}
    </div>
  );
}
