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
import Link from 'next/link';
import {
  TrendingUp, Clock, Building2, User, ExternalLink,
  StickyNote, Mail, Video, Phone, CheckSquare,
} from 'lucide-react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

const ACTIVITY_TILE: Record<string, { bg: string; tint: string; Icon: typeof StickyNote; label: string }> = {
  NOTE: { bg: '#f3e8ff', tint: '#9333ea', Icon: StickyNote, label: 'Note' },
  EMAIL: { bg: '#ffedd5', tint: '#ea580c', Icon: Mail, label: 'Email' },
  INCOMING_EMAIL: { bg: '#dcfce7', tint: '#059669', Icon: Mail, label: 'Email' },
  MEETING: { bg: '#dbeafe', tint: '#2563eb', Icon: Video, label: 'Meeting' },
  CALL: { bg: '#fef3c7', tint: '#d97706', Icon: Phone, label: 'Call' },
  TASK: { bg: '#ffedd5', tint: '#ea580c', Icon: CheckSquare, label: 'Task' },
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
    <div className="space-y-4">
      {/* Sync strip — owner + last sync + HubSpot link */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        {primaryCompany.ownerName ? (
          <div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full">
            <User className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {primaryCompany.ownerName}
            </span>
          </div>
        ) : null}
        {primaryCompany.lastHubSpotSync ? (
          <span className="text-xs text-muted-foreground">
            Synced {fmtRelative(primaryCompany.lastHubSpotSync)}
          </span>
        ) : null}
        {primaryCompany.hubspotUrl ? (
          <a
            href={primaryCompany.hubspotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary"
          >
            HubSpot
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}
      </div>

      {/* Deals + Activity row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Open Deals card */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-emerald-600" />
              </div>
              <span className="text-muted-foreground uppercase text-xs tracking-wide">
                Open deals
              </span>
              <span className="ml-auto text-xs text-muted-foreground font-normal">
                {allDeals.length} total
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{formatMoney(openTotal)}</span>
              <span className="text-xs text-muted-foreground">
                in {openDeals.length} open deals
              </span>
            </div>
            <div className="space-y-1.5">
              {openDeals
                .slice()
                .sort((a: any, b: any) => (b.amount ?? 0) - (a.amount ?? 0))
                .slice(0, 2)
                .map((d: any) => (
                  <div
                    key={d._id}
                    className="flex justify-between items-start p-2 bg-muted/40 rounded-md border border-border"
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="text-xs font-medium truncate">{d.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {d.stageName ?? d.stage ?? '—'}
                      </div>
                    </div>
                    <div className="text-xs font-semibold">{formatMoney(d.amount)}</div>
                  </div>
                ))}
              {openDeals.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No open deals</p>
              ) : null}
            </div>
            <div className="pt-2 border-t border-border flex justify-between text-[11px]">
              <span className="text-muted-foreground">
                Won <span className="text-emerald-600 font-semibold">{formatMoney(wonTotal)}</span>
              </span>
              <span className="text-muted-foreground">
                Lost <span className="text-muted-foreground font-semibold">{formatMoney(lostTotal)}</span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity card */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="w-5 h-5 rounded-md bg-orange-100 flex items-center justify-center">
                <Clock className="w-3 h-3 text-orange-600" />
              </div>
              <span className="text-muted-foreground uppercase text-xs tracking-wide">
                Recent activity
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((a: any) => {
                  const tile = ACTIVITY_TILE[a.activityType] ?? ACTIVITY_TILE.NOTE;
                  const Icon = tile.Icon;
                  return (
                    <div key={a._id} className="flex items-start gap-2.5">
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: tile.bg }}
                      >
                        <Icon className="w-4 h-4" style={{ color: tile.tint }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground/70">{tile.label}</span>
                          {' · '}
                          {fmtDateTime(a.activityDate)}
                        </div>
                        <div className="text-xs truncate">
                          {a.subject || a.bodyPreview || '(no subject)'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No activity yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Beauhurst KPIs mini — only render if we have any data */}
      {hasBeauhurst ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="w-5 h-5 rounded-md bg-blue-100 flex items-center justify-center">
                <Building2 className="w-3 h-3 text-blue-600" />
              </div>
              <span className="text-muted-foreground uppercase text-xs tracking-wide">
                Beauhurst intel
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Turnover</div>
                <div className="text-sm font-semibold">{fmtBeauhurstMoney(beauhurstTurnover)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">EBITDA</div>
                <div className="text-sm font-semibold">{fmtBeauhurstMoney(beauhurstEbitda)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Headcount</div>
                <div className="text-sm font-semibold">{beauhurstHeadcount ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Stage</div>
                <div className="text-sm font-semibold">{beauhurstStage ?? '—'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
