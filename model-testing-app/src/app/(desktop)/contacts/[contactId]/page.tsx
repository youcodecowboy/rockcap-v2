'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import {
  Panel,
  Button,
  StatusPill,
  EmptyState,
  Row,
  SkeletonCard,
} from '@/components/layouts';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Mail,
  Phone,
  User,
  Briefcase,
  TrendingUp,
} from 'lucide-react';
import { HubSpotLink } from '@/components/HubSpotLink';
import { useColors } from '@/lib/useColors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const colors = useColors();
  const contactId = params.contactId as string;

  const contact = useQuery(api.contacts.get, { id: contactId as any });

  if (contact === undefined) {
    return (
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!contact) {
    return (
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft size={14} />
            Back
          </Button>
        </div>
        <EmptyState icon={<User size={40} />} title="Contact not found" />
      </div>
    );
  }

  // Associated companies and deals are included in the contact query
  const companies = contact.companies || [];
  const deals = contact.deals || [];

  return (
    <div style={{ maxWidth: 1152, margin: '0 auto', padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft size={14} />
            Back
          </Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 500,
                color: colors.text.primary,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {contact.name}
              {contact.hubspotUrl && <HubSpotLink url={contact.hubspotUrl} />}
            </h1>
            {contact.role && (
              <div
                style={{
                  fontSize: 13,
                  color: colors.text.muted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Briefcase size={14} />
                {contact.role}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24 }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Contact Information */}
          <Panel title="Contact Information" accent={colors.entityTypes.contact}>
            <div>
              {contact.email && (
                <Row
                  label="Email"
                  value={
                    <a
                      href={`mailto:${contact.email}`}
                      style={{ color: colors.entityTypes.contact, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Mail size={14} />
                      {contact.email}
                    </a>
                  }
                />
              )}
              {contact.phone && (
                <Row
                  label="Phone"
                  value={
                    <a
                      href={`tel:${contact.phone}`}
                      style={{ color: colors.entityTypes.contact, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Phone size={14} />
                      {contact.phone}
                    </a>
                  }
                />
              )}
              {contact.company && (
                <Row
                  label="Company"
                  value={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Building2 size={14} />
                      {contact.company}
                    </span>
                  }
                />
              )}
              {contact.hubspotLifecycleStageName && (
                <Row
                  label="Lifecycle Stage"
                  value={<StatusPill label={contact.hubspotLifecycleStageName} tone={colors.accent.orange} />}
                />
              )}
              {contact.lastContactedDate && (
                <Row
                  label="Last Contacted"
                  value={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={14} />
                      {new Date(contact.lastContactedDate).toLocaleString()}
                    </span>
                  }
                />
              )}
              {contact.lastActivityDate && (
                <Row
                  label="Last Activity"
                  value={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={14} />
                      {new Date(contact.lastActivityDate).toLocaleString()}
                    </span>
                  }
                />
              )}
            </div>
          </Panel>

          {/* Associated Companies */}
          {companies.length > 0 && (
            <Panel title="Associated Companies" accent={colors.entityTypes.contact}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {companies.map((company: any) => (
                  <Link
                    key={company._id}
                    href={`/companies/${company._id}`}
                    style={{
                      display: 'block',
                      padding: 12,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: 4,
                      background: colors.bg.cardAlt,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: colors.text.primary,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Building2 size={14} />
                      {company.name}
                      {company.hubspotUrl && <HubSpotLink url={company.hubspotUrl} />}
                    </div>
                    {company.website && (
                      <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>
                        {company.website}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          {/* Associated Deals */}
          {deals.length > 0 && (
            <Panel title="Associated Deals" accent={colors.entityTypes.contact}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deals.map((deal: any) => (
                  <Link
                    key={deal._id}
                    href={`/deals/${deal._id}`}
                    style={{
                      display: 'block',
                      padding: 12,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: 4,
                      background: colors.bg.cardAlt,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: colors.text.primary,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <TrendingUp size={14} />
                      {deal.name}
                      {deal.hubspotUrl && <HubSpotLink url={deal.hubspotUrl} />}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: colors.text.muted,
                        marginTop: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                      }}
                    >
                      {deal.stageName && <span>{deal.stageName}</span>}
                      {deal.amount && (
                        <span style={{ fontFamily: MONO }}>
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          }).format(deal.amount)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* HubSpot Information */}
          {contact.hubspotContactId && (
            <Panel title="HubSpot Information" accent={colors.accent.orange}>
              <div>
                <Row label="Contact ID" value={contact.hubspotContactId} mono />
                {contact.lastHubSpotSync && (
                  <Row label="Last Synced" value={new Date(contact.lastHubSpotSync).toLocaleString()} />
                )}
              </div>
            </Panel>
          )}

          {/* Notes */}
          {contact.notes && (
            <Panel title="Notes" accent={colors.entityTypes.contact}>
              <p style={{ fontSize: 12, color: colors.text.primary, whiteSpace: 'pre-wrap' }}>
                {contact.notes}
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
