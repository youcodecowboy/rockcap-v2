"use client";

import { useColors } from "@/lib/useColors";

interface ProspectDetailAsideProps {
  prospect: any;
  intelRun?: any;
  cadences: any[];
  chProfile?: any;
}

// SIC code descriptions — common UK property + finance SIC codes.
// Source: ONS UK SIC 2007. Add as encountered; fallback shows the code alone.
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
  "64209": "Activities of other holding companies (not elsewhere classified)",
};

function sicLabel(code: string): string {
  const desc = SIC_DESCRIPTIONS[code];
  return desc ? `${code} — ${desc}` : code;
}

function yearsBetween(isoDate?: string): string {
  if (!isoDate) return "";
  const incorp = new Date(isoDate);
  const now = new Date();
  const months =
    (now.getFullYear() - incorp.getFullYear()) * 12 + (now.getMonth() - incorp.getMonth());
  if (months < 12) return `${months}mo old`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder === 0 ? `${years}y old` : `${years}y ${remainder}mo old`;
}

// Best-effort extraction of director name + website from the v2 intelMarkdown.
// The template (references/intel-report-template.md) puts the director under
// "## 3. Key People" / "### {Director Name}" — that's the lock-in we rely on.
// Returns undefined if the markdown doesn't match the template (e.g., legacy
// run pre-hardening). Iteration 3 will promote these to structured fields
// on the clients row.
function extractPrimaryDirector(intelMarkdown?: string): string | undefined {
  if (!intelMarkdown) return undefined;
  const sec3 = intelMarkdown.match(/##\s*3\.\s*Key People([\s\S]*?)(?=##\s*\d|$)/i);
  if (!sec3) return undefined;
  const heading = sec3[1].match(/^###\s+(.+?)(?:\s*\(|\s*$)/m);
  return heading?.[1]?.trim();
}

function extractWebsite(intelMarkdown?: string): string | undefined {
  if (!intelMarkdown) return undefined;
  const sec2 = intelMarkdown.match(/##\s*2\.\s*Online Presence([\s\S]*?)(?=##\s*\d|$)/i);
  if (!sec2) return undefined;
  // Match either an <a href="URL"> or a bare URL after "Website:**".
  const hrefMatch = sec2[1].match(/\*\*Website:\*\*[\s\S]*?<a\s+href="([^"]+)"/i);
  if (hrefMatch) return hrefMatch[1];
  const bareMatch = sec2[1].match(/\*\*Website:\*\*\s+(https?:\/\/[^\s<]+)/i);
  if (bareMatch) return bareMatch[1];
  // Detect explicit "Not found" verdict (template uses bold)
  if (/\*\*Website:\*\*\s+\*?\*?Not found/i.test(sec2[1])) return "—";
  return undefined;
}

export function ProspectDetailAside({ prospect, intelRun, cadences, chProfile }: ProspectDetailAsideProps) {
  const colors = useColors();

  // Derived values from CH data
  const chCharges = (chProfile?.charges ?? []) as any[];
  const activeCharges = chCharges.filter((c) => c.chargeStatus === "outstanding");
  const activeLenders = Array.from(
    new Set(activeCharges.map((c) => c.chargeeName).filter(Boolean)),
  );
  const latestChargeDate = chCharges
    .map((c) => c.chargeDate)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  // v1.2.4 — prefer structured fields on the clients row (populated by
  // the skill via clients.setProspectFacts). Fall back to template-locked
  // regex extraction for legacy reports that predate the structured fields.
  const director = prospect?.primaryDirectorName ?? extractPrimaryDirector(intelRun?.intelMarkdown);
  const websiteFromStructured = prospect?.website;
  const website = websiteFromStructured ?? extractWebsite(intelRun?.intelMarkdown);

  // CH or fallback values. The structured field is canonical; the chProfile
  // lookup and intelRun.dedupKey are fallbacks if it's not set.
  const chNumber =
    prospect?.companiesHouseNumber ??
    chProfile?.companyNumber ??
    (intelRun as any)?.dedupKey;
  const legalName = chProfile?.companyName ?? prospect?.companyName ?? prospect?.name;
  const status = chProfile?.companyStatus;
  const incorpDate = chProfile?.incorporationDate;
  const sicCodes = (chProfile?.sicCodes ?? []) as string[];
  const address =
    chProfile?.address ?? `${prospect?.city ?? ""}${prospect?.country ? `, ${prospect.country}` : ""}` ?? null;

  return (
    <div>
      <Section title="Company" colors={colors}>
        <Row label="Legal name" value={legalName} colors={colors} />
        {chNumber && (
          <Row
            label="CH number"
            value={
              <a
                href={`https://find-and-update.company-information.service.gov.uk/company/${chNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: colors.accent.blue, textDecoration: "underline" }}
              >
                {chNumber}
              </a>
            }
            colors={colors}
            mono
          />
        )}
        <Row label="Status" value={status ?? "—"} colors={colors} pill={statusPillColor(status, colors)} />
        <Row
          label="Incorporated"
          value={incorpDate ? `${incorpDate} (${yearsBetween(incorpDate)})` : "—"}
          colors={colors}
          mono
        />
        {sicCodes.length > 0 && (
          <div style={{ padding: "6px 0", borderBottom: `1px solid ${colors.border.light}`, fontSize: 11 }}>
            <div style={{ color: colors.text.muted, marginBottom: 4 }}>SIC code{sicCodes.length > 1 ? "s" : ""}</div>
            {sicCodes.map((c: string) => (
              <div key={c} style={{ color: colors.text.primary, fontSize: 10, lineHeight: 1.4 }}>
                {sicLabel(c)}
              </div>
            ))}
          </div>
        )}
        {director && <Row label="Primary director" value={director} colors={colors} />}
        {website && (
          <Row
            label="Website"
            value={
              website === "—" ? (
                <span style={{ color: colors.text.muted }}>Not found</span>
              ) : (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: colors.accent.blue, textDecoration: "underline", wordBreak: "break-all" }}
                >
                  {website.replace(/^https?:\/\//, "")}
                </a>
              )
            }
            colors={colors}
          />
        )}
      </Section>

      <Section title="Location" colors={colors}>
        <Row label="Registered" value={address ?? "—"} colors={colors} />
        {prospect?.city && <Row label="City" value={prospect.city} colors={colors} />}
        {prospect?.country && <Row label="Country" value={prospect.country} colors={colors} />}
      </Section>

      <Section title="Lender DNA" colors={colors}>
        <Row
          label="Charges"
          value={chCharges.length > 0 ? `${activeCharges.length} active / ${chCharges.length} total` : "—"}
          colors={colors}
          mono
        />
        {activeLenders.length > 0 && (
          <div style={{ padding: "6px 0", borderBottom: `1px solid ${colors.border.light}`, fontSize: 11 }}>
            <div style={{ color: colors.text.muted, marginBottom: 4 }}>Active lenders</div>
            {activeLenders.map((lender) => (
              <div key={lender as string} style={{ color: colors.text.primary, marginTop: 2 }}>
                {lender as string}
              </div>
            ))}
          </div>
        )}
        {latestChargeDate && <Row label="Latest charge" value={latestChargeDate} colors={colors} mono />}
        {!chProfile && (
          <div style={{ padding: "8px 0 4px", fontSize: 10, color: colors.text.muted, fontStyle: "italic" }}>
            CH data not synced. Run companies.syncCompaniesHouse to populate.
          </div>
        )}
      </Section>

      <Section title="Pipeline" colors={colors}>
        <Row label="State" value={prospect?.prospectState ?? "—"} colors={colors} />
        <Row label="Changed" value={prospect?.prospectStateChangedAt?.slice(0, 16) ?? "—"} colors={colors} mono />
        <Row label="Status" value={prospect?.status ?? "—"} colors={colors} />
        <Row label="Type" value={prospect?.type ?? "—"} colors={colors} />
        {prospect?.industry && <Row label="Industry" value={prospect.industry} colors={colors} />}
      </Section>

      <Section title="Cadence" colors={colors}>
        <Row label="Touches" value={cadences?.length ?? 0} colors={colors} mono />
        {intelRun?.gaps?.length > 0 && (
          <Row
            label="Open gaps"
            value={`${intelRun.gaps.length} surfaced`}
            colors={colors}
            valueColor={colors.accent.yellow}
          />
        )}
      </Section>

      {/* Metadata footer — faded; for operator debugging only */}
      <div
        style={{
          marginTop: 28,
          paddingTop: 12,
          borderTop: `1px dashed ${colors.border.default}`,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9,
          color: colors.text.dim,
          lineHeight: 1.6,
        }}
      >
        <div style={{ marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Metadata</div>
        <div>convex: {prospect?._id?.slice(-12) ?? "—"}</div>
        {(prospect as any)?.hubspotCompanyId && <div>hubspot: {(prospect as any).hubspotCompanyId}</div>}
        {intelRun?._id && <div>skillRun: {intelRun._id.slice(-12)}</div>}
        {cadences?.[0]?.packageId && <div>package: {cadences[0].packageId.slice(-16)}</div>}
      </div>
    </div>
  );
}

function statusPillColor(status: string | undefined, colors: any): string | undefined {
  if (!status) return undefined;
  const s = status.toLowerCase();
  if (s === "active") return colors.accent.green;
  if (s.includes("dissol") || s.includes("liquidation")) return colors.accent.red;
  if (s.includes("dormant")) return colors.text.muted;
  return undefined;
}

interface RowProps {
  label: string;
  value: React.ReactNode;
  colors: any;
  mono?: boolean;
  pill?: string;
  valueColor?: string;
}

function Row({ label, value, colors, mono, pill, valueColor }: RowProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        padding: "6px 0",
        fontSize: 11,
        borderBottom: `1px solid ${colors.border.light}`,
        alignItems: "baseline",
      }}
    >
      <span style={{ color: colors.text.muted, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: valueColor ?? colors.text.primary,
          maxWidth: 200,
          textAlign: "right",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          fontSize: mono ? 10 : 11,
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {pill ? (
          <span
            style={{
              display: "inline-block",
              padding: "2px 6px",
              borderRadius: 2,
              background: `${pill}20`,
              color: pill,
              border: `1px solid ${pill}40`,
              fontFamily: "ui-monospace, monospace",
              fontSize: 9,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {value}
          </span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: any;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: colors.text.muted,
          marginBottom: 6,
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
