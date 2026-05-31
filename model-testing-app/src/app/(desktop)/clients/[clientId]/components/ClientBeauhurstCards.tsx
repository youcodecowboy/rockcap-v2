/**
 * ClientBeauhurstCards — desktop port of the mobile Beauhurst Intelligence
 * section (Identity / Financials / Signals). Sits above the existing
 * IntelligenceTab content with a divider so Beauhurst-sourced CRM intel
 * reads as distinct from AI-extracted doc intelligence.
 *
 * Conditional: returns null if this client has no promoted HubSpot company,
 * or if none of the three cards have data to show.
 */

'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { ExternalLink, Building2 } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { Panel, FlagChip, StatusPill, type FlagSeverity } from '@/components/layouts';

interface Props {
  clientId: Id<'clients'>;
}

function fmtMoney(raw: any): string {
  if (!raw) return '—';
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!isFinite(n) || n === 0) return '—';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${Math.round(n)}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

const SIGNAL_CATEGORIES: { key: string; label: string; severity: FlagSeverity }[] = [
  { key: 'beauhurst_data_growth_signals', label: 'Growth', severity: 'ok' },
  { key: 'beauhurst_data_risk_signals', label: 'Risk', severity: 'warn' },
  { key: 'beauhurst_data_innovation_signals', label: 'Innovation', severity: 'info' },
  { key: 'beauhurst_data_environmental_signals', label: 'Environmental', severity: 'ok' },
  { key: 'beauhurst_data_social_governance_signals', label: 'Social & gov', severity: 'info' },
];

export default function ClientBeauhurstCards({ clientId }: Props) {
  const colors = useColors();
  const promotedCompanies = useQuery(api.companies.listByPromotedClient, { clientId });
  const primaryCompany = promotedCompanies?.[0];

  if (!primaryCompany) return null;
  const md = primaryCompany.metadata as Record<string, any> | undefined;
  if (!md) return null;

  // Identity
  const chId = md.beauhurst_data_companies_house_id;
  const linkedin = md.beauhurst_data_linkedin_page;
  const beauhurstUrl = md.beauhurst_data_beauhurst_url;
  const legalForm = md.beauhurst_data_legal_form;
  const stage = md.beauhurst_data_stage_of_evolution;
  const hasIdentity = chId || linkedin || beauhurstUrl || legalForm || stage;

  // Financials
  const turnover = md.beauhurst_data_turnover;
  const ebitda = md.beauhurst_data_ebitda;
  const headcount = md.beauhurst_data_headcount;
  const funding = md.beauhurst_data_total_funding_received;
  const accountsDate = md.beauhurst_data_date_of_accounts;
  const hasFinancials = turnover || ebitda || headcount || funding;

  // Signals — flat list of {label, value, severity}
  const signals: { label: string; value: string; severity: FlagSeverity }[] = [];
  for (const cat of SIGNAL_CATEGORIES) {
    const raw = md[cat.key];
    if (!raw) continue;
    for (const v of String(raw).split(';').slice(0, 3)) {
      const t = v.trim();
      if (t) signals.push({ label: cat.label, value: t, severity: cat.severity });
    }
  }
  const hasSignals = signals.length > 0;

  if (!hasIdentity && !hasFinancials && !hasSignals) return null;

  const chUrl = chId
    ? `https://find-and-update.company-information.service.gov.uk/company/${chId}`
    : null;

  const labelStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.text.muted,
  };

  const linkStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    color: colors.accent.blue,
    textDecoration: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            background: `${colors.accent.blue}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Building2 size={12} color={colors.accent.blue} />
        </div>
        <h2 style={{ ...labelStyle, fontWeight: 600, margin: 0 }}>Beauhurst intel</h2>
        <StatusPill label="CRM" tone={colors.accent.blue} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Identity */}
        {hasIdentity ? (
          <Panel title={primaryCompany.name}>
            <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 0, marginBottom: 12 }}>
              {[legalForm, stage].filter(Boolean).join(' · ') || '—'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              {chUrl ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: colors.text.muted }}>Companies House</span>
                  <a href={chUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    {chId}
                    <ExternalLink size={12} />
                  </a>
                </div>
              ) : null}
              {linkedin ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: colors.text.muted }}>LinkedIn</span>
                  <a href={linkedin} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    Profile
                    <ExternalLink size={12} />
                  </a>
                </div>
              ) : null}
              {beauhurstUrl ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: colors.text.muted }}>Beauhurst profile</span>
                  <a href={beauhurstUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    Open
                    <ExternalLink size={12} />
                  </a>
                </div>
              ) : null}
            </div>
          </Panel>
        ) : null}

        {/* Financials */}
        {hasFinancials ? (
          <Panel title="Financials">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <p style={{ ...labelStyle, margin: 0 }}>Turnover</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: colors.text.primary, margin: '2px 0 0' }}>{fmtMoney(turnover)}</p>
              </div>
              <div>
                <p style={{ ...labelStyle, margin: 0 }}>EBITDA</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: colors.text.primary, margin: '2px 0 0' }}>{fmtMoney(ebitda)}</p>
              </div>
              <div>
                <p style={{ ...labelStyle, margin: 0 }}>Headcount</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: colors.text.primary, margin: '2px 0 0' }}>{headcount ?? '—'}</p>
              </div>
              <div>
                <p style={{ ...labelStyle, margin: 0 }}>Funding</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: colors.text.primary, margin: '2px 0 0' }}>{fmtMoney(funding)}</p>
              </div>
            </div>
            {accountsDate ? (
              <p style={{ fontSize: 10, color: colors.text.muted, marginTop: 12, marginBottom: 0 }}>
                Accounts filed {fmtDate(accountsDate)}
              </p>
            ) : null}
          </Panel>
        ) : null}

        {/* Signals */}
        {hasSignals ? (
          <Panel title="Signals">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {signals.slice(0, 12).map((s, i) => (
                <FlagChip key={i} label={s.value} severity={s.severity} />
              ))}
            </div>
          </Panel>
        ) : null}
      </div>

      {/* Divider to separate CRM intel from AI-extracted doc intelligence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <div style={{ flex: 1, height: 1, background: colors.border.default }} />
        <span style={{ ...labelStyle, fontWeight: 600 }}>AI intel from docs</span>
        <div style={{ flex: 1, height: 1, background: colors.border.default }} />
      </div>
    </div>
  );
}
