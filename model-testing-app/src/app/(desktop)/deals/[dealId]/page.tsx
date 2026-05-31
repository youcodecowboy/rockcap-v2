'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import {
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  TrendingUp,
  User,
  Mail,
  Phone,
} from 'lucide-react';
import { HubSpotLink } from '@/components/HubSpotLink';
import { useColors } from '@/lib/useColors';
import {
  EntityDetailScaffold,
  Panel,
  Row,
  StatusPill,
  EmptyState,
  SkeletonText,
  type Kpi,
  type TabDef,
} from '@/components/layouts';

const STATUS_TONE_KEYS: Record<string, keyof ReturnType<typeof useColors>['accent']> = {
  new: 'blue',
  contacted: 'yellow',
  qualified: 'green',
  negotiation: 'purple',
  'closed-won': 'green',
  'closed-lost': 'red',
};

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.dealId as string;
  const colors = useColors();

  const deal = useQuery(api.deals.getDealById, { dealId: dealId as any });

  if (deal === undefined) {
    return (
      <div style={{ padding: 24 }}>
        <SkeletonText lines={2} />
      </div>
    );
  }

  if (!deal) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon={<TrendingUp size={28} />}
          title="Deal not found"
          action={
            <Link href="/prospects" style={{ color: colors.accent.blue, textDecoration: 'underline', fontSize: 12 }}>
              Back to Prospects
            </Link>
          }
        />
      </div>
    );
  }

  const contacts = deal.contacts || [];
  const companies = deal.companies || [];

  const statusTone = (status?: string) =>
    colors.accent[STATUS_TONE_KEYS[status || 'new'] || 'blue'];

  const fmtCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const kpis: Kpi[] = [
    ...(deal.amount !== undefined && deal.amount !== null
      ? [{ label: 'Deal amount', value: fmtCurrency(deal.amount), accent: colors.entityTypes.deal } as Kpi]
      : []),
    ...(deal.closeDate
      ? [{ label: 'Close date', value: new Date(deal.closeDate).toLocaleDateString(), accent: colors.accent.indigo } as Kpi]
      : []),
    ...(deal.dealType ? [{ label: 'Deal type', value: deal.dealType, accent: colors.accent.purple } as Kpi] : []),
    ...(deal.stageName || deal.stage
      ? [{ label: 'Stage', value: deal.stageName || deal.stage, accent: colors.accent.cyan } as Kpi]
      : []),
    ...(deal.createdAt
      ? [{ label: 'Created', value: new Date(deal.createdAt).toLocaleDateString(), accent: colors.entityTypes.skillRun } as Kpi]
      : []),
  ];

  const tabs: TabDef[] = [{ id: 'overview', label: 'Overview' }];

  const statusSlot = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {deal.hubspotUrl && <HubSpotLink url={deal.hubspotUrl} />}
      {deal.status && <StatusPill label={deal.status.replace('-', ' ')} tone={statusTone(deal.status)} />}
    </div>
  );

  const aside = (
    <>
      {(deal.pipeline || deal.pipelineName || deal.stage || deal.stageName || deal.status) && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Deal status</SectionLabel>
          {deal.status && <Row label="Status" value={deal.status.replace('-', ' ')} pill={statusTone(deal.status)} />}
          {(deal.pipelineName || deal.pipeline) && (
            <Row label="Pipeline" value={deal.pipelineName || deal.pipeline} />
          )}
          {(deal.stageName || deal.stage) && <Row label="Stage" value={deal.stageName || deal.stage} />}
        </div>
      )}

      {deal.hubspotDealId && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>HubSpot</SectionLabel>
          <Row label="Deal ID" value={deal.hubspotDealId} mono />
          {deal.lastHubSpotSync && (
            <Row label="Last synced" value={new Date(deal.lastHubSpotSync).toLocaleString()} mono />
          )}
        </div>
      )}
    </>
  );

  return (
    <EntityDetailScaffold
      entityType="deal"
      breadcrumbs={[
        { label: 'Prospects', type: 'deal', onClick: () => router.push('/prospects') },
        { label: deal.name, type: 'deal' },
      ]}
      icon={<TrendingUp className="w-[18px] h-[18px]" />}
      title={deal.name}
      subtitle={deal.pipelineName || undefined}
      status={statusSlot}
      kpis={kpis.length ? kpis : undefined}
      tabs={tabs}
      activeTab="overview"
      onTabChange={() => {}}
      aside={aside}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Panel title="Deal information" accent={colors.entityTypes.deal}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
            {deal.amount !== undefined && deal.amount !== null && (
              <DetailField label="Deal amount" icon={<DollarSign size={14} />} value={fmtCurrency(deal.amount)} colors={colors} />
            )}
            {deal.closeDate && (
              <DetailField label="Close date" icon={<Calendar size={14} />} value={new Date(deal.closeDate).toLocaleDateString()} colors={colors} />
            )}
            {deal.dealType && <DetailField label="Deal type" value={deal.dealType} colors={colors} />}
            {deal.createdAt && (
              <DetailField label="Created" value={new Date(deal.createdAt).toLocaleDateString()} colors={colors} />
            )}
            {deal.nextStep && <DetailField label="Next step" value={deal.nextStep} colors={colors} full />}
            {deal.lastContactedDate && (
              <DetailField label="Last contacted" value={new Date(deal.lastContactedDate).toLocaleString()} colors={colors} />
            )}
            {deal.lastActivityDate && (
              <DetailField label="Last activity" value={new Date(deal.lastActivityDate).toLocaleString()} colors={colors} />
            )}
          </div>
        </Panel>

        {contacts.length > 0 && (
          <Panel title="Associated contacts" accent={colors.entityTypes.contact}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contacts.map((contact: any) => (
                <div
                  key={contact._id}
                  style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 12 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                    <User size={14} style={{ color: colors.text.muted }} />
                    <Link href={`/contacts/${contact._id}`} style={{ color: colors.accent.blue, textDecoration: 'none' }}>
                      {contact.name}
                    </Link>
                    {contact.hubspotUrl && <HubSpotLink url={contact.hubspotUrl} />}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: colors.text.muted }}>
                    {contact.email && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={12} /> {contact.email}
                      </span>
                    )}
                    {contact.phone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={12} /> {contact.phone}
                      </span>
                    )}
                    {contact.company && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Building2 size={12} /> {contact.company}
                      </span>
                    )}
                    {contact.role && <span>{contact.role}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {companies.length > 0 && (
          <Panel title="Associated companies" accent={colors.entityTypes.lender}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {companies.map((company: any) => (
                <div
                  key={company._id}
                  style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 12 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                    <Building2 size={14} style={{ color: colors.text.muted }} />
                    <Link href={`/companies/${company._id}`} style={{ color: colors.accent.blue, textDecoration: 'none' }}>
                      {company.name}
                    </Link>
                    {company.hubspotUrl && <HubSpotLink url={company.hubspotUrl} />}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: colors.text.muted }}>
                    {company.website && (
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, color: colors.accent.blue, textDecoration: 'none' }}
                      >
                        <ExternalLink size={12} /> {company.website}
                      </a>
                    )}
                    {company.phone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={12} /> {company.phone}
                      </span>
                    )}
                    {company.industry && <span>{company.industry}</span>}
                    {company.city && company.state && (
                      <span>{company.city}, {company.state}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </EntityDetailScaffold>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <div
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: colors.text.muted,
        marginBottom: 6,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function DetailField({
  label,
  value,
  icon,
  colors,
  full,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  colors: ReturnType<typeof useColors>;
  full?: boolean;
}) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.text.muted,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.text.primary }}>
        {icon && <span style={{ color: colors.text.muted }}>{icon}</span>}
        {value}
      </div>
    </div>
  );
}
