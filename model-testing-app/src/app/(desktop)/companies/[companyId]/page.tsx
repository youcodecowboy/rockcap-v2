'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import {
  Building2,
  Calendar,
  ExternalLink,
  Mail,
  Phone,
  User,
  TrendingUp,
  Globe,
  MapPin,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { HubSpotLink } from '@/components/HubSpotLink';
import { useState } from 'react';
import { useColors } from '@/lib/useColors';
import {
  EntityDetailScaffold,
  Panel,
  Row,
  StatusPill,
  EmptyState,
  Button,
  SkeletonText,
  type TabDef,
} from '@/components/layouts';

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const [isPromoting, setIsPromoting] = useState(false);
  const colors = useColors();

  const company = useQuery(api.companies.get, { id: companyId as any });
  const promoteToClient = useMutation(api.companies.promoteToClient);

  if (company === undefined) {
    return (
      <div style={{ padding: 24 }}>
        <SkeletonText lines={2} />
      </div>
    );
  }

  if (!company) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon={<Building2 size={28} />}
          title="Company not found"
          action={
            <button
              onClick={() => router.back()}
              style={{ color: colors.accent.blue, textDecoration: 'underline', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Back
            </button>
          }
        />
      </div>
    );
  }

  const contacts = company.contacts || [];
  const deals = company.deals || [];
  // Company → lender(teal) accent: closest entity type for a generic company.
  const accent = colors.entityTypes.lender;

  const handlePromoteToClient = async () => {
    if (isPromoting || company.promotedToClientId) return;

    setIsPromoting(true);
    try {
      const clientId = await promoteToClient({ id: companyId as any });
      // Redirect to client dashboard
      router.push(`/clients/${clientId}`);
    } catch (error) {
      console.error('Error promoting company to client:', error);
      alert('Failed to promote company to client. Please try again.');
      setIsPromoting(false);
    }
  };

  const tabs: TabDef[] = [{ id: 'overview', label: 'Overview' }];

  const statusSlot = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {company.hubspotUrl && <HubSpotLink url={company.hubspotUrl} />}
      {company.hubspotLifecycleStageName && (
        <StatusPill label={company.hubspotLifecycleStageName} tone={accent} />
      )}
    </div>
  );

  const actions = company.promotedToClientId ? (
    <Link href={`/clients/${company.promotedToClientId}`}>
      <Button size="sm" variant="primary" accent={colors.entityTypes.client}>
        <CheckCircle2 size={14} /> View Client Dashboard
      </Button>
    </Link>
  ) : (
    <Button
      size="sm"
      variant="primary"
      accent={colors.entityTypes.deal}
      onClick={handlePromoteToClient}
      disabled={isPromoting}
    >
      <Sparkles size={14} /> {isPromoting ? 'Promoting…' : 'Promote to Client'}
    </Button>
  );

  const aside = (
    <>
      {company.promotedToClientId && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Client status</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.entityTypes.client, fontSize: 12, fontWeight: 500, marginBottom: 10 }}>
            <CheckCircle2 size={16} /> Promoted to client
          </div>
          <Link href={`/clients/${company.promotedToClientId}`}>
            <Button size="sm" variant="secondary" style={{ width: '100%', justifyContent: 'center' }}>
              View Client Dashboard
            </Button>
          </Link>
        </div>
      )}

      {company.hubspotCompanyId && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>HubSpot</SectionLabel>
          <Row label="Company ID" value={company.hubspotCompanyId} mono />
          {company.lastHubSpotSync && (
            <Row label="Last synced" value={new Date(company.lastHubSpotSync).toLocaleString()} mono />
          )}
        </div>
      )}
    </>
  );

  return (
    <EntityDetailScaffold
      entityType="lender"
      breadcrumbs={[
        { label: 'Companies', type: 'lender', onClick: () => router.back() },
        { label: company.name, type: 'lender' },
      ]}
      icon={<Building2 className="w-[18px] h-[18px]" />}
      title={company.name}
      subtitle={company.industry || undefined}
      status={statusSlot}
      actions={actions}
      tabs={tabs}
      activeTab="overview"
      onTabChange={() => {}}
      aside={aside}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Panel title="Company information" accent={accent}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
            {company.website && (
              <DetailField
                label="Website"
                icon={<Globe size={14} />}
                colors={colors}
                value={
                  <a
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: colors.accent.blue, textDecoration: 'none' }}
                  >
                    {company.website}
                  </a>
                }
              />
            )}
            {company.phone && (
              <DetailField
                label="Phone"
                icon={<Phone size={14} />}
                colors={colors}
                value={
                  <a href={`tel:${company.phone}`} style={{ color: colors.accent.blue, textDecoration: 'none' }}>
                    {company.phone}
                  </a>
                }
              />
            )}
            {company.domain && <DetailField label="Domain" value={company.domain} colors={colors} />}
            {company.industry && <DetailField label="Industry" value={company.industry} colors={colors} />}
            {company.hubspotLifecycleStageName && (
              <DetailField
                label="Lifecycle stage"
                colors={colors}
                value={<StatusPill label={company.hubspotLifecycleStageName} tone={accent} />}
              />
            )}
            {(company.city || company.state) && (
              <DetailField
                label="Location"
                icon={<MapPin size={14} />}
                colors={colors}
                value={[company.city, company.state, company.zip].filter(Boolean).join(', ')}
              />
            )}
            {company.address && <DetailField label="Address" value={company.address} colors={colors} full />}
            {company.lastContactedDate && (
              <DetailField
                label="Last contacted"
                icon={<Calendar size={14} />}
                colors={colors}
                value={new Date(company.lastContactedDate).toLocaleString()}
              />
            )}
            {company.lastActivityDate && (
              <DetailField
                label="Last activity"
                icon={<Calendar size={14} />}
                colors={colors}
                value={new Date(company.lastActivityDate).toLocaleString()}
              />
            )}
          </div>
        </Panel>

        {contacts.length > 0 && (
          <Panel title="Associated contacts" accent={colors.entityTypes.contact}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contacts.map((contact: any) => (
                <Link
                  key={contact._id}
                  href={`/contacts/${contact._id}`}
                  style={{
                    display: 'block',
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 4,
                    padding: 12,
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                    <User size={14} style={{ color: colors.text.muted }} />
                    {contact.name}
                    {contact.hubspotUrl && <HubSpotLink url={contact.hubspotUrl} />}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: colors.text.muted }}>
                    {contact.email && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={12} /> {contact.email}
                      </span>
                    )}
                    {contact.role && <span>{contact.role}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        )}

        {deals.length > 0 && (
          <Panel title="Associated deals" accent={colors.entityTypes.deal}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deals.map((deal: any) => (
                <Link
                  key={deal._id}
                  href={`/deals/${deal._id}`}
                  style={{
                    display: 'block',
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 4,
                    padding: 12,
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                    <TrendingUp size={14} style={{ color: colors.text.muted }} />
                    {deal.name}
                    {deal.hubspotUrl && <HubSpotLink url={deal.hubspotUrl} />}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: colors.text.muted }}>
                    {deal.stageName && <span>{deal.stageName}</span>}
                    {deal.amount && (
                      <span>
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deal.amount)}
                      </span>
                    )}
                  </div>
                </Link>
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
