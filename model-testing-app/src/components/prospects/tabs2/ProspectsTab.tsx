"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { rungFor, RUNGS, PROSPECT_RUNGS } from "@/lib/prospects/ladder";
import { computeProspectFlags } from "@/lib/prospects/flags";
import { FlagChip } from "../FlagChip";

// "Prospects" tab — the canonical prospect ladder. Every client with
// status==="prospect" + a prospectState, grouped by its operator-facing rung
// (researched → drafted → active → replied → meeting booked). promoted/parked/lost
// collapse into a "Holding" group at the bottom so they don't clutter the live
// pipeline but stay reachable.

const DEAL_TYPE_LABELS: Record<string, string> = {
  new_development: "New development",
  bridging: "Bridging",
  existing_asset: "Existing asset",
  unclassifiable: "Unclassifiable",
};

function dealTypeLabel(dealType: string | undefined | null): string {
  if (!dealType) return "—";
  return DEAL_TYPE_LABELS[dealType] ?? "—";
}

// Holding rungs shown collapsed beneath the active ladder.
const HOLDING_RUNGS = [RUNGS.promoted, RUNGS.parked, RUNGS.lost];

export function ProspectsTab() {
  const colors = useColors();
  const router = useRouter();
  const [holdingOpen, setHoldingOpen] = useState(false);
  // Outreach-ready filter (2026-05-30): surface the "accepted, awaiting draft"
  // pool at a glance. Reads outreachReadyAt off the client rows already in scope.
  const [readyOnly, setReadyOnly] = useState(false);

  const allClients = useQuery(api.clients.list as any, {}) ?? [];
  const allProspects = (allClients as any[]).filter(
    (c) => c.status === "prospect" && c.prospectState,
  );
  const readyCount = allProspects.filter((c) => c.outreachReadyAt).length;
  const prospects = readyOnly
    ? allProspects.filter((c) => c.outreachReadyAt)
    : allProspects;

  // Bucket prospects by rung key. A client maps to exactly one rung via rungFor.
  const byRung = new Map<string, any[]>();
  for (const c of prospects) {
    const rung = rungFor(c.prospectState);
    if (!rung) continue;
    const arr = byRung.get(rung.key) ?? [];
    arr.push(c);
    byRung.set(rung.key, arr);
  }

  const holdingCount = HOLDING_RUNGS.reduce(
    (sum, r) => sum + (byRung.get(r.key)?.length ?? 0),
    0,
  );

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        background: colors.bg.card,
        overflow: "hidden",
      }}
    >
      {/* Filter bar — "Ready for outreach" surfaces the accepted-but-not-drafted
          pool (clients with outreachReadyAt set). */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 14px", borderBottom: `1px solid ${colors.border.default}`,
        background: colors.bg.card,
      }}>
        <button
          onClick={() => setReadyOnly((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 10px", borderRadius: 4, cursor: "pointer",
            fontSize: 10, fontWeight: 500, letterSpacing: "0.04em",
            textTransform: "uppercase" as const,
            border: `1px solid ${readyOnly ? colors.accent.green : colors.border.default}`,
            background: readyOnly ? `${colors.accent.green}14` : colors.bg.card,
            color: readyOnly ? colors.accent.green : colors.text.muted,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.accent.green }} />
          Ready for outreach
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10 }}>{readyCount}</span>
        </button>
        {readyOnly && (
          <span style={{ fontSize: 10, color: colors.text.muted }}>
            Showing accepted prospects awaiting outreach draft
          </span>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)}>Company</th>
            <th style={thStyle(colors)}>Deal type</th>
            <th style={thStyle(colors)}>Est. size</th>
            <th style={thStyle(colors)}>Status</th>
            <th style={thStyle(colors)}>Emails sent</th>
            <th style={thStyle(colors)}>Last reply</th>
            <th style={thStyle(colors)}>Flags</th>
          </tr>
        </thead>
        <tbody>
          {prospects.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...tdStyle(colors), color: colors.text.muted, textAlign: "center" }}>
                {readyOnly ? "No prospects marked ready for outreach yet." : "No prospects in the ladder yet."}
              </td>
            </tr>
          )}

          {/* Active ladder — researched → … → meeting booked */}
          {PROSPECT_RUNGS.map((rung) => {
            const rows = byRung.get(rung.key) ?? [];
            if (rows.length === 0) return null;
            return (
              <RungGroup
                key={rung.key}
                rung={rung}
                rows={rows}
                colors={colors}
                router={router}
              />
            );
          })}

          {/* Holding — promoted / parked / lost, collapsed by default */}
          {holdingCount > 0 && (
            <>
              <tr
                onClick={() => setHoldingOpen((o) => !o)}
                style={{ cursor: "pointer", background: colors.bg.cardAlt }}
              >
                <td colSpan={7} style={subheadStyle(colors)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.text.dim }} />
                    Holding · {holdingCount}
                    <span style={{ color: colors.text.muted, fontWeight: 400 }}>
                      {holdingOpen ? "▾" : "▸"}
                    </span>
                  </span>
                </td>
              </tr>
              {holdingOpen &&
                HOLDING_RUNGS.map((rung) => {
                  const rows = byRung.get(rung.key) ?? [];
                  return rows.map((c: any) => (
                    <ProspectRow
                      key={c._id}
                      client={c}
                      rungLabel={rung.label}
                      colors={colors}
                      router={router}
                    />
                  ));
                })}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RungGroup({ rung, rows, colors, router }: { rung: { key: string; label: string }; rows: any[]; colors: any; router: any }) {
  return (
    <>
      <tr style={{ background: colors.bg.cardAlt }}>
        <td colSpan={7} style={subheadStyle(colors)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: rungDotColor(rung.key, colors) }} />
            {rung.label} · {rows.length}
          </span>
        </td>
      </tr>
      {rows.map((c: any) => (
        <ProspectRow key={c._id} client={c} rungLabel={rung.label} colors={colors} router={router} />
      ))}
    </>
  );
}

function ProspectRow({ client, rungLabel, colors, router }: { client: any; rungLabel: string; colors: any; router: any }) {
  // Pass null for the intel run: clients.list carries no per-row skillRun, so
  // only the contact-presence flag resolves here. The rich gap flags live on
  // the detail Overview (which has the latest intel run in scope).
  const flags = computeProspectFlags(client, null);
  return (
    <tr
      onClick={() => router.push(`/prospects/${client._id}`)}
      style={{ cursor: "pointer" }}
    >
      <td style={tdStyle(colors)}>
        <div style={{ color: colors.text.primary, fontWeight: 500 }}>
          {client.name ?? client.companyName ?? "—"}
        </div>
        <div style={{ fontSize: 10, color: colors.text.dim, marginTop: 2 }}>
          {client.city ?? ""}
          {client.industry ? `${client.city ? " · " : ""}${client.industry}` : ""}
        </div>
      </td>
      <td style={tdStyle(colors)}>{dealTypeLabel(client.dealType)}</td>
      <td style={tdStyle(colors)}>{client.dealSizeRange ?? "—"}</td>
      <td style={tdStyle(colors)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {rungLabel}
          {client.outreachReadyAt && (
            <span
              title={`Accepted for outreach${client.outreachReadyAt ? ` · ${String(client.outreachReadyAt).slice(0, 10)}` : ""}`}
              style={{
                fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                padding: "1px 5px", borderRadius: 2,
                color: colors.accent.green,
                background: `${colors.accent.green}14`,
                border: `1px solid ${colors.accent.green}40`,
              }}
            >
              READY ✓
            </span>
          )}
        </span>
      </td>
      <td style={{ ...tdStyle(colors), color: colors.text.muted }}>—</td>
      <td style={{ ...tdStyle(colors), color: colors.text.muted }}>—</td>
      <td style={tdStyle(colors)}>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
          {flags.map((f, i) => (
            <FlagChip key={`${f.key}-${i}`} label={f.label} severity={f.severity} colors={colors} />
          ))}
        </div>
      </td>
    </tr>
  );
}

function rungDotColor(key: string, colors: any): string {
  switch (key) {
    case "researched": return colors.entityTypes.prospect;
    case "drafted": return colors.status.drafted;
    case "active": return colors.status.active;
    case "replied": return colors.status.replied;
    case "engaged": return colors.status.engaged;
    default: return colors.text.dim;
  }
}

function subheadStyle(colors: any) {
  return {
    padding: "8px 14px",
    borderBottom: `1px solid ${colors.border.default}`,
    fontFamily: "ui-monospace, monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.text.secondary,
    fontWeight: 500,
  };
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
