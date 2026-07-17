"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import {
  bucketProjectStatus,
  DEAL_SECTORS,
  SECTOR_LABELS,
  type DealBucket,
  type DealSector,
} from "../../../../convex/lib/dealBook";

function fmtCompactGBP(amount: number): string {
  if (!amount || amount <= 0) return "£0";
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(0)}m`;
  if (amount >= 1_000) return `£${(amount / 1_000).toFixed(0)}k`;
  return `£${amount}`;
}

type Tab = DealBucket;

export default function DealBookPage() {
  const colors = useColors();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("open");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const stats = useQuery(api.dealBook.stats, {});
  const projects = (useQuery(api.projects.list as any, {}) as any[]) ?? [];
  const caseStudies = (useQuery(api.caseStudies.list as any, {}) as any[]) ?? [];
  const deriveDrafts = useMutation(api.caseStudies.deriveDrafts);

  const csByProject = useMemo(() => {
    const m = new Map<string, any>();
    for (const cs of caseStudies) m.set(cs.projectId, cs);
    return m;
  }, [caseStudies]);

  const rows = useMemo(
    () => projects.filter((p) => bucketProjectStatus(p.status) === tab),
    [projects, tab],
  );

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: colors.text.primary, marginBottom: 4 }}>
        Deal Book
      </h1>
      <div style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>
        RockCap track record — open business, closed deals, and the case-study index behind hook rung 9.
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: 16,
          borderRadius: 8,
          background: colors.bg.cardAlt,
          border: `1px solid ${colors.border.default}`,
          marginBottom: 20,
        }}
      >
        <Stat label="Open business" value={stats ? `${stats.open.count} · ${fmtCompactGBP(stats.open.value)}` : "—"} accent={colors.entityTypes.deal} colors={colors} />
        <Stat label="Closed (total)" value={stats ? `${stats.closed.count} · ${fmtCompactGBP(stats.closed.value)}` : "—"} accent={colors.accent.green} colors={colors} />
        <Stat label="Closed 30/90/180/365d" value={stats ? `${stats.closedByWindow.d30} / ${stats.closedByWindow.d90} / ${stats.closedByWindow.d180} / ${stats.closedByWindow.d365}` : "—"} accent={colors.text.primary} colors={colors} />
        <Stat label="Lost" value={stats ? String(stats.lost.count) : "—"} accent={colors.status.lost} colors={colors} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${colors.border.default}`, marginBottom: 14, alignItems: "center" }}>
        <TabButton label="Open" active={tab === "open"} onClick={() => setTab("open")} colors={colors} />
        <TabButton label="Closed" active={tab === "closed"} onClick={() => setTab("closed")} colors={colors} />
        <TabButton label="Lost" active={tab === "lost"} onClick={() => setTab("lost")} colors={colors} />
        {tab === "closed" && (
          <button
            onClick={async () => { await deriveDrafts({}); }}
            style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border.mid}`, background: colors.bg.card, color: colors.text.secondary, cursor: "pointer" }}
          >
            Derive drafts from closed deals
          </button>
        )}
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)}>Deal</th>
            <th style={thStyle(colors)}>Sector</th>
            <th style={thStyle(colors)}>Region</th>
            <th style={thStyle(colors)}>Size</th>
            <th style={thStyle(colors)}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const cs = csByProject.get(p._id);
            return (
              <tr key={p._id}>
                <td style={tdStyle(colors)}>
                  <div style={{ color: colors.text.primary, fontWeight: 500 }}>{p.name ?? "—"}</div>
                </td>
                <td style={tdStyle(colors)}>
                  {cs && cs.sector ? (SECTOR_LABELS[cs.sector as DealSector] ?? cs.sector) : "—"}
                </td>
                <td style={tdStyle(colors)}>{cs?.region || p.city || p.state || "—"}</td>
                <td style={tdStyle(colors)}>{cs?.sizeBand || "—"}</td>
                <td style={tdStyle(colors)}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {tab === "closed" && (
                      cs ? (
                        <button onClick={() => setConfirmId(cs._id)} style={btnStyle(colors)}>
                          {cs.curationStatus === "confirmed" ? "Case study" : "Review draft"}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: colors.text.dim }}>no case study</span>
                      )
                    )}
                    <button onClick={() => router.push(`/projects/${p._id}`)} style={btnStyle(colors)}>
                      Project
                    </button>
                    {tab === "closed" && cs && cs.curationStatus !== "confirmed" && (
                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: colors.accent.yellow, color: "#000" }}>Needs review</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td style={tdStyle(colors)} colSpan={5}>
                <span style={{ color: colors.text.dim }}>No {tab} deals.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {(() => {
        const entry = confirmId ? caseStudies.find((c) => c._id === confirmId) : null;
        return entry ? (
          <ConfirmPanel
            key={entry._id}
            entry={entry}
            onClose={() => setConfirmId(null)}
            colors={colors}
          />
        ) : null;
      })()}
    </div>
  );
}

function ConfirmPanel({ entry, onClose, colors }: { entry: any; onClose: () => void; colors: any }) {
  const confirm = useMutation(api.caseStudies.confirm);
  const [sector, setSector] = useState<string>(entry?.sector ?? "");
  const [dealType, setDealType] = useState<string>(entry?.dealType ?? "");
  const [region, setRegion] = useState<string>(entry?.region ?? "");
  const [headline, setHeadline] = useState<string>(entry?.headline ?? "");
  const [referenceable, setReferenceable] = useState<boolean>(entry?.referenceable ?? false);
  if (!entry) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary, marginBottom: 12 }}>Case study — {entry.project?.name ?? "deal"}</h2>
        <Field label="Sector" colors={colors}>
          <select value={sector} onChange={(e) => setSector(e.target.value)} style={inputStyle(colors)}>
            <option value="">— select —</option>
            {DEAL_SECTORS.map((s) => (
              <option key={s} value={s}>{SECTOR_LABELS[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Deal type" colors={colors}>
          <input value={dealType} onChange={(e) => setDealType(e.target.value)} style={inputStyle(colors)} placeholder="e.g. development finance" />
        </Field>
        <Field label="Region" colors={colors}>
          <input value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle(colors)} />
        </Field>
        <Field label="Headline (blank = auto)" colors={colors}>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} style={inputStyle(colors)} placeholder="anonymised — no borrower name" />
        </Field>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: colors.text.secondary, margin: "10px 0" }}>
          <input type="checkbox" checked={referenceable} onChange={(e) => setReferenceable(e.target.checked)} />
          Referenceable in cold hooks
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(colors)}>Cancel</button>
          <button
            disabled={!sector}
            onClick={async () => {
              await confirm({ id: entry._id, sector, dealType, region, headline, referenceable });
              onClose();
            }}
            style={{ ...btnStyle(colors), background: colors.accent.green, color: "#000", opacity: sector ? 1 : 0.5 }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, colors }: { label: string; value: string; accent: string; colors: any }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.text.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: accent }}>{value}</div>
    </div>
  );
}

function Field({ label, children, colors }: { label: string; children: React.ReactNode; colors: any }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: colors.text.muted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function TabButton({ label, active, onClick, colors }: { label: string; active: boolean; onClick: () => void; colors: any }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        fontSize: 12,
        background: "transparent",
        border: "none",
        borderBottom: active ? `2px solid ${colors.entityTypes.deal}` : "2px solid transparent",
        color: active ? colors.text.primary : colors.text.muted,
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function thStyle(colors: any) {
  return {
    textAlign: "left" as const,
    fontFamily: "ui-monospace, monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.text.muted,
    fontWeight: 400,
    padding: "8px 14px",
    borderBottom: `1px solid ${colors.border.default}`,
    background: colors.bg.cardAlt,
  };
}
function tdStyle(colors: any) {
  return {
    padding: "10px 14px",
    borderBottom: `1px solid ${colors.border.light}`,
    fontSize: 11,
    color: colors.text.primary,
    verticalAlign: "middle" as const,
  };
}
function btnStyle(colors: any) {
  return {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${colors.border.mid}`,
    background: colors.bg.card,
    color: colors.text.secondary,
    cursor: "pointer",
  };
}
function inputStyle(colors: any) {
  return {
    width: "100%",
    padding: "6px 8px",
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${colors.border.mid}`,
    background: colors.bg.base,
    color: colors.text.primary,
  };
}
