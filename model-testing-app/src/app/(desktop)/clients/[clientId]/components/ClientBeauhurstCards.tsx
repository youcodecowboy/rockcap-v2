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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

const SIGNAL_CATEGORIES: { key: string; label: string; tint: string }[] = [
  { key: 'beauhurst_data_growth_signals', label: 'Growth', tint: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'beauhurst_data_risk_signals', label: 'Risk', tint: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'beauhurst_data_innovation_signals', label: 'Innovation', tint: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'beauhurst_data_environmental_signals', label: 'Environmental', tint: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { key: 'beauhurst_data_social_governance_signals', label: 'Social & gov', tint: 'bg-purple-50 text-purple-700 border-purple-200' },
];

export default function ClientBeauhurstCards({ clientId }: Props) {
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

  // Signals — flat list of {label, value, tint}
  const signals: { label: string; value: string; tint: string }[] = [];
  for (const cat of SIGNAL_CATEGORIES) {
    const raw = md[cat.key];
    if (!raw) continue;
    for (const v of String(raw).split(';').slice(0, 3)) {
      const t = v.trim();
      if (t) signals.push({ label: cat.label, value: t, tint: cat.tint });
    }
  }
  const hasSignals = signals.length > 0;

  if (!hasIdentity && !hasFinancials && !hasSignals) return null;

  const chUrl = chId
    ? `https://find-and-update.company-information.service.gov.uk/company/${chId}`
    : null;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
          <Building2 className="w-3 h-3 text-blue-600" />
        </div>
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Beauhurst intel
        </h2>
        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
          CRM
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Identity */}
        {hasIdentity ? (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{primaryCompany.name}</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {[legalForm, stage].filter(Boolean).join(' · ') || '—'}
              </p>
            </CardHeader>
            <CardContent className="pb-4 space-y-2 text-xs">
              {chUrl ? (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Companies House</span>
                  <a
                    href={chUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    {chId}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : null}
              {linkedin ? (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">LinkedIn</span>
                  <a
                    href={linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    Profile
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : null}
              {beauhurstUrl ? (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Beauhurst profile</span>
                  <a
                    href={beauhurstUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    Open
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Financials */}
        {hasFinancials ? (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Financials</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Turnover</p>
                  <p className="text-sm font-semibold">{fmtMoney(turnover)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">EBITDA</p>
                  <p className="text-sm font-semibold">{fmtMoney(ebitda)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Headcount</p>
                  <p className="text-sm font-semibold">{headcount ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Funding</p>
                  <p className="text-sm font-semibold">{fmtMoney(funding)}</p>
                </div>
              </div>
              {accountsDate ? (
                <p className="text-[10px] text-muted-foreground mt-3">
                  Accounts filed {fmtDate(accountsDate)}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Signals */}
        {hasSignals ? (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Signals</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex flex-wrap gap-1.5">
                {signals.slice(0, 12).map((s, i) => (
                  <span
                    key={i}
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${s.tint}`}
                  >
                    {s.value}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Divider to separate CRM intel from AI-extracted doc intelligence */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          AI intel from docs
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
    </div>
  );
}
