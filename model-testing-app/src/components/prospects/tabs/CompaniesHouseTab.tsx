"use client";

import { useColors } from "@/lib/useColors";
import { ExternalLink } from "lucide-react";
import { ChargeChronologyTable } from "./ChargeChronologyTable";

interface CompaniesHouseTabProps {
  prospect: any;
  intelRun?: any;
  chProfile?: any;
  // Aggregate charge rollup across the corporate group (parent + sibling SPVs)
  // from companies.getGroupCharges. The group section renders only when
  // groupCharges.companyCount > 1 (i.e. related companies exist).
  groupCharges?: any;
}

// Reads structured Companies House data (companiesHouseCompanies + charges)
// fetched via the companies.syncCompaniesHouse MCP tool. Separates the
// quantitative CH data from the narrative intel report so operators have
// a quick-reference view of the charge book and profile fundamentals.

const SIC_DESCRIPTIONS: Record<string, string> = {
  "41100": "Development of building projects",
  "41201": "Construction of commercial buildings",
  "41202": "Construction of domestic buildings",
  "42990": "Construction of other civil engineering projects",
  "68100": "Buying and selling of own real estate",
  "68201": "Renting and operating of Housing Association real estate",
  "68209": "Other letting and operating of own or leased real estate",
  "68310": "Real estate agencies",
  "68320": "Management of real estate on a fee or contract basis",
  "70100": "Activities of head offices",
  "70229": "Management consultancy activities (other)",
  "64209": "Activities of other holding companies",
};

function sicLabel(code: string): string {
  return SIC_DESCRIPTIONS[code] ? `${code} — ${SIC_DESCRIPTIONS[code]}` : code;
}

export function CompaniesHouseTab({ prospect, intelRun, chProfile, groupCharges }: CompaniesHouseTabProps) {
  const colors = useColors();
  const chNumber = chProfile?.companyNumber ?? (intelRun as any)?.dedupKey;

  if (!chProfile) {
    return (
      <div
        style={{
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          padding: 24,
          color: colors.text.muted,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        Companies House data not synced for this prospect.
        {chNumber && (
          <>
            <br />
            <br />
            Run from a Claude Code session:
            <code
              style={{
                display: "block",
                marginTop: 8,
                padding: 10,
                background: colors.bg.cardAlt,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 3,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                color: colors.text.primary,
              }}
            >
              companies.syncCompaniesHouse({JSON.stringify({ chNumber })})
            </code>
            Or directly: <br />
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: colors.text.primary }}>
              npx convex run companiesHouse:syncOneCompanyFromCHInternal '{`{"companyNumber":"${chNumber}"}`}'
            </code>
          </>
        )}
      </div>
    );
  }

  const charges = (chProfile.charges ?? []) as any[];
  const sortedCharges = [...charges].sort((a, b) =>
    (b.chargeDate ?? "").localeCompare(a.chargeDate ?? ""),
  );
  const activeCount = charges.filter((c) => c.chargeStatus === "outstanding").length;
  const satisfiedCount = charges.filter((c) =>
    (c.chargeStatus ?? "").toLowerCase().startsWith("fully-satisfied"),
  ).length;

  // Group charges by lender (chargeeName) for the lender frequency summary
  const lenderCounts: Record<string, { total: number; active: number }> = {};
  for (const c of charges) {
    const name = c.chargeeName?.trim() || "(unnamed)";
    if (!lenderCounts[name]) lenderCounts[name] = { total: 0, active: 0 };
    lenderCounts[name].total++;
    if (c.chargeStatus === "outstanding") lenderCounts[name].active++;
  }
  const lenderRanking = Object.entries(lenderCounts).sort(
    (a, b) => b[1].total - a[1].total || b[1].active - a[1].active,
  );

  return (
    <div>
      {/* Profile card */}
      <div
        style={{
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          background: colors.bg.card,
          padding: 16,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted, marginBottom: 4 }}>
              Companies House profile
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: colors.text.primary }}>
              {chProfile.companyName}
            </div>
          </div>
          <a
            href={`https://find-and-update.company-information.service.gov.uk/company/${chProfile.companyNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              background: colors.bg.cardAlt,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 3,
              color: colors.accent.blue,
              fontSize: 10,
              textDecoration: "none",
            }}
          >
            View on CH <ExternalLink size={11} />
          </a>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "6px 14px",
            fontSize: 12,
          }}
        >
          <ProfileRow label="CH number" value={chProfile.companyNumber} mono colors={colors} />
          <ProfileRow label="Status" value={chProfile.companyStatus ?? "—"} colors={colors} />
          <ProfileRow label="Incorporated" value={chProfile.incorporationDate ?? "—"} mono colors={colors} />
          <ProfileRow label="Registered address" value={chProfile.address ?? "—"} colors={colors} />
          {(chProfile.sicCodes ?? []).length > 0 && (
            <>
              <div style={{ color: colors.text.muted, fontSize: 11 }}>SIC code(s)</div>
              <div>
                {(chProfile.sicCodes as string[]).map((c) => (
                  <div key={c} style={{ color: colors.text.primary, fontSize: 11, marginBottom: 2 }}>{sicLabel(c)}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charges summary metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <Metric label="Total charges" value={charges.length} colors={colors} accent={colors.entityTypes.cadence} />
        <Metric label="Active" value={activeCount} colors={colors} accent={colors.accent.yellow} />
        <Metric label="Satisfied" value={satisfiedCount} colors={colors} accent={colors.accent.green} />
        <Metric label="Distinct lenders" value={Object.keys(lenderCounts).length} colors={colors} accent={colors.accent.cyan} />
      </div>

      {/* Lender ranking */}
      {lenderRanking.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionLabel colors={colors}>Lenders by charge count</SectionLabel>
          <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, overflow: "hidden" }}>
            {lenderRanking.map(([name, counts], i) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 14px",
                  borderTop: i === 0 ? "none" : `1px solid ${colors.border.light}`,
                  fontSize: 12,
                }}
              >
                <span style={{ color: colors.text.primary, fontWeight: counts.total > 1 ? 500 : 400 }}>{name}</span>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: colors.text.muted }}>
                  {counts.total} total · {counts.active} active
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charges table */}
      <div>
        <SectionLabel colors={colors}>Charge chronology ({charges.length})</SectionLabel>
        <ChargeChronologyTable charges={sortedCharges} />
      </div>

      {/* Corporate-group charge rollup — aggregated across the parent + sibling
          SPVs (clients.relatedCompaniesHouseNumbers). Only shown when there are
          related companies in the group (companyCount > 1). */}
      {groupCharges && groupCharges.companyCount > 1 && (
        <div style={{ marginTop: 28, paddingTop: 22, borderTop: `1px solid ${colors.border.default}` }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted, marginBottom: 4 }}>
              Corporate group
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: colors.text.primary }}>
              Group charges (across {groupCharges.companyCount} companies)
            </div>
            <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 4, lineHeight: 1.5 }}>
              Aggregated across the trading parent and the sibling SPVs discovered via shared director appointments. A single company&apos;s charge book understates a developer&apos;s borrowing when schemes are spread across SPVs.
            </div>
          </div>

          {/* Group totals — mirrors the single-company metric cards above */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
            <Metric label="Total charges" value={groupCharges.totalCharges} colors={colors} accent={colors.entityTypes.cadence} />
            <Metric label="Active" value={groupCharges.activeCharges} colors={colors} accent={colors.accent.yellow} />
            <Metric label="Satisfied" value={groupCharges.satisfiedCharges} colors={colors} accent={colors.accent.green} />
            <Metric label="Distinct lenders" value={groupCharges.distinctLenders} colors={colors} accent={colors.accent.cyan} />
          </div>

          {/* Group-wide lender ranking */}
          {(groupCharges.lendersByCount ?? []).length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <SectionLabel colors={colors}>Lenders by charge count (group-wide)</SectionLabel>
              <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, overflow: "hidden" }}>
                {(groupCharges.lendersByCount as any[]).map((l, i) => (
                  <div
                    key={l.name}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 14px",
                      borderTop: i === 0 ? "none" : `1px solid ${colors.border.light}`,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: colors.text.primary, fontWeight: l.total > 1 ? 500 : 400 }}>{l.name}</span>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: colors.text.muted }}>
                      {l.total} total · {l.active} active
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-company breakdown */}
          {(groupCharges.byCompany ?? []).length > 0 && (
            <div>
              <SectionLabel colors={colors}>Companies in group ({groupCharges.byCompany.length})</SectionLabel>
              <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, overflow: "hidden" }}>
                {(groupCharges.byCompany as any[]).map((co, i) => {
                  const isParent = co.companyNumber === chProfile.companyNumber;
                  return (
                    <div
                      key={co.companyNumber}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 14px",
                        borderTop: i === 0 ? "none" : `1px solid ${colors.border.light}`,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <a
                          href={`https://find-and-update.company-information.service.gov.uk/company/${co.companyNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: colors.text.primary, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {co.companyName}
                        </a>
                        {isParent && (
                          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 8, letterSpacing: "0.05em", textTransform: "uppercase", color: colors.text.muted, border: `1px solid ${colors.border.default}`, borderRadius: 2, padding: "1px 4px", flexShrink: 0 }}>
                            anchor
                          </span>
                        )}
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, flexShrink: 0 }}>{co.companyNumber}</span>
                      </div>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: colors.text.muted, flexShrink: 0, marginLeft: 12 }}>
                        {co.chargesCount} {co.chargesCount === 1 ? "charge" : "charges"} · {co.activeCount} active
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group charges chronology — every charge across the group, newest-first */}
          {(groupCharges.charges ?? []).length > 0 && (
            <div style={{ marginTop: 18 }}>
              <SectionLabel colors={colors}>Group charges chronology ({groupCharges.charges.length})</SectionLabel>
              <ChargeChronologyTable
                charges={(groupCharges.charges as any[]).map((c) => ({
                  chargeId: c.chargeId,
                  chargeDate: c.date,
                  chargeeName: `${c.lender} · ${c.companyName}`,
                  chargeStatus: c.status,
                  chargeDescription: c.description,
                }))}
              />
            </div>
          )}

          {/* Per-SPV charge chronology — each funded group company, collapsible */}
          {(() => {
            const byCo = new Map<string, any[]>();
            for (const c of (groupCharges.charges ?? []) as any[]) {
              if (!byCo.has(c.companyNumber)) byCo.set(c.companyNumber, []);
              byCo.get(c.companyNumber)!.push(c);
            }
            const cos = [...byCo.entries()].sort((a, b) =>
              (b[1][0]?.date ?? "").localeCompare(a[1][0]?.date ?? ""),
            );
            return cos.length > 0 ? (
              <div style={{ marginTop: 18 }}>
                <SectionLabel colors={colors}>Charge chronology by company ({cos.length})</SectionLabel>
                {cos.map(([num, cs]) => (
                  <details key={num} style={{ marginBottom: 8 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, color: colors.text.primary, padding: "6px 0" }}>
                      {cs[0].companyName} ·{" "}
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted }}>
                        {num}
                      </span>{" "}
                      · {cs.length} charge{cs.length === 1 ? "" : "s"}
                    </summary>
                    <ChargeChronologyTable
                      charges={cs.map((c) => ({
                        chargeId: c.chargeId,
                        chargeDate: c.date,
                        chargeeName: c.lender,
                        chargeStatus: c.status,
                        chargeDescription: c.description,
                      }))}
                    />
                  </details>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

function ProfileRow({ label, value, mono, colors }: { label: string; value: string; mono?: boolean; colors: any }) {
  return (
    <>
      <div style={{ color: colors.text.muted, fontSize: 11 }}>{label}</div>
      <div
        style={{
          color: colors.text.primary,
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          fontSize: mono ? 11 : 12,
        }}
      >
        {value}
      </div>
    </>
  );
}

function Metric({ label, value, colors, accent }: { label: string; value: number; colors: any; accent: string }) {
  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderTop: `2px solid ${accent}`, borderRadius: 4, padding: "12px 14px" }}>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children, colors }: { children: React.ReactNode; colors: any }) {
  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: colors.text.muted,
        marginBottom: 8,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}
