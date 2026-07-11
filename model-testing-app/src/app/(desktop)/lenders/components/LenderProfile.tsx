'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  Panel,
  KpiRow,
  TabStrip,
  type TabDef,
  type Kpi,
  DataTable,
  type Column,
  StatusPill,
  EmptyState,
  Button,
  SkeletonCard,
  clientStatusTone,
  projectStatusTone,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import MiniKnowledgeGraph from '@/components/knowledge/MiniKnowledgeGraph';
import LenderDocumentsTab from './LenderDocumentsTab';
import {
  FacilityStatusSelect,
  AppetitePanelContent,
  PeoplePanelContent,
  type LenderContact,
} from './LenderEditors';
import {
  Network,
  ArrowUpRight,
  Landmark,
  Briefcase,
  Building,
  Globe,
} from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ── Formatting ──────────────────────────────────────────────────────────

/** Compact GBP: £850k / £6.5m / £1.2bn. */
function fmtGBP(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}bn`;
  if (abs >= 1_000_000) return `£${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}m`;
  if (abs >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${Math.round(n)}`;
}

/** "dealSize.min" → "min" under a "deal size" group heading. */
function fieldPathLeaf(fieldPath: string): string {
  const leaf = fieldPath.split('.').slice(1).join('.') || fieldPath;
  return leaf.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase();
}

function fieldPathGroup(fieldPath: string): string {
  const head = fieldPath.split('.')[0];
  return head.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase();
}

interface AppetiteEntry {
  value: unknown;
  valueType: string;
  sourceType: string;
  asOfDate?: string;
  confidence?: number;
}

/** Render an appetite value by its declared valueType. */
function fmtAppetiteValue(entry: AppetiteEntry): string {
  const { value, valueType } = entry;
  if (value == null) return '—';
  if (Array.isArray(value)) return value.map((v) => String(v).replace(/_/g, ' ')).join(', ');
  if (valueType === 'currency' && typeof value === 'number') return fmtGBP(value);
  if (valueType === 'percentage' && typeof value === 'number') {
    // Signals arrive both as fractions (0.65) and whole percents (65).
    return value <= 1 ? `${Math.round(value * 100)}%` : `${value}%`;
  }
  if (valueType === 'boolean') return value ? 'yes' : 'no';
  return String(value).replace(/_/g, ' ');
}

// ── Component ───────────────────────────────────────────────────────────

interface LenderProfileProps {
  lenderId: Id<'clients'>;
  onOpenGraph: () => void;
}

const PROFILE_TABS: TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
];

export default function LenderProfile({ lenderId, onOpenGraph }: LenderProfileProps) {
  const colors = useColors();
  const lenderTone = colors.entityTypes.lender;
  const [activeTab, setActiveTab] = useState('overview');

  const deep = useQuery(api.appetiteSignals.lenderGetDeepContext, {
    lenderClientId: lenderId,
  });
  const book = useQuery(api.knowledge.facilities.listByLender, {
    lenderClientId: lenderId,
  });
  const groupCharges = useQuery(api.companies.getGroupCharges, { clientId: lenderId });

  const appetiteGroups = useMemo(() => {
    const map = (deep && 'currentAppetite' in deep ? deep.currentAppetite : {}) as Record<
      string,
      AppetiteEntry
    >;
    const groups = new Map<string, Array<{ fieldPath: string; entry: AppetiteEntry }>>();
    for (const fieldPath of Object.keys(map).sort()) {
      const group = fieldPathGroup(fieldPath);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push({ fieldPath, entry: map[fieldPath] });
    }
    return Array.from(groups.entries());
  }, [deep]);

  if (deep === undefined || book === undefined) {
    return (
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (deep === null || 'error' in deep) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <EmptyState
          icon={<Landmark className="w-10 h-10" />}
          title="Not a lender"
          body={deep && 'message' in deep ? String(deep.message) : 'This record could not be loaded.'}
        />
      </div>
    );
  }

  const lender = deep.lender as {
    _id: string;
    name: string;
    companyName?: string;
    status?: string;
    website?: string;
    companiesHouseNumber?: string;
    primaryDirectorName?: string;
    notes?: string;
  };
  const { summary, contacts, linkedProjects } = deep;
  const { stats, facilities } = book;

  type FacilityRow = (typeof facilities)[number];
  const facilityColumns: Column<FacilityRow>[] = [
    {
      key: 'project',
      header: 'Project',
      render: (f) =>
        f.projectClientId ? (
          <Link
            href={`/clients/${f.projectClientId}/projects/${f.projectId}`}
            style={{ color: colors.text.primary, textDecoration: 'none' }}
            className="hover:underline"
          >
            {f.projectName}
          </Link>
        ) : (
          f.projectName
        ),
    },
    {
      key: 'borrower',
      header: 'Borrower',
      render: (f) => f.borrowerName ?? '—',
    },
    {
      key: 'tranche',
      header: 'Tranche',
      width: 90,
      render: (f) => f.tranche ?? 'single',
      mono: true,
    },
    {
      key: 'amount',
      header: 'Amount',
      width: 90,
      align: 'right',
      mono: true,
      render: (f) => fmtGBP(f.amountGBP),
    },
    {
      key: 'rate',
      header: 'Rate',
      width: 70,
      align: 'right',
      mono: true,
      render: (f) => (f.interestRate != null ? `${f.interestRate}%` : '—'),
    },
    {
      key: 'maturity',
      header: 'Maturity',
      width: 100,
      mono: true,
      render: (f) => f.maturityDate ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      width: 100,
      render: (f) => <FacilityStatusSelect facilityId={f._id} status={f.status ?? undefined} />,
    },
  ];

  const kpis: Kpi[] = [
    {
      label: 'Avg deal size',
      value: fmtGBP(stats.avgDealSizeGBP),
      meta:
        stats.avgDealSizeSampleSize > 0
          ? `${stats.avgDealSizeBasis === 'executed' ? 'executed book' : 'incl. indicative'} · n=${stats.avgDealSizeSampleSize}`
          : 'no priced facilities yet',
      accent: lenderTone,
    },
    {
      label: 'Executed book',
      value: fmtGBP(stats.totalExecutedGBP || null),
      meta: `${stats.live} live`,
    },
    {
      label: 'Facilities',
      value: stats.total,
      meta: `${stats.live} live · ${stats.indicative} indicative`,
    },
    {
      label: 'Projects',
      value: summary.linkedProjectsCount,
      meta: `${stats.distinctProjects} with observed terms`,
    },
    {
      label: 'Appetite fields',
      value: summary.currentAppetiteFieldCount,
      meta: `${summary.recentChangesIn90d} updates in 90d`,
    },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-4" style={{ maxWidth: 1280 }}>
        {/* Profile header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 40,
                height: 40,
                borderRadius: 4,
                background: `${lenderTone}15`,
                border: `1px solid ${lenderTone}40`,
              }}
            >
              <Landmark className="w-5 h-5" style={{ color: lenderTone }} />
            </div>
            <div className="min-w-0">
              <h2
                className="truncate"
                style={{ fontSize: 20, fontWeight: 500, color: colors.text.primary }}
              >
                {lender.name}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusPill label="Lender" tone={lenderTone} />
                {lender.status && (
                  <StatusPill
                    label={lender.status}
                    tone={clientStatusTone(lender.status, colors)}
                  />
                )}
                {lender.companyName && lender.companyName !== lender.name && (
                  <span style={{ fontSize: 12, color: colors.text.muted }}>
                    {lender.companyName}
                  </span>
                )}
                {lender.website && (
                  <a
                    href={lender.website.startsWith('http') ? lender.website : `https://${lender.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:underline"
                    style={{ fontSize: 12, color: colors.accent.blue }}
                  >
                    <Globe className="w-3 h-3" />
                    {lender.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="primary" size="sm" accent={lenderTone} onClick={onOpenGraph}>
              <Network className="w-4 h-4" />
              Knowledge graph
            </Button>
            <Link href={`/clients/${lender._id}`}>
              <Button variant="secondary" size="sm">
                <ArrowUpRight className="w-4 h-4" />
                Client record
              </Button>
            </Link>
          </div>
        </div>

        {/* KPIs — observed behaviour + stated appetite at a glance */}
        <KpiRow items={kpis} />

        {/* Overview / Documents */}
        <div style={{ margin: '0 -8px' }}>
          <TabStrip tabs={PROFILE_TABS} activeTab={activeTab} onChange={setActiveTab} entityType="lender" />
        </div>

        {activeTab === 'documents' && <LenderDocumentsTab lenderId={lenderId} />}

        {/* Panels */}
        {activeTab === 'overview' && (
        <div className="grid grid-cols-3 gap-4 items-start">
          {/* Left 2/3: the book + appetite */}
          <div className="col-span-2 space-y-4">
            <Panel title="Facility book — observed behaviour" accent={lenderTone} padded={false}>
              <div style={{ padding: facilities.length === 0 ? 16 : 0 }}>
                <DataTable
                  columns={facilityColumns}
                  rows={facilities}
                  getRowKey={(f) => f._id}
                  empty={
                    <EmptyState
                      icon={<Landmark className="w-8 h-8" />}
                      title="No facilities observed yet"
                      body="Facilities are minted automatically as financing documents are ingested and atomized."
                    />
                  }
                />
              </div>
            </Panel>

            <Panel title="Stated appetite" accent={lenderTone}>
              <AppetitePanelContent
                lenderId={lenderId}
                groups={appetiteGroups}
                formatValue={fmtAppetiteValue}
                formatLeaf={fieldPathLeaf}
              />
            </Panel>
          </div>

          {/* Right 1/3: connections */}
          <div className="space-y-4">
            <Panel title="Knowledge graph" accent={lenderTone} padded={false}>
              <MiniKnowledgeGraph
                entityType="client"
                entityId={lenderId}
                height={260}
                onExpand={onOpenGraph}
              />
            </Panel>

            <Panel title={`Projects · ${linkedProjects.length}`}>
              {linkedProjects.length === 0 ? (
                <div style={{ fontSize: 11, color: colors.text.muted }}>
                  Not yet on any project roster.
                </div>
              ) : (
                <div className="space-y-1">
                  {(linkedProjects as Array<{ _id: string; name: string; status?: string; clientId?: string }>).map(
                    (p) => (
                      <Link
                        key={p._id}
                        href={p.clientId ? `/clients/${p.clientId}/projects/${p._id}` : '#'}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md"
                        style={{ textDecoration: 'none', transition: 'background 100ms linear' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Briefcase className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.entityTypes.project }} />
                          <span className="truncate" style={{ fontSize: 12, color: colors.text.primary }}>
                            {p.name}
                          </span>
                        </span>
                        {p.status && (
                          <StatusPill label={p.status} tone={projectStatusTone(p.status, colors)} />
                        )}
                      </Link>
                    ),
                  )}
                </div>
              )}
            </Panel>

            <Panel title={`People · ${contacts.length}`}>
              <PeoplePanelContent
                lenderId={lenderId}
                lenderName={lender.name}
                contacts={contacts as LenderContact[]}
              />
            </Panel>

            <Panel title="Companies House">
              {!lender.companiesHouseNumber && (groupCharges?.companyCount ?? 0) === 0 ? (
                <div style={{ fontSize: 11, color: colors.text.muted }}>
                  No Companies House record linked yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {lender.companiesHouseNumber && (
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 11, color: colors.text.secondary }}>Company no.</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: colors.text.primary }}>
                        {lender.companiesHouseNumber}
                      </span>
                    </div>
                  )}
                  {lender.primaryDirectorName && (
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 11, color: colors.text.secondary }}>Director</span>
                      <span style={{ fontSize: 11, color: colors.text.primary }}>
                        {lender.primaryDirectorName}
                      </span>
                    </div>
                  )}
                  {(groupCharges?.companyCount ?? 0) > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 11, color: colors.text.secondary }}>Group companies</span>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: colors.text.primary }}>
                          {groupCharges!.companyCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 11, color: colors.text.secondary }}>Charges</span>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: colors.text.primary }}>
                          {groupCharges!.activeCharges} active / {groupCharges!.totalCharges}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-1.5 pt-1" style={{ borderTop: `1px solid ${colors.border.default}` }}>
                    <Building className="w-3 h-3" style={{ color: colors.text.dim }} />
                    <span style={{ fontSize: 10, color: colors.text.muted }}>
                      Their charges register (who they lend against) is on the Sourcing tab.
                    </span>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
