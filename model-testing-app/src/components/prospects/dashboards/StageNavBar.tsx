"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/prospects/stages";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Horizontal navigation across the pipeline: Summary + the 5 stage dashboards.
// Counts come from the same pipelineOverview query the summary uses (one shared
// reactive subscription). `active` highlights the current board.
export function StageNavBar({ active }: { active: PipelineStage | "summary" }) {
  const colors = useColors();
  const router = useRouter();
  const overview = useQuery(api.prospectStages.pipelineOverview, {}) as
    | { stages: { key: PipelineStage; count: number; actionItems: number }[]; totalProspects: number }
    | undefined;

  const countFor = (key: PipelineStage) =>
    overview?.stages.find((s) => s.key === key)?.count ?? 0;
  const actionsFor = (key: PipelineStage) =>
    overview?.stages.find((s) => s.key === key)?.actionItems ?? 0;

  const accentFor = (key: string | undefined) =>
    key ? (colors.accent as Record<string, string>)[key] ?? colors.entityTypes.prospect : colors.entityTypes.prospect;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        flexWrap: "wrap",
        borderBottom: `1px solid ${colors.border.default}`,
        background: colors.bg.card,
        marginBottom: 16,
      }}
    >
      <NavItem
        label="Summary"
        count={overview?.totalProspects}
        active={active === "summary"}
        accent={colors.entityTypes.prospect}
        onClick={() => router.push("/prospects")}
        colors={colors}
      />
      {PIPELINE_STAGES.map((s) => (
        <NavItem
          key={s.key}
          label={s.shortLabel}
          count={countFor(s.key)}
          actions={actionsFor(s.key)}
          active={active === s.key}
          accent={accentFor(s.accentKey)}
          onClick={() => router.push(`/prospects/stage/${s.key}`)}
          colors={colors}
        />
      ))}
    </div>
  );
}

function NavItem({
  label,
  count,
  actions,
  active,
  accent,
  onClick,
  colors,
}: {
  label: string;
  count?: number;
  actions?: number;
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
        padding: "12px 16px",
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? accent : "transparent"}`,
        marginBottom: -1,
        cursor: "pointer",
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight: active ? 600 : 400,
        color: active ? colors.text.primary : colors.text.muted,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, opacity: active ? 1 : 0.5 }} />
      {label}
      {count !== undefined && (
        <span style={{ fontSize: 10, color: active ? accent : colors.text.dim }}>{count}</span>
      )}
      {actions !== undefined && actions > 0 && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "1px 5px",
            borderRadius: 8,
            color: colors.accent.orange,
            background: `${colors.accent.orange}1a`,
            border: `1px solid ${colors.accent.orange}40`,
          }}
        >
          {actions}
        </span>
      )}
    </button>
  );
}
