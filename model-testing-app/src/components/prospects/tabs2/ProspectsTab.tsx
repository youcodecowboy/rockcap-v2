"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import {
  derivePipelineStage,
  PIPELINE_STAGES,
  type PipelineStage,
  type StageDef,
} from "@/lib/prospects/stages";
import { computeProspectFlags } from "@/lib/prospects/flags";
import { FlagChip } from "../FlagChip";

// "Prospects" tab — the canonical prospect pipeline. Every client with
// status==="prospect" + a prospectState, grouped by its effective pipelineStage
// (Cold → Pre-meeting → Post-meeting → Pre-qual → Qualified) — the single v3
// stage vocabulary. Off-pipeline holding (parked / lost / promoted, which derive
// to no stage) collapses into a "Holding" group at the bottom so they don't
// clutter the live pipeline but stay reachable.

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

export function ProspectsTab({ pipelineStage }: { pipelineStage?: PipelineStage } = {}) {
  const colors = useColors();
  const router = useRouter();
  const [holdingOpen, setHoldingOpen] = useState(false);
  // Outreach-ready filter (2026-05-30): surface the "accepted, awaiting draft"
  // pool at a glance. Reads outreachReadyAt off the client rows already in scope.
  const [readyOnly, setReadyOnly] = useState(false);
  // Stage filter: null = all groups; a pipelineStage key (or "holding") narrows
  // the table to that group so the operator never scrolls past dozens of rows
  // to reach the one they want.
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const allClients = useQuery(api.clients.list as any, {}) ?? [];
  // Batched per-prospect rollup: real sends (outbound gmail touchpoints) +
  // latest inbound reply. Powers the Emails sent / Last reply columns.
  const outreachStats =
    (useQuery(api.prospects.outreachStats as any, {}) as Record<
      string,
      { emailsSent: number; lastSentAt?: string; lastReplyAt?: string }
    > | undefined) ?? {};
  const allProspects = (allClients as any[]).filter(
    (c) =>
      c.status === "prospect" &&
      c.prospectState &&
      // When rendered inside a stage dashboard, narrow to that pipeline stage.
      (!pipelineStage || derivePipelineStage(c) === pipelineStage),
  );
  const readyCount = allProspects.filter((c) => c.outreachReadyAt).length;
  const prospects = readyOnly
    ? allProspects.filter((c) => c.outreachReadyAt)
    : allProspects;

  // Bucket prospects by effective pipelineStage. A client maps to exactly one
  // stage via derivePipelineStage; rows that derive to no stage (off-pipeline
  // holding — parked / lost / promoted) collect in `holding`.
  const byStage = new Map<string, any[]>();
  const holding: any[] = [];
  for (const c of prospects) {
    const stage = derivePipelineStage(c);
    if (!stage) {
      holding.push(c);
      continue;
    }
    const arr = byStage.get(stage) ?? [];
    arr.push(c);
    byStage.set(stage, arr);
  }

  const holdingCount = holding.length;

  // Which groups render under the current stage filter. "holding" narrows to
  // the holding block (forced open); a stage key narrows to that stage; null
  // shows everything.
  const visibleStages =
    stageFilter === null
      ? PIPELINE_STAGES
      : PIPELINE_STAGES.filter((s) => s.key === stageFilter);
  const showHolding = (stageFilter === null || stageFilter === "holding") && holdingCount > 0;
  const holdingExpanded = holdingOpen || stageFilter === "holding";
  const visibleRowCount =
    visibleStages.reduce((sum, s) => sum + (byStage.get(s.key)?.length ?? 0), 0) +
    (showHolding ? holdingCount : 0);

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
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const,
        padding: "8px 14px", borderBottom: `1px solid ${colors.border.default}`,
        background: colors.bg.card,
      }}>
        {/* Stage filter buttons — jump straight to a pipeline stage instead of
            scrolling the whole list. Counts respect the ready-only toggle. */}
        <StageFilterButton
          label="All"
          count={prospects.length}
          active={stageFilter === null}
          dot={null}
          onClick={() => setStageFilter(null)}
          colors={colors}
        />
        {PIPELINE_STAGES.map((stage) => (
          <StageFilterButton
            key={stage.key}
            label={stage.shortLabel}
            count={byStage.get(stage.key)?.length ?? 0}
            active={stageFilter === stage.key}
            dot={colors.accent[stage.accentKey]}
            onClick={() => setStageFilter((f) => (f === stage.key ? null : stage.key))}
            colors={colors}
          />
        ))}
        <StageFilterButton
          label="Holding"
          count={holdingCount}
          active={stageFilter === "holding"}
          dot={colors.text.dim}
          onClick={() => setStageFilter((f) => (f === "holding" ? null : "holding"))}
          colors={colors}
        />
        <span style={{ width: 1, alignSelf: "stretch", background: colors.border.default, margin: "0 4px" }} />
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
          {visibleRowCount === 0 && (
            <tr>
              <td colSpan={7} style={{ ...tdStyle(colors), color: colors.text.muted, textAlign: "center" }}>
                {readyOnly
                  ? "No prospects marked ready for outreach yet."
                  : stageFilter
                    ? "No prospects in this group."
                    : "No prospects in the pipeline yet."}
              </td>
            </tr>
          )}

          {/* Active pipeline — Cold → … → Qualified */}
          {visibleStages.map((stage) => {
            const rows = byStage.get(stage.key) ?? [];
            if (rows.length === 0) return null;
            return (
              <StageGroup
                key={stage.key}
                stage={stage}
                rows={rows}
                stats={outreachStats}
                colors={colors}
                router={router}
              />
            );
          })}

          {/* Holding — off-pipeline (parked / lost / promoted), collapsed by
              default (forced open when the Holding filter is selected) */}
          {showHolding && (
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
                      {holdingExpanded ? "▾" : "▸"}
                    </span>
                  </span>
                </td>
              </tr>
              {holdingExpanded &&
                holding.map((c: any) => (
                  <ProspectRow
                    key={c._id}
                    client={c}
                    stageLabel={holdingLabel(c.prospectState)}
                    stats={outreachStats[c._id]}
                    colors={colors}
                    router={router}
                  />
                ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StageFilterButton({
  label,
  count,
  active,
  dot,
  onClick,
  colors,
}: {
  label: string;
  count: number;
  active: boolean;
  dot: string | null;
  onClick: () => void;
  colors: any;
}) {
  const accent = colors.entityTypes.prospect;
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 10px", borderRadius: 4, cursor: "pointer",
        fontSize: 10, fontWeight: active ? 600 : 500, letterSpacing: "0.04em",
        textTransform: "uppercase" as const,
        border: `1px solid ${active ? accent : colors.border.default}`,
        background: active ? `${accent}14` : colors.bg.card,
        color: active ? colors.text.primary : colors.text.muted,
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />}
      {label}
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10 }}>{count}</span>
    </button>
  );
}

function StageGroup({ stage, rows, stats, colors, router }: { stage: StageDef; rows: any[]; stats: Record<string, { emailsSent: number; lastSentAt?: string; lastReplyAt?: string }>; colors: any; router: any }) {
  return (
    <>
      <tr style={{ background: colors.bg.cardAlt }}>
        <td colSpan={7} style={subheadStyle(colors)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.accent[stage.accentKey] }} />
            {stage.label} · {rows.length}
          </span>
        </td>
      </tr>
      {rows.map((c: any) => (
        <ProspectRow key={c._id} client={c} stageLabel={stage.shortLabel} stats={stats[c._id]} colors={colors} router={router} />
      ))}
    </>
  );
}

function ProspectRow({ client, stageLabel, stats, colors, router }: { client: any; stageLabel: string; stats?: { emailsSent: number; lastSentAt?: string; lastReplyAt?: string }; colors: any; router: any }) {
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
          {stageLabel}
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
      <td style={{ ...tdStyle(colors), color: stats?.emailsSent ? colors.text.primary : colors.text.muted }}>
        {stats?.emailsSent ? (
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontWeight: 500 }}>{stats.emailsSent}</span>
            {stats.lastSentAt && (
              <span style={{ fontSize: 10, color: colors.text.muted }}>
                last {String(stats.lastSentAt).slice(0, 10)}
              </span>
            )}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td style={{ ...tdStyle(colors), color: stats?.lastReplyAt ? colors.text.primary : colors.text.muted }}>
        {stats?.lastReplyAt ? String(stats.lastReplyAt).slice(0, 10) : "—"}
      </td>
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

// Off-pipeline holding rows show their prospectState reason (parked / lost /
// promoted) as the Status-column label, since they derive to no pipeline stage.
function holdingLabel(prospectState: string | undefined | null): string {
  if (!prospectState) return "Holding";
  return prospectState.charAt(0).toUpperCase() + prospectState.slice(1).replace(/_/g, " ");
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
