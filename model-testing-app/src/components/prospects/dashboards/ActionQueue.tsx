"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { Button, EmptyState } from "@/components/layouts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export type QueueAction = {
  id: string;
  type: "reply" | "approval" | "cadence" | "intel";
  title: string;
  subtitle: string;
  when: string;
  severity: "warn" | "info" | "ok";
  blocked: boolean;
  approve:
    | { kind: "cadence"; packageId: string }
    | { kind: "approval"; approvalId: string }
    | null;
};
export type QueueGroup = {
  clientId: string | null;
  clientName: string;
  blocking: { kind: "no_contact"; label: string } | null;
  actions: QueueAction[];
  latestAt: string;
};

const TYPE_LABELS: Record<QueueAction["type"], string> = {
  reply: "Reply",
  approval: "Review",
  cadence: "Cadence",
  intel: "Intel",
};

const PAGE = 8;

// The per-stage "requires action" queue, grouped by prospect. Each prospect is a
// card; a missing-contact blocker is surfaced at the top of the card and the
// dependent outbound actions are greyed out. Cadence packages and send approvals
// can be approved inline.
export function ActionQueue({ groups, total, accent }: { groups: QueueGroup[]; total: number; accent: string }) {
  const colors = useColors();
  const [shown, setShown] = useState(PAGE);

  // Defensive: never assume the server shape is present (frontend can briefly
  // lead/lag a Convex deploy). Treat a missing list as empty, not a crash.
  groups = Array.isArray(groups) ? groups : [];
  total = typeof total === "number" ? total : groups.length;

  if (groups.length === 0) {
    return <EmptyState title="Nothing needs attention" body="No replies, approvals, cadences or intel reruns waiting in this stage." />;
  }

  const visible = groups.slice(0, shown);
  const blockedCount = groups.filter((g) => g.blocking).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, color: colors.text.muted }}>
        <span>{total} prospect{total === 1 ? "" : "s"} need action</span>
        {blockedCount > 0 && (
          <span style={{ color: colors.accent.red }}>{blockedCount} blocked</span>
        )}
      </div>

      {visible.map((g) => (
        <GroupCard key={g.clientId ?? "unlinked"} group={g} accent={accent} colors={colors} />
      ))}

      {groups.length > shown && (
        <button
          onClick={() => setShown((n) => n + PAGE)}
          style={{
            padding: "8px 12px",
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: colors.text.secondary,
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Show more · {groups.length - shown} remaining
        </button>
      )}
    </div>
  );
}

function GroupCard({ group, accent, colors }: { group: QueueGroup; accent: string; colors: any }) {
  const router = useRouter();
  const openProspect = () => group.clientId && router.push(`/prospects/${group.clientId}`);

  return (
    <div
      style={{
        background: colors.bg.card,
        border: `1px solid ${group.blocking ? `${colors.accent.red}55` : colors.border.default}`,
        borderLeft: `2px solid ${group.blocking ? colors.accent.red : accent}`,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {/* Header — prospect name (prominent + clickable) + action count */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${colors.border.default}` }}>
        <button
          onClick={openProspect}
          style={{ background: "transparent", border: "none", padding: 0, cursor: group.clientId ? "pointer" : "default", textAlign: "left", color: colors.text.primary, fontSize: 13, fontWeight: 500 }}
        >
          {group.clientName}
        </button>
        <span style={{ fontFamily: MONO, fontSize: 10, color: colors.text.muted }}>
          {group.actions.length} action{group.actions.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Blocker — surfaced above the actions it blocks */}
      {group.blocking && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", background: `${colors.accent.red}12`, borderBottom: `1px solid ${colors.border.default}` }}>
          <span style={{ fontSize: 11, color: colors.accent.red, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>⚠</span> {group.blocking.label}
          </span>
          <Button size="sm" variant="secondary" onClick={openProspect}>Add contact</Button>
        </div>
      )}

      {/* Actions */}
      <div>
        {group.actions.map((a, i) => (
          <ActionRow key={a.id} action={a} last={i === group.actions.length - 1} colors={colors} />
        ))}
      </div>
    </div>
  );
}

function ActionRow({ action, last, colors }: { action: QueueAction; last: boolean; colors: any }) {
  const approvePackage = useMutation(api.cadences.approvePackage as any);
  const approveApproval = useMutation(api.approvals.approve as any);
  const [busy, setBusy] = useState(false);

  const tone =
    action.type === "reply" ? colors.accent.purple
    : action.type === "intel" ? colors.accent.orange
    : action.type === "cadence" ? colors.accent.cyan
    : colors.accent.blue;

  const handleApprove = async () => {
    if (!action.approve || busy || action.blocked) return;
    setBusy(true);
    try {
      if (action.approve.kind === "cadence") await approvePackage({ packageId: action.approve.packageId });
      else await approveApproval({ approvalId: action.approve.approvalId });
      // Convex reactivity drops the item from the queue on success.
    } catch (err) {
      console.error("Approve failed", err);
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderBottom: last ? "none" : `1px solid ${colors.border.default}`,
        opacity: action.blocked ? 0.5 : 1,
      }}
    >
      <span
        style={{
          flexShrink: 0,
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
        {TYPE_LABELS[action.type]}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: colors.text.primary, display: "flex", alignItems: "center", gap: 6 }}>
          {action.title}
          {action.blocked && (
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.04em", textTransform: "uppercase", color: colors.accent.red, border: `1px solid ${colors.accent.red}55`, borderRadius: 3, padding: "1px 4px" }}>
              Blocked
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: colors.text.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {action.subtitle}
        </div>
      </div>

      <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 10, color: colors.text.dim }}>
        {action.when ? String(action.when).slice(0, 10) : "—"}
      </span>

      {action.approve && (
        <Button size="sm" variant="primary" onClick={handleApprove} disabled={busy || action.blocked}>
          {busy ? "…" : "Approve"}
        </Button>
      )}
    </div>
  );
}
