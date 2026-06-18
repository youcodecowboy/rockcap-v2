"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { Panel, KpiRow, StatTile, DataTable, EmptyState, type Column, type Kpi } from "@/components/layouts";
import { ProspectsTab } from "@/components/prospects/tabs2/ProspectsTab";
import { EditTargetsButton } from "./TargetsModal";
import { stageFor, type PipelineStage } from "@/lib/prospects/stages";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type ServerKpi = { label: string; value: string; meta?: string; accentKey?: string; target?: number };
type MetricGroup = { title: string; kpis: ServerKpi[] };
type LadderStep = { key: string; label: string; count: number };
type ActionItem = {
  id: string;
  type: "reply" | "approval" | "cadence" | "intel";
  title: string;
  subtitle: string;
  clientId: string | null;
  clientName: string;
  occurredAt: string;
  severity: "warn" | "info" | "ok";
};
type StageData = {
  stage: PipelineStage;
  count: number;
  headline: ServerKpi[];
  metricGroups: MetricGroup[];
  ladder: { title: string; steps: LadderStep[] } | null;
  actionItems: ActionItem[];
  actionCounts: { replies: number; approvals: number; cadences: number; intel: number };
};

const ACTION_LABELS: Record<ActionItem["type"], string> = {
  reply: "Reply",
  approval: "Review",
  cadence: "Cadence",
  intel: "Intel",
};

export function StageDashboard({ stage }: { stage: PipelineStage }) {
  const colors = useColors();
  const router = useRouter();
  const [view, setView] = useState<"overview" | "table">("overview");

  const data = useQuery(api.prospectStages.stageDashboard, { stage }) as StageData | null | undefined;
  const def = stageFor(stage);

  const accentFor = (key: string | undefined) =>
    key ? (colors.accent as Record<string, string>)[key] ?? undefined : undefined;
  const stageAccent = accentFor(def?.accentKey) ?? colors.entityTypes.prospect;

  // Fold an optional house target into the value ("7 / 10") with the target dimmed.
  const kpiValue = (k: ServerKpi) =>
    k.target != null ? (
      <span>
        {k.value}
        <span style={{ color: colors.text.dim }}> / {k.target}</span>
      </span>
    ) : (
      k.value
    );

  const headlineKpis: Kpi[] = (data?.headline ?? []).map((k) => ({
    label: k.label,
    value: kpiValue(k),
    meta: k.meta,
    accent: accentFor(k.accentKey),
  }));

  const actionColumns: Column<ActionItem>[] = [
    {
      key: "type",
      header: "Type",
      width: 96,
      render: (r) => <TypeChip type={r.type} colors={colors} />,
    },
    {
      key: "item",
      header: "Item",
      render: (r) => (
        <div>
          <div style={{ color: colors.text.primary, fontWeight: 500 }}>{r.title}</div>
          <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.subtitle}
          </div>
        </div>
      ),
    },
    {
      key: "when",
      header: "When",
      width: 96,
      align: "right",
      mono: true,
      render: (r) => (r.occurredAt ? String(r.occurredAt).slice(0, 10) : "—"),
    },
  ];

  return (
    <div>
      {/* Top metrics bar — volume / pipeline position for this stage */}
      <div style={{ marginBottom: 8 }}>
        {data ? (
          <KpiRow items={headlineKpis} />
        ) : (
          <div style={{ height: 72, background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 4 }} />
        )}
      </div>
      {def?.description && (
        <div style={{ fontSize: 11, color: colors.text.muted, marginBottom: 16 }}>{def.description}</div>
      )}

      {/* View toggle — Overview (action items + performance) vs the per-stage table */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${colors.border.default}`, marginBottom: 16 }}>
        <ViewTab label="Overview" active={view === "overview"} accent={stageAccent} onClick={() => setView("overview")} colors={colors} />
        <ViewTab label="All prospects" count={data?.count} active={view === "table"} accent={stageAccent} onClick={() => setView("table")} colors={colors} />
        <div style={{ marginLeft: "auto", paddingBottom: 6 }}>
          <EditTargetsButton />
        </div>
      </div>

      {view === "overview" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          {/* Left — requires action */}
          <Panel
            title="Requires action"
            accent={colors.accent.orange}
            padded={false}
            actions={
              data && data.actionItems.length > 0 ? (
                <span style={{ fontFamily: MONO, fontSize: 10, color: colors.text.muted }}>{data.actionItems.length}</span>
              ) : undefined
            }
          >
            <DataTable
              columns={actionColumns}
              rows={data?.actionItems ?? []}
              getRowKey={(r) => r.id}
              onRowClick={(r) => r.clientId && router.push(`/prospects/${r.clientId}`)}
              empty={<EmptyState title="Nothing needs attention" body="No replies, approvals or intel reruns waiting in this stage." />}
            />
          </Panel>

          {/* Right — bespoke metric groups (+ sub-stage ladder for pre-qual/qualified) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data?.ladder && (
              <Panel title={data.ladder.title} accent={stageAccent}>
                <LadderStrip steps={data.ladder.steps} accent={stageAccent} colors={colors} />
              </Panel>
            )}
            {(data?.metricGroups ?? []).map((group) => (
              <Panel key={group.title} title={group.title}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {group.kpis.map((k) => (
                    <StatTile key={k.label} label={k.label} value={kpiValue(k)} meta={k.meta} accent={accentFor(k.accentKey)} />
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      ) : (
        <ProspectsTab pipelineStage={stage} />
      )}
    </div>
  );
}

// Horizontal ladder of discrete workflow steps, each showing how many prospects
// sit there right now. Steps are connected left→right to read as a progression.
function LadderStrip({ steps, accent, colors }: { steps: LadderStep[]; accent: string; colors: any }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 92,
              padding: "8px 10px",
              borderRadius: 4,
              background: s.count > 0 ? `${accent}10` : colors.bg.card,
              border: `1px solid ${s.count > 0 ? `${accent}40` : colors.border.default}`,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 300, lineHeight: 1, color: s.count > 0 ? colors.text.primary : colors.text.dim }}>
              {s.count}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase", color: colors.text.muted }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && <span style={{ color: colors.text.dim, fontSize: 12 }}>→</span>}
        </div>
      ))}
    </div>
  );
}

function TypeChip({ type, colors }: { type: ActionItem["type"]; colors: any }) {
  const tone =
    type === "reply" ? colors.accent.purple
    : type === "intel" ? colors.accent.orange
    : type === "cadence" ? colors.accent.cyan
    : colors.accent.blue;
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 3,
        color: tone,
        background: `${tone}14`,
        border: `1px solid ${tone}40`,
      }}
    >
      {ACTION_LABELS[type]}
    </span>
  );
}

function ViewTab({
  label,
  count,
  active,
  accent,
  onClick,
  colors,
}: {
  label: string;
  count?: number;
  active: boolean;
  accent: string;
  onClick: () => void;
  colors: any;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? accent : "transparent"}`,
        marginBottom: -1,
        cursor: "pointer",
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontWeight: active ? 600 : 400,
        color: active ? colors.text.primary : colors.text.muted,
      }}
    >
      {label}
      {count !== undefined && <span style={{ fontSize: 10, color: colors.text.dim }}>{count}</span>}
    </button>
  );
}
