"use client";

import { useColors } from "@/lib/useColors";
import { derivePipelineStage, stageFor } from "@/lib/prospects/stages";

interface ActivityTabProps {
  prospect: any;
  intelRun?: any;
  cadences: any[];
}

export function ActivityTab({ prospect, intelRun, cadences }: ActivityTabProps) {
  const colors = useColors();

  const events: Array<{ at: string; description: string }> = [];

  if (intelRun?._creationTime) {
    events.push({ at: new Date(intelRun._creationTime).toISOString(), description: `prospect-intel skillRun started (${intelRun._id.slice(-8)})` });
  }
  if (intelRun?.completedAt) {
    events.push({ at: intelRun.completedAt, description: `prospect-intel skillRun complete (${intelRun.status}; ${intelRun.gaps?.length ?? 0} gaps)` });
  }
  for (const c of cadences) {
    if (c.createdAt) events.push({ at: c.createdAt, description: `cadence touch ${c.packageOrder} queued: "${c.preDraftedTouch?.subject?.slice(0, 40) ?? "—"}"` });
    if (c.lastFiredAt) events.push({ at: c.lastFiredAt, description: `cadence touch ${c.packageOrder} fired (${c.lastResult})` });
  }
  // v3: pipelineStage is the canonical stage axis. Surface the latest stage
  // change from the denormalised client fields (the full stage history with
  // provenance lives in prospectStageEvents; that read-side query is owned by
  // another workstream). prospectState changes are no longer shown as a stage row.
  if (prospect?.pipelineStageChangedAt) {
    const stage = derivePipelineStage(prospect ?? {});
    events.push({ at: prospect.pipelineStageChangedAt, description: `stage → ${stageFor(stage)?.label ?? "off-pipeline"}` });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div style={{ background: colors.bg.card, padding: 14, border: `1px solid ${colors.border.default}`, borderRadius: 4 }}>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, textTransform: "uppercase" as const, color: colors.text.muted, marginBottom: 10 }}>
        Activity log
      </div>
      {events.length === 0 && <div style={{ fontSize: 11, color: colors.text.muted }}>No activity yet.</div>}
      {events.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: 11, borderBottom: i < events.length - 1 ? `1px solid ${colors.border.light}` : "none" }}>
          <span style={{ fontFamily: "ui-monospace, monospace", color: colors.text.muted, fontSize: 10, minWidth: 130 }}>{e.at.slice(0, 16)}</span>
          <span style={{ color: colors.text.primary }}>{e.description}</span>
        </div>
      ))}
    </div>
  );
}
