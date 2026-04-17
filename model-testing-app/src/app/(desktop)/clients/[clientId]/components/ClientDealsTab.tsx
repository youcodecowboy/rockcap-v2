/**
 * ClientDealsTab — desktop port of the mobile DealsTab.
 *
 * Layout:
 *   Summary strip (Open / Won / Lost totals + counts)
 *   Search field
 *   Open deals section (expanded by default)
 *   Closed Won / Closed Lost collapsibles (collapsed by default)
 *   Tapping a deal opens DealDetailDialog — a shadcn Dialog equivalent
 *   of the mobile slide-up sheet.
 */

'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import {
  Search, Calendar, Clock, ChevronRight, ChevronDown,
  ExternalLink, User, Pencil, Check, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

interface Props {
  clientId: Id<'clients'>;
}

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null) return '—';
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatLastActivity(iso?: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '—';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days === 0) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Keyword-based stage tone categoriser — mirror of mobile dealStageColors. */
function stageTone(stageName?: string): { bg: string; text: string; border: string } {
  if (!stageName) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  const lower = stageName.toLowerCase();
  if (/closed won|won/.test(lower))
    return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  if (/closed lost|lost/.test(lower))
    return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
  if (/contract|appointment|scheduled/.test(lower))
    return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  if (/proposal|initial|qualification/.test(lower))
    return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  if (/negotiation|discovery|demo/.test(lower))
    return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
  return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
}

function DealRow({
  deal, onClick,
}: {
  deal: any;
  onClick: () => void;
}) {
  const tone = stageTone(deal.stageName);
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border rounded-lg p-3 hover:bg-muted/40 transition-colors flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{deal.name}</p>
          {deal.spvName ? (
            <p className="text-[11px] text-muted-foreground mt-0.5">SPV: {deal.spvName}</p>
          ) : null}
        </div>
        <p className="text-base font-bold whitespace-nowrap">{formatMoney(deal.amount)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`px-2 py-0.5 rounded-full border ${tone.bg} ${tone.text} ${tone.border} font-medium`}>
          {deal.stageName ?? '—'}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Calendar className="w-3 h-3" />
          {deal.closeDate ? formatDate(deal.closeDate) : 'No close date'}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3 h-3" />
          {formatLastActivity(deal.lastActivityDate)}
        </span>
      </div>
    </button>
  );
}

function DealDetailDialog({
  deal, open, onOpenChange,
}: {
  deal: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const linkedContacts = useQuery(
    api.contacts.listByIds,
    deal?.linkedContactIds?.length ? { ids: deal.linkedContactIds } : 'skip',
  );
  const updateLocalEdits = useMutation(api.deals.updateLocalEdits);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editClose, setEditClose] = useState('');
  const [editType, setEditType] = useState('');

  // Reset buffers when the dialog opens a new deal.
  useMemo(() => {
    if (deal) {
      setEditClose(deal.closeDate ? new Date(deal.closeDate).toISOString().slice(0, 10) : '');
      setEditType(deal.dealType ?? '');
      setEditing(false);
    }
  }, [deal?._id]);

  if (!deal) return null;
  const tone = stageTone(deal.stageName);
  const probabilityPct = deal.probability ? Math.round(deal.probability * 100) : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const closeIso = editClose.trim()
        ? new Date(editClose.trim()).toISOString()
        : '';
      await updateLocalEdits({
        dealId: deal._id,
        closeDate: closeIso,
        dealType: editType.trim(),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b flex-row items-start gap-2 space-y-0">
          <div className="flex-1 min-w-0">
            <DialogDescription className="text-[10px] uppercase tracking-wide">
              Deal
            </DialogDescription>
            <DialogTitle className="text-lg mt-0.5">{deal.name}</DialogTitle>
          </div>
          {editing ? (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Check className="w-3.5 h-3.5 mr-1" />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Amount + Stage */}
          <Card>
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Amount</p>
                <p className="text-2xl font-bold mt-0.5">{formatMoney(deal.amount)}</p>
              </div>
              <span
                className={`self-center px-3 py-1 rounded-full border text-xs font-semibold ${tone.bg} ${tone.text} ${tone.border}`}
              >
                {deal.stageName ?? '—'}
              </span>
            </CardContent>
          </Card>

          {/* Details grid */}
          <Card>
            <CardHeader className="py-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-[10px] uppercase text-muted-foreground tracking-wide">
                Details
              </CardTitle>
              {editing ? (
                <p className="text-[10px] italic text-muted-foreground">
                  Saves locally only — won't push to HubSpot
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="pb-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Close date</p>
                {editing ? (
                  <Input
                    value={editClose}
                    onChange={(e) => setEditClose(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="h-7 text-xs mt-1"
                  />
                ) : (
                  <p className="text-sm font-medium mt-0.5">
                    {deal.closeDate ? formatDate(deal.closeDate) : 'No date'}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Probability</p>
                <p className="text-sm font-medium mt-0.5">
                  {probabilityPct !== null ? `${probabilityPct}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Pipeline</p>
                <p className="text-sm font-medium mt-0.5">{deal.pipelineName ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Deal type</p>
                {editing ? (
                  <Input
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    placeholder="e.g. new business"
                    className="h-7 text-xs mt-1"
                  />
                ) : (
                  <p className="text-sm font-medium mt-0.5">{deal.dealType ?? '—'}</p>
                )}
              </div>
              {deal.spvName ? (
                <div className="col-span-2">
                  <p className="text-[10px] text-muted-foreground uppercase">SPV</p>
                  <p className="text-sm font-medium mt-0.5">{deal.spvName}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* HubSpot link */}
          {deal.hubspotUrl ? (
            <a
              href={deal.hubspotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-3 bg-card border rounded-lg hover:bg-muted/40 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium flex-1">Open in HubSpot</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </a>
          ) : null}

          {/* Linked contacts */}
          {linkedContacts && linkedContacts.length > 0 ? (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-[10px] uppercase text-muted-foreground tracking-wide">
                  Linked contacts ({linkedContacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 space-y-2.5">
                {linkedContacts.slice(0, 5).map((c: any) => (
                  <div key={c._id} className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      {c.role ? (
                        <p className="text-[11px] text-muted-foreground truncate">{c.role}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientDealsTab({ clientId }: Props) {
  const deals = useQuery(api.deals.listForClient, { clientId }) ?? [];

  const [search, setSearch] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<any | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const q = search.trim().toLowerCase();
  const filtered = q
    ? deals.filter((d: any) => (d.name ?? '').toLowerCase().includes(q))
    : deals;

  const open = filtered.filter((d: any) => d.isClosed !== true);
  const won = filtered.filter((d: any) => d.isClosedWon === true);
  const lost = filtered.filter(
    (d: any) => d.isClosed === true && d.isClosedWon !== true,
  );

  const sum = (arr: any[]) => arr.reduce((s, d) => s + (d.amount ?? 0), 0);
  const toggleGroup = (label: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Open', total: sum(open), count: open.length, tone: 'text-foreground' },
          { label: 'Won', total: sum(won), count: won.length, tone: 'text-emerald-600' },
          { label: 'Lost', total: sum(lost), count: lost.length, tone: 'text-muted-foreground' },
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <CardContent className="py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                {s.label}
              </p>
              <p className={`text-lg font-bold ${s.tone} mt-0.5`}>
                {formatMoney(s.total)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {s.count} deal{s.count !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search deals..."
          className="pl-9"
        />
      </div>

      {/* Open section */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Open ({open.length})
          </h2>
        </div>
        <div className="space-y-2">
          {open.length === 0 ? (
            <p className="text-xs text-muted-foreground italic p-3">No open deals</p>
          ) : (
            open.map((d: any) => (
              <DealRow key={d._id} deal={d} onClick={() => setSelectedDeal(d)} />
            ))
          )}
        </div>
      </section>

      {/* Won / Lost collapsibles */}
      {[
        { label: 'Closed Won', deals: won, tone: 'text-emerald-600' },
        { label: 'Closed Lost', deals: lost, tone: 'text-muted-foreground' },
      ].map((group) => {
        const isExpanded = expandedGroups.has(group.label);
        return (
          <section key={group.label} className="space-y-2">
            <button
              onClick={() => toggleGroup(group.label)}
              className="w-full flex items-center gap-2 bg-card border rounded-lg px-4 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
              <span className="text-xs font-semibold flex-1 text-left">{group.label}</span>
              <span className={`text-[11px] font-semibold ${group.tone}`}>
                {formatMoney(sum(group.deals))}
              </span>
              <span className="text-[11px] text-muted-foreground">
                · {group.deals.length} deals
              </span>
            </button>
            {isExpanded ? (
              <div className="space-y-2 pl-4">
                {group.deals.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic p-3">
                    No {group.label.toLowerCase()} deals
                  </p>
                ) : (
                  group.deals.map((d: any) => (
                    <DealRow key={d._id} deal={d} onClick={() => setSelectedDeal(d)} />
                  ))
                )}
              </div>
            ) : null}
          </section>
        );
      })}

      <DealDetailDialog
        deal={selectedDeal}
        open={selectedDeal !== null}
        onOpenChange={(open) => !open && setSelectedDeal(null)}
      />
    </div>
  );
}
