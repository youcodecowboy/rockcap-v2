"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { EmptyState } from "@/components/layouts";
import { GroupCard, type QueueGroup } from "./ActionQueue";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Unified, cross-stage "Requires attention" surface for the /prospects home.
// Reads prospectStages.requiresAttention (grouped-by-prospect actions across all
// stages, each tagged with its stage) and renders the same GroupCard rows the
// per-stage queues use — every action is actionable in place. Defensive on the
// server shape (Array.isArray) so a Convex-before-Vercel deploy never crashes.
const FILTERS: { key: string; label: string }[] = [
  { key: "reply_draft", label: "Replies" },
  { key: "flag", label: "Flags" },
  { key: "cadence", label: "Cadences" },
  { key: "approval", label: "Approvals" },
  { key: "intel_attention", label: "Intel" },
  { key: "manual_move", label: "Moves" },
];

type RequiresAttention = {
  groups?: QueueGroup[];
  total?: number;
  blockedCount?: number;
};

export function RequiresAttentionTable() {
  const colors = useColors();
  const [active, setActive] = useState<string[]>([]);

  const data = useQuery(
    api.prospectStages.requiresAttention,
    active.length > 0 ? { reasonFilter: active } : {},
  ) as RequiresAttention | undefined;

  const accentFor = (key: string | undefined) =>
    key ? (colors.accent as Record<string, string>)[key] ?? colors.entityTypes.prospect : colors.entityTypes.prospect;

  const groups = Array.isArray(data?.groups) ? data!.groups : [];
  const total = typeof data?.total === "number" ? data!.total : groups.length;
  const blocked = typeof data?.blockedCount === "number" ? data!.blockedCount : groups.filter((g) => g.blocking).length;

  const toggle = (key: string) =>
    setActive((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  return (
    <section id="requires-attention" style={{ marginTop: 28, scrollMarginTop: 80 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted }}>
            Requires attention
          </span>
          <span style={{ fontSize: 12, color: colors.text.secondary }}>
            {total} prospect{total === 1 ? "" : "s"} need action
            {blocked > 0 && (
              <span style={{ color: colors.accent.red }}> · {blocked} blocked</span>
            )}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map((f) => {
            const on = active.includes(f.key);
            return (
              <button
                key={f.key}
                onClick={() => toggle(f.key)}
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 3,
                  cursor: "pointer",
                  color: on ? colors.entityTypes.prospect : colors.text.muted,
                  background: on ? `${colors.entityTypes.prospect}14` : colors.bg.card,
                  border: `1px solid ${on ? `${colors.entityTypes.prospect}59` : colors.border.default}`,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {data === undefined ? (
        <div style={{ fontFamily: MONO, fontSize: 11, color: colors.text.dim, padding: "16px 0" }}>Loading…</div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="Nothing needs attention"
          body={active.length > 0 ? "No prospects match the selected filters." : "No drafted replies, flags, approvals, cadences, intel reruns or stage decisions waiting."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.map((g) => (
            <GroupCard
              key={g.clientId ?? "unlinked"}
              group={g}
              accent={accentFor(g.stageAccentKey)}
              colors={colors}
            />
          ))}
        </div>
      )}
    </section>
  );
}
