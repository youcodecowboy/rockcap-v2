"use client";

import { useState } from "react";
import { useColors } from "@/lib/useColors";
import { ExternalLink, Check } from "lucide-react";

export type TrackRecordScheme = {
  companyNumber: string;
  companyName: string;
  companyStatus?: string;
  lenders: string[];
  lastChargeDate?: string;
  status: "live" | "past";
  address?: string;
  addressIsEstimate?: boolean;
  planningRefs?: string[];
  estimatedUnits?: number;
  schemeType?: string;
  whatBuilding?: string;
  gdvEstimate?: string;
  confidence?: string;
  sourceUrls?: string[];
  operatorConfirmed?: boolean;
};

const TOP_N = 7;

export function TrackRecordTab({
  schemes,
  onConfirmScheme,
}: {
  schemes?: { live: TrackRecordScheme[]; past: TrackRecordScheme[] };
  onConfirmScheme: (companyNumber: string, companyName: string) => void;
}) {
  const colors = useColors();

  if (schemes === undefined) {
    return <div style={{ color: colors.text.muted, fontSize: 12 }}>Loading schemes…</div>;
  }
  const liveCount = schemes.live.length;
  const pastCount = schemes.past.length;
  if (liveCount === 0 && pastCount === 0) {
    return (
      <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, padding: 24, color: colors.text.muted, fontSize: 12, lineHeight: 1.6 }}>
        No charge-bearing schemes found for this prospect&apos;s corporate group. Schemes appear here once the group&apos;s SPVs carry Companies House charges (sync the group via the prospect-intel skill).
      </div>
    );
  }

  return (
    <div>
      <SchemeSection title={`Live schemes (${liveCount})`} schemes={schemes.live} colors={colors} onConfirmScheme={onConfirmScheme} />
      {pastCount > 0 && (
        <div style={{ marginTop: 28 }}>
          <SchemeSection title={`Past schemes (${pastCount})`} schemes={schemes.past} colors={colors} onConfirmScheme={onConfirmScheme} />
        </div>
      )}
    </div>
  );
}

function SchemeSection({
  title,
  schemes,
  colors,
  onConfirmScheme,
}: {
  title: string;
  schemes: TrackRecordScheme[];
  colors: any;
  onConfirmScheme: (companyNumber: string, companyName: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (schemes.length === 0) return null;
  const shown = showAll ? schemes : schemes.slice(0, TOP_N);
  return (
    <div>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted, marginBottom: 10, fontWeight: 500 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {shown.map((s) => (
          <SchemeCard key={s.companyNumber} scheme={s} colors={colors} onConfirmScheme={onConfirmScheme} />
        ))}
      </div>
      {schemes.length > TOP_N && (
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{ marginTop: 10, background: "none", border: "none", color: colors.accent.blue, fontSize: 11, cursor: "pointer", padding: 0 }}
        >
          {showAll ? "Show fewer" : `Show all ${schemes.length}`}
        </button>
      )}
    </div>
  );
}

function SchemeCard({
  scheme: s,
  colors,
  onConfirmScheme,
}: {
  scheme: TrackRecordScheme;
  colors: any;
  onConfirmScheme: (companyNumber: string, companyName: string) => void;
}) {
  const confidenceColor =
    s.confidence === "high" ? colors.accent.green : s.confidence === "med" ? colors.accent.yellow : colors.text.muted;
  return (
    <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <a
            href={`https://find-and-update.company-information.service.gov.uk/company/${s.companyNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: colors.text.primary, fontSize: 14, fontWeight: 500, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            {s.companyName} <ExternalLink size={11} />
          </a>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
            {s.companyNumber}{s.lastChargeDate ? ` · charge ${s.lastChargeDate}` : ""}
          </div>
        </div>
        {s.operatorConfirmed ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, letterSpacing: "0.05em", textTransform: "uppercase", color: colors.accent.green, border: `1px solid ${colors.accent.green}`, borderRadius: 2, padding: "2px 6px", flexShrink: 0 }}>
            <Check size={10} /> Confirmed
          </span>
        ) : (
          <button
            onClick={() => onConfirmScheme(s.companyNumber, s.companyName)}
            style={{ fontSize: 10, color: colors.accent.blue, background: colors.bg.cardAlt, border: `1px solid ${colors.border.default}`, borderRadius: 3, padding: "4px 8px", cursor: "pointer", flexShrink: 0 }}
          >
            Confirm
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "4px 12px", fontSize: 12 }}>
        <Label colors={colors}>Lender(s)</Label>
        <div style={{ color: colors.text.primary }}>{s.lenders.length ? s.lenders.join(", ") : "—"}</div>
        <Label colors={colors}>Address</Label>
        <div style={{ color: colors.text.primary }}>
          {s.address ?? "—"}
          {s.address && s.addressIsEstimate && (
            <span style={{ marginLeft: 6, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", color: colors.text.muted, border: `1px solid ${colors.border.default}`, borderRadius: 2, padding: "1px 4px" }}>
              est. from charge
            </span>
          )}
        </div>
        <Label colors={colors}>Building</Label>
        <div style={{ color: s.whatBuilding ? colors.text.primary : colors.text.muted, lineHeight: 1.5 }}>
          {s.whatBuilding ?? "Not yet researched"}
          {(s.estimatedUnits || s.schemeType || s.gdvEstimate) && (
            <div style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }}>
              {[s.schemeType, s.estimatedUnits ? `${s.estimatedUnits} units` : null, s.gdvEstimate ? `GDV ${s.gdvEstimate}` : null].filter(Boolean).join(" · ")}
            </div>
          )}
          {s.confidence && (
            <span style={{ marginLeft: 0, marginTop: 4, display: "inline-block", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", color: confidenceColor }}>
              {s.confidence} confidence
            </span>
          )}
        </div>
        {(s.planningRefs?.length || s.sourceUrls?.length) ? (
          <>
            <Label colors={colors}>Sources</Label>
            <div style={{ fontSize: 11, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(s.planningRefs ?? []).map((r) => (
                <span key={r} style={{ color: colors.text.secondary, fontFamily: "ui-monospace, monospace" }}>{r}</span>
              ))}
              {(s.sourceUrls ?? []).map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" style={{ color: colors.accent.blue, textDecoration: "none" }}>source {i + 1}</a>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Label({ children, colors }: { children: React.ReactNode; colors: any }) {
  return <div style={{ color: colors.text.muted, fontSize: 11 }}>{children}</div>;
}
