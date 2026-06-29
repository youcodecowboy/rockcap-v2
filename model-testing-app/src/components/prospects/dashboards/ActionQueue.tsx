"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { Button, EmptyState } from "@/components/layouts";
import { InlineDraftEditor } from "@/components/prospects/InlineDraftEditor";
import { StageChip } from "@/components/prospects/StageChip";
import { PromptLauncherModal } from "@/components/prospects/PromptLauncherModal";
import { buildActionPrompt, type ActionPrompt, type LauncherActionKind } from "@/lib/prospects/actionPrompts";
import {
  PIPELINE_STAGES,
  ladderForStage,
  subStageLabel,
  isPipelineStage,
  type PipelineStage,
} from "@/lib/prospects/stages";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export type QueueActionType =
  | "reply"
  | "reply_draft"
  | "flag"
  | "approval"
  | "cadence"
  | "intel"
  | "intel_attention"
  | "manual_move";

export type QueueAction = {
  id: string;
  type: QueueActionType;
  title: string;
  subtitle: string;
  when: string;
  severity: "warn" | "info" | "ok";
  blocked: boolean;
  approve:
    | { kind: "cadence"; packageId: string }
    | { kind: "approval"; approvalId: string }
    | null;
  // Inline-control payloads (present only for the matching kind — guard reads).
  replyDraft?: { approvalId: string; subject: string; bodyText: string; bodyHtml?: string; to?: string };
  flag?: { clientId: string; kind: string; sourceReplyEventId?: string };
  intelAttention?: { clientId: string; reason?: string };
  manualMove?: { clientId: string; stage: string; currentSubStage?: string };
};

export type QueueGroup = {
  clientId: string | null;
  clientName: string;
  stage?: string | null;
  stageLabel?: string;
  stageAccentKey?: string;
  blocking: { kind: "no_contact"; label: string } | null;
  actions: QueueAction[];
  latestAt: string;
};

const TYPE_LABELS: Record<QueueActionType, string> = {
  reply: "Reply",
  reply_draft: "Reply",
  flag: "Flag",
  approval: "Review",
  cadence: "Cadence",
  intel: "Intel",
  intel_attention: "Intel",
  manual_move: "Move",
};

function toneFor(type: QueueActionType, colors: any): string {
  switch (type) {
    case "reply":
    case "reply_draft":
      return colors.accent.purple;
    case "flag":
      return colors.accent.orange;
    case "intel":
    case "intel_attention":
      return colors.accent.orange;
    case "cadence":
      return colors.accent.cyan;
    case "manual_move":
      return colors.accent.green;
    default:
      return colors.accent.blue;
  }
}

const PAGE = 8;

// The "requires action" queue, grouped by prospect. Each prospect is a card; a
// missing-contact blocker is surfaced at the top of the card and the dependent
// outbound actions are greyed out. Every action kind is actionable in place.
// Used by both the per-stage dashboards and the cross-stage home table — the
// latter passes groups carrying stage metadata (rendered as a chip).
export function ActionQueue({ groups, total, accent }: { groups: QueueGroup[]; total: number; accent: string }) {
  const colors = useColors();
  const [shown, setShown] = useState(PAGE);

  // Defensive: never assume the server shape is present (frontend can briefly
  // lead/lag a Convex deploy). Treat a missing list as empty, not a crash.
  groups = Array.isArray(groups) ? groups : [];
  total = typeof total === "number" ? total : groups.length;

  if (groups.length === 0) {
    return <EmptyState title="Nothing needs attention" body="No replies, approvals, cadences or intel reruns waiting." />;
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

export function GroupCard({ group, accent, colors }: { group: QueueGroup; accent: string; colors: any }) {
  const router = useRouter();
  const openProspect = () => group.clientId && router.push(`/prospects/${group.clientId}`);
  const stage = group.stage && isPipelineStage(group.stage) ? (group.stage as PipelineStage) : null;
  const actions = Array.isArray(group.actions) ? group.actions : [];

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
      {/* Header — prospect name (prominent + clickable) + optional stage chip + action count */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${colors.border.default}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <button
            onClick={openProspect}
            style={{ background: "transparent", border: "none", padding: 0, cursor: group.clientId ? "pointer" : "default", textAlign: "left", color: colors.text.primary, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {group.clientName}
          </button>
          {stage && <StageChip stage={stage} size="sm" />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: colors.text.muted }}>
            {actions.length} action{actions.length === 1 ? "" : "s"}
          </span>
          {group.clientId && (
            <Button size="sm" variant="secondary" onClick={openProspect}>
              Open profile →
            </Button>
          )}
        </div>
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
        {actions.map((a, i) => (
          <ActionRow
            key={a.id}
            action={a}
            last={i === actions.length - 1}
            colors={colors}
            clientId={group.clientId}
            clientName={group.clientName}
          />
        ))}
      </div>
    </div>
  );
}

function ActionRow({ action, last, colors, clientId, clientName }: { action: QueueAction; last: boolean; colors: any; clientId?: string | null; clientName?: string }) {
  const router = useRouter();
  const approvePackage = useMutation(api.cadences.approvePackage as any);
  const approveApproval = useMutation(api.approvals.approve as any);
  const clearNeedsActionFlag = useMutation(api.clients.clearNeedsActionFlag as any);
  const requestRevalidate = useMutation(api.intelRevalidate.requestRevalidate as any);
  const clearIntelAttention = useMutation(api.intelRevalidate.clearIntelAttention as any);
  const promoteStage = useMutation(api.prospectStages.promoteStage as any);
  const setQualSubStage = useMutation(api.prospectStages.setQualSubStage as any);

  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState(false);
  const [launch, setLaunch] = useState<ActionPrompt | null>(null);

  // Open the prompt-launcher modal for a generative action — Claude Code does the
  // work via MCP; the app never calls the LLM API for these.
  const doLaunch = (kind: LauncherActionKind, extra: Record<string, any> = {}) => {
    if (!clientId) return;
    setLaunch(
      buildActionPrompt(kind, {
        clientId,
        clientName: clientName ?? "this prospect",
        replyEventId: action.flag?.sourceReplyEventId ?? null,
        ...extra,
      }),
    );
  };

  const tone = toneFor(action.type, colors);

  const run = async (fn: () => Promise<any>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      // Convex reactivity normally drops the item; for derived rows that may lag
      // a re-query we also locally hide it so the operator sees instant feedback.
      setDone(true);
    } catch (err) {
      console.error("Action failed", err);
      setBusy(false);
    }
  };

  const handleApprove = () => {
    if (!action.approve || action.blocked) return;
    if (action.approve.kind === "cadence") {
      const packageId = action.approve.packageId;
      void run(() => approvePackage({ packageId }));
    } else {
      const approvalId = action.approve.approvalId;
      void run(() => approveApproval({ approvalId }));
    }
  };

  if (done) return null;

  const rowBase = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    opacity: action.blocked ? 0.5 : 1,
  } as const;

  return (
    <div style={{ borderBottom: last && !expanded ? "none" : `1px solid ${colors.border.default}` }}>
      <div style={rowBase}>
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
          {TYPE_LABELS[action.type] ?? "Action"}
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

        <Controls
          action={action}
          colors={colors}
          busy={busy}
          expanded={expanded}
          setExpanded={setExpanded}
          handleApprove={handleApprove}
          onClearFlag={() =>
            action.flag &&
            run(() =>
              clearNeedsActionFlag({
                clientId: action.flag!.clientId,
                kind: action.flag!.kind,
                ...(action.flag!.sourceReplyEventId ? { sourceReplyEventId: action.flag!.sourceReplyEventId } : {}),
              }),
            )
          }
          onRevalidate={() =>
            action.intelAttention && run(() => requestRevalidate({ clientId: action.intelAttention!.clientId }))
          }
          onDismissIntel={() =>
            action.intelAttention && run(() => clearIntelAttention({ clientId: action.intelAttention!.clientId }))
          }
          onPromote={(toStage: string) =>
            action.manualMove && run(() => promoteStage({ clientId: action.manualMove!.clientId, toStage }))
          }
          onSubStage={(subStage: string) =>
            action.manualMove && run(() => setQualSubStage({ clientId: action.manualMove!.clientId, subStage }))
          }
          openProspect={() => action.flag && router.push(`/prospects/${action.flag.clientId}`)}
          onLaunch={doLaunch}
        />
      </div>

      {/* reply_draft — expandable inline editor */}
      {action.type === "reply_draft" && expanded && action.replyDraft && (
        <div style={{ padding: "0 12px 12px" }}>
          <InlineDraftEditor
            approvalId={action.replyDraft.approvalId as any}
            initialSubject={action.replyDraft.subject ?? ""}
            initialBodyText={action.replyDraft.bodyText ?? ""}
            initialBodyHtml={action.replyDraft.bodyHtml}
            to={action.replyDraft.to}
            onDone={() => setDone(true)}
            onCancel={() => setExpanded(false)}
          />
        </div>
      )}

      {launch && <PromptLauncherModal action={launch} onClose={() => setLaunch(null)} />}
    </div>
  );
}

function Controls({
  action,
  colors,
  busy,
  expanded,
  setExpanded,
  handleApprove,
  onClearFlag,
  onRevalidate,
  onDismissIntel,
  onPromote,
  onSubStage,
  openProspect,
}: {
  action: QueueAction;
  colors: any;
  busy: boolean;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  handleApprove: () => void;
  onClearFlag: () => void;
  onRevalidate: () => void;
  onDismissIntel: () => void;
  onPromote: (toStage: string) => void;
  onSubStage: (subStage: string) => void;
  openProspect: () => void;
  onLaunch: (kind: LauncherActionKind, extra?: Record<string, any>) => void;
}) {
  // cadence / approval — one-click approve.
  if (action.approve) {
    return (
      <Button size="sm" variant="primary" onClick={handleApprove} disabled={busy || action.blocked}>
        {busy ? "…" : "Approve"}
      </Button>
    );
  }

  if (action.type === "reply_draft" && action.replyDraft) {
    return (
      <Button size="sm" variant={expanded ? "secondary" : "primary"} onClick={() => setExpanded(!expanded)} disabled={busy}>
        {expanded ? "Close" : "Review & send"}
      </Button>
    );
  }

  if (action.type === "flag") {
    // A reply-derived flag (has a source reply) can be answered: launch a draft
    // prompt for Claude Code. Meeting-request flags launch the book-meeting prompt.
    const isReply = !!action.flag?.sourceReplyEventId;
    const wantsMeeting = (action.flag?.kind ?? "").includes("meeting");
    return (
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {isReply && (
          <Button size="sm" variant="primary" onClick={() => onLaunch(wantsMeeting ? "book_meeting" : "draft_reply")} disabled={busy}>
            {wantsMeeting ? "Book the meeting →" : "Draft a reply →"}
          </Button>
        )}
        {isReply && (
          <Button size="sm" variant="secondary" onClick={openProspect} disabled={busy}>Open</Button>
        )}
        <Button size="sm" variant="secondary" onClick={onClearFlag} disabled={busy}>
          {busy ? "…" : "Dismiss"}
        </Button>
      </div>
    );
  }

  if (action.type === "intel_attention") {
    return (
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <Button size="sm" variant="primary" onClick={onRevalidate} disabled={busy}>
          {busy ? "…" : "Re-validate"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onLaunch("refresh_intel", { note: action.intelAttention?.reason })} disabled={busy}>
          Refresh full intel →
        </Button>
        <Button size="sm" variant="secondary" onClick={onDismissIntel} disabled={busy}>Dismiss</Button>
      </div>
    );
  }

  // intel (failed / complete_with_gaps) — previously a dead label; now launches a
  // full prospect-intel refresh in Claude Code.
  if (action.type === "intel") {
    return (
      <Button size="sm" variant="primary" onClick={() => onLaunch("refresh_intel")} disabled={busy}>
        Refresh intel →
      </Button>
    );
  }

  if (action.type === "manual_move" && action.manualMove) {
    const stage = action.manualMove.stage && isPipelineStage(action.manualMove.stage)
      ? (action.manualMove.stage as PipelineStage)
      : null;
    const ladder = stage ? ladderForStage(stage) : null;
    return (
      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
        {ladder && (
          <select
            value={action.manualMove.currentSubStage ?? ""}
            disabled={busy}
            onChange={(e) => e.target.value && onSubStage(e.target.value)}
            style={selectStyle(colors)}
            title="Set ladder step"
          >
            <option value="">{action.manualMove.currentSubStage ? subStageLabel(action.manualMove.currentSubStage) : "Set step…"}</option>
            {ladder.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        )}
        <select
          value={stage ?? ""}
          disabled={busy}
          onChange={(e) => e.target.value && e.target.value !== stage && onPromote(e.target.value)}
          style={selectStyle(colors)}
          title="Move stage"
        >
          {PIPELINE_STAGES.map((d) => (
            <option key={d.key} value={d.key}>{d.shortLabel}</option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}

function selectStyle(colors: any) {
  return {
    fontFamily: MONO,
    fontSize: 10,
    padding: "4px 6px",
    color: colors.text.secondary,
    background: colors.bg.cardAlt,
    border: `1px solid ${colors.border.default}`,
    borderRadius: 4,
    cursor: "pointer",
  } as const;
}
