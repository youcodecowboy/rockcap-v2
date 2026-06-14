"use client";

import { useParams, useRouter } from "next/navigation";
import { useColors } from "@/lib/useColors";
import { StageNavBar } from "@/components/prospects/dashboards/StageNavBar";
import { StageDashboard } from "@/components/prospects/dashboards/StageDashboard";
import { isPipelineStage, stageFor } from "@/lib/prospects/stages";

export default function ProspectStagePage() {
  const colors = useColors();
  const router = useRouter();
  const params = useParams<{ stage: string }>();
  const stageParam = params?.stage;

  const valid = isPipelineStage(stageParam);
  const def = valid ? stageFor(stageParam) : null;
  const accent = def ? (colors.accent as Record<string, string>)[def.accentKey] ?? colors.entityTypes.prospect : colors.entityTypes.prospect;

  return (
    <>
      <div style={{ height: 2, background: accent }} />
      <div style={{ padding: "16px 24px", background: colors.bg.cardAlt, minHeight: "100vh" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary, margin: 0 }}>
            {def ? def.label : "Unknown stage"}
          </h1>
          <p style={{ fontSize: 13, color: colors.text.muted, marginTop: 4 }}>
            {def ? "Stage dashboard — action queue and performance." : "This pipeline stage doesn't exist."}
          </p>
        </div>

        <StageNavBar active={valid ? (stageParam as any) : "summary"} />

        {valid && def ? (
          <StageDashboard stage={stageParam as any} />
        ) : (
          <button
            onClick={() => router.push("/prospects")}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${colors.border.default}`,
              background: colors.bg.card,
              color: colors.text.primary,
              cursor: "pointer",
            }}
          >
            ← Back to pipeline summary
          </button>
        )}
      </div>
    </>
  );
}
