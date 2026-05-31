/**
 * ClientDealsTab — desktop port of the mobile DealsTab.
 *
 * Layout:
 *   Summary strip (Open / Won / Lost totals + counts)
 *   Search field
 *   Open deals section (expanded by default)
 *   Closed Won / Closed Lost collapsibles (collapsed by default)
 *   Tapping a deal opens DealDetailModal — a canon Modal equivalent
 *   of the mobile slide-up sheet.
 */

'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import {
  Search, Calendar, Clock, ChevronRight, ChevronDown,
  ExternalLink, User, Pencil, Check, X, Briefcase,
} from 'lucide-react';
import {
  Panel, StatTile, DataTable, EmptyState, StatusPill,
  Button, Field, Input, Row, Modal,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';

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
function stageTone(stageName: string | undefined, colors: ReturnType<typeof useColors>): string {
  if (!stageName) return colors.accent.blue;
  const lower = stageName.toLowerCase();
  if (/closed won|won/.test(lower)) return colors.accent.green;
  if (/closed lost|lost/.test(lower)) return colors.text.muted;
  if (/contract|appointment|scheduled/.test(lower)) return colors.accent.yellow;
  if (/proposal|initial|qualification/.test(lower)) return colors.accent.blue;
  if (/negotiation|discovery|demo/.test(lower)) return colors.accent.purple;
  return colors.accent.blue;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function DealDetailModal({
  deal, open, onOpenChange,
}: {
  deal: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const colors = useColors();
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
  const tone = stageTone(deal.stageName, colors);
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
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Deal"
      width={640}
      footer={
        editing ? (
          <>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              <X size={14} /> Cancel
            </Button>
            <Button variant="primary" accent={colors.entityTypes.client} onClick={handleSave} disabled={saving}>
              <Check size={14} /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Edit
          </Button>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: colors.text.primary }}>{deal.name}</div>

        {/* Amount + Stage */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
                Amount
              </div>
              <div style={{ fontSize: 28, fontWeight: 300, color: colors.text.primary, marginTop: 4, fontFamily: MONO }}>
                {formatMoney(deal.amount)}
              </div>
            </div>
            <div style={{ alignSelf: 'center' }}>
              <StatusPill label={deal.stageName ?? '—'} tone={tone} />
            </div>
          </div>
        </Panel>

        {/* Details grid */}
        <Panel
          title="Details"
          actions={
            editing ? (
              <span style={{ fontSize: 10, fontStyle: 'italic', color: colors.text.muted }}>
                Saves locally only — won't push to HubSpot
              </span>
            ) : undefined
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 12 }}>
            <div>
              {editing ? (
                <Field label="Close date">
                  <Input
                    value={editClose}
                    onChange={(e) => setEditClose(e.target.value)}
                    placeholder="YYYY-MM-DD"
                  />
                </Field>
              ) : (
                <Row label="Close date" value={deal.closeDate ? formatDate(deal.closeDate) : 'No date'} mono />
              )}
            </div>
            <div>
              <Row label="Probability" value={probabilityPct !== null ? `${probabilityPct}%` : '—'} mono />
            </div>
            <div>
              <Row label="Pipeline" value={deal.pipelineName ?? '—'} />
            </div>
            <div>
              {editing ? (
                <Field label="Deal type">
                  <Input
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    placeholder="e.g. new business"
                  />
                </Field>
              ) : (
                <Row label="Deal type" value={deal.dealType ?? '—'} />
              )}
            </div>
            {deal.spvName ? (
              <div style={{ gridColumn: 'span 2' }}>
                <Row label="SPV" value={deal.spvName} />
              </div>
            ) : null}
          </div>
        </Panel>

        {/* HubSpot link */}
        {deal.hubspotUrl ? (
          <a
            href={deal.hubspotUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              background: colors.bg.card,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                width: 32, height: 32, borderRadius: 4,
                background: colors.bg.cardAlt,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ExternalLink size={16} style={{ color: colors.text.muted }} />
            </div>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: colors.text.primary }}>Open in HubSpot</span>
            <ChevronRight size={16} style={{ color: colors.text.muted }} />
          </a>
        ) : null}

        {/* Linked contacts */}
        {linkedContacts && linkedContacts.length > 0 ? (
          <Panel title={`Linked contacts (${linkedContacts.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {linkedContacts.slice(0, 5).map((c: any) => (
                <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: 4,
                      background: colors.bg.cardAlt,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <User size={16} style={{ color: colors.text.muted }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </div>
                    {c.role ? (
                      <div style={{ fontSize: 11, color: colors.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.role}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    </Modal>
  );
}

function DealTable({
  deals, onRowClick, emptyLabel,
}: {
  deals: any[];
  onRowClick: (deal: any) => void;
  emptyLabel: string;
}) {
  const colors = useColors();
  return (
    <DataTable
      rows={deals}
      getRowKey={(d) => d._id}
      onRowClick={onRowClick}
      empty={<EmptyState icon={<Briefcase size={20} />} title={emptyLabel} />}
      columns={[
        {
          key: 'name',
          header: 'Deal',
          render: (d: any) => (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.name}
              </div>
              {d.spvName ? (
                <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>SPV: {d.spvName}</div>
              ) : null}
            </div>
          ),
        },
        {
          key: 'stage',
          header: 'Stage',
          width: 160,
          render: (d: any) => <StatusPill label={d.stageName ?? '—'} tone={stageTone(d.stageName, colors)} />,
        },
        {
          key: 'amount',
          header: 'Amount',
          mono: true,
          align: 'right',
          width: 110,
          render: (d: any) => formatMoney(d.amount),
        },
        {
          key: 'close',
          header: 'Close date',
          mono: true,
          align: 'right',
          width: 130,
          render: (d: any) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.text.secondary }}>
              <Calendar size={11} style={{ color: colors.text.muted }} />
              {d.closeDate ? formatDate(d.closeDate) : '—'}
            </span>
          ),
        },
        {
          key: 'activity',
          header: 'Last activity',
          mono: true,
          align: 'right',
          width: 110,
          render: (d: any) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.text.muted }}>
              <Clock size={11} />
              {formatLastActivity(d.lastActivityDate)}
            </span>
          ),
        },
      ]}
    />
  );
}

export default function ClientDealsTab({ clientId }: Props) {
  const colors = useColors();
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
        <StatTile
          label="Open"
          value={<span style={{ fontFamily: MONO }}>{formatMoney(sum(open))}</span>}
          meta={`${open.length} deal${open.length !== 1 ? 's' : ''}`}
          accent={colors.accent.blue}
        />
        <StatTile
          label="Won"
          value={<span style={{ fontFamily: MONO }}>{formatMoney(sum(won))}</span>}
          meta={`${won.length} deal${won.length !== 1 ? 's' : ''}`}
          accent={colors.accent.green}
        />
        <StatTile
          label="Lost"
          value={<span style={{ fontFamily: MONO }}>{formatMoney(sum(lost))}</span>}
          meta={`${lost.length} deal${lost.length !== 1 ? 's' : ''}`}
          accent={colors.accent.red}
        />
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={16} style={{ color: colors.text.muted, flexShrink: 0 }} />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search deals..."
        />
      </div>

      {/* Open section */}
      <section className="space-y-2">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
          <ChevronDown size={14} style={{ color: colors.text.muted }} />
          <h2 style={{ fontFamily: MONO, fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
            Open ({open.length})
          </h2>
        </div>
        <DealTable deals={open} onRowClick={setSelectedDeal} emptyLabel="No open deals" />
      </section>

      {/* Won / Lost collapsibles */}
      {[
        { label: 'Closed Won', deals: won, tone: colors.accent.green },
        { label: 'Closed Lost', deals: lost, tone: colors.text.muted },
      ].map((group) => {
        const isExpanded = expandedGroups.has(group.label);
        return (
          <section key={group.label} className="space-y-2">
            <button
              onClick={() => toggleGroup(group.label)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: colors.bg.card,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
                padding: '10px 14px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <ChevronRight
                size={14}
                style={{ color: colors.text.muted, transition: 'transform 100ms linear', transform: isExpanded ? 'rotate(90deg)' : 'none' }}
              />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{group.label}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: group.tone, fontFamily: MONO }}>
                {formatMoney(sum(group.deals))}
              </span>
              <span style={{ fontSize: 11, color: colors.text.muted }}>
                · {group.deals.length} deals
              </span>
            </button>
            {isExpanded ? (
              <div style={{ paddingLeft: 16 }}>
                <DealTable
                  deals={group.deals}
                  onRowClick={setSelectedDeal}
                  emptyLabel={`No ${group.label.toLowerCase()} deals`}
                />
              </div>
            ) : null}
          </section>
        );
      })}

      <DealDetailModal
        deal={selectedDeal}
        open={selectedDeal !== null}
        onOpenChange={(open) => !open && setSelectedDeal(null)}
      />
    </div>
  );
}
