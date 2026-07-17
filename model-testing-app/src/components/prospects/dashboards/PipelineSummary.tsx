"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { Panel, KpiRow, type Kpi } from "@/components/layouts";
import { EditTargetsButton } from "./TargetsModal";
import { PIPELINE_STAGES, stageFor, type PipelineStage } from "@/lib/prospects/stages";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type StageOverview = {
  key: PipelineStage;
  count: number;
  pipelineValueGBP: number;
  pipelineValueLabel: string;
  estValueGBP: number;
  estValueLabel: string;
  estCount: number;
  actionItems: number;
};
type ServerKpi = { label: string; value: string; meta?: string; accentKey?: string; target?: number };
type Overview = {
  stages: StageOverview[];
  totalProspects: number;
  holding: number;
  totalActionItems: number;
  pricedTotal: number;
  estTotalGBP: number;
  estMeanGBP: number;
  estMedianGBP: number;
  estCount: number;
  summaryKpis: ServerKpi[];
};

function fmtGBP(n: number): string {
  if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${Math.round(n)}`;
}

// The prospecting landing view: headline KPIs + a card per pipeline stage.
// Each card links into that stage's dashboard. The detailed action tables and
// performance KPIs live on the stage dashboards themselves.
export function PipelineSummary() {
  const colors = useColors();
  const router = useRouter();
  const overview = useQuery(api.prospectStages.pipelineOverview, {}) as Overview | undefined;

  const accentFor = (key: string | undefined) =>
    key ? (colors.accent as Record<string, string>)[key] ?? colors.entityTypes.prospect : colors.entityTypes.prospect;

  // Estimated pipeline value: AI dealSizeRange midpoints + operator overrides.
  // Total is mean-based (counts the big schemes); median is the typical deal.
  const estTotal = overview?.estTotalGBP ?? 0;

  const kpis: Kpi[] = [
    { label: "Prospects in pipeline", value: overview ? String(overview.totalProspects) : "—", accent: colors.entityTypes.prospect },
    { label: "Est. pipeline value", value: estTotal > 0 ? fmtGBP(estTotal) : "—", meta: overview ? `${overview.estCount ?? 0}/${overview.totalProspects} estimated` : "AI estimate", accent: colors.accent.green },
    { label: "Typical deal", value: overview && overview.estMedianGBP > 0 ? fmtGBP(overview.estMedianGBP) : "—", meta: overview && overview.estMeanGBP > 0 ? `median · mean ${fmtGBP(overview.estMeanGBP)}` : "median" },
    {
      label: "Requires action",
      // Click-to-scroll anchor down to the unified RequiresAttentionTable so the
      // count and the actionable list connect.
      value: (
        <span
          onClick={() => {
            if (typeof document !== "undefined") {
              document.getElementById("requires-attention")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
          style={{ cursor: overview && overview.totalActionItems > 0 ? "pointer" : "default" }}
          title={overview && overview.totalActionItems > 0 ? "Jump to what needs action" : undefined}
        >
          {overview ? String(overview.totalActionItems) : "—"}
        </span>
      ),
      accent: overview && overview.totalActionItems > 0 ? colors.accent.orange : undefined,
    },
    { label: "Holding", value: overview ? String(overview.holding) : "—", meta: "parked / lost / promoted" },
  ];

  // Curated cross-pipeline KPIs (the client's "Summary" spec) — the key metric
  // from each stage, period-to-date. Targets render dimmed inline ("7 / 10").
  const periodKpis: Kpi[] = (overview?.summaryKpis ?? []).map((k) => ({
    label: k.label,
    value:
      k.target != null ? (
        <span>
          {k.value}
          <span style={{ color: colors.text.dim }}> / {k.target}</span>
        </span>
      ) : (
        k.value
      ),
    meta: k.meta,
    accent: k.accentKey ? accentFor(k.accentKey) : undefined,
  }));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <KpiRow items={kpis} />
      </div>

      {periodKpis.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted }}>
              This period · week &amp; month to date
            </div>
            <EditTargetsButton />
          </div>
          <div style={{ marginBottom: 20 }}>
            <KpiRow items={periodKpis} />
          </div>
        </>
      )}

      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted, marginBottom: 10 }}>
        Pipeline stages
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
        }}
      >
        {PIPELINE_STAGES.map((def) => {
          const s = overview?.stages.find((x) => x.key === def.key);
          const accent = accentFor(def.accentKey);
          return (
            <StageCard
              key={def.key}
              label={def.label}
              description={def.description}
              count={s?.count ?? 0}
              valueLabel={s?.estValueLabel ?? "—"}
              actionItems={s?.actionItems ?? 0}
              accent={accent}
              loading={!overview}
              onClick={() => router.push(`/prospects/stage/${def.key}`)}
              colors={colors}
            />
          );
        })}
      </div>
    </div>
  );
}

function StageCard({
  label,
  description,
  count,
  valueLabel,
  actionItems,
  accent,
  loading,
  onClick,
  colors,
}: {
  label: string;
  description: string;
  count: number;
  valueLabel: string;
  actionItems: number;
  accent: string;
  loading: boolean;
  onClick: () => void;
  colors: any;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.bg.card,
        borderRight: `1px solid ${colors.border.default}`,
        borderBottom: `1px solid ${colors.border.default}`,
        borderLeft: `1px solid ${colors.border.default}`,
        borderTop: `2px solid ${accent}`,
        borderRadius: 4,
        padding: 14,
        cursor: "pointer",
        transition: "background 100ms linear",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 150,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = colors.bg.cardAlt)}
      onMouseLeave={(e) => (e.currentTarget.style.background = colors.bg.card)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.text.secondary, fontWeight: 500 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent }} />
          {label}
        </span>
        {actionItems > 0 && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 8,
              color: colors.accent.orange,
              background: `${colors.accent.orange}1a`,
              border: `1px solid ${colors.accent.orange}40`,
              whiteSpace: "nowrap",
            }}
          >
            {actionItems} action{actionItems === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 34, fontWeight: 300, color: colors.text.primary, lineHeight: 1 }}>
          {loading ? "—" : count}
        </span>
        <span style={{ fontSize: 11, color: colors.text.muted }}>prospect{count === 1 ? "" : "s"}</span>
      </div>

      <div style={{ fontSize: 11, color: colors.text.muted }}>
        <span style={{ fontFamily: MONO, color: colors.text.secondary }}>{valueLabel}</span> est. value
      </div>

      <div style={{ fontSize: 10, color: colors.text.dim, marginTop: "auto" }}>{description}</div>
    </div>
  );
}
