"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { CadencePresetPicker } from "../CadencePresetPicker";
import { Save, RotateCcw, Eye, Edit3, CheckCircle2, AlertTriangle, Mail, Linkedin, User } from "lucide-react";

interface OutreachTabProps {
  cadences: any[];
  contacts?: any[];
}

// v1.2.1 Outreach tab. Per-touch inline editing of subject + body. Save
// round-trips through cadences.update which sets the editedByOperator audit
// fields. Switching between Edit / Preview shows the HTML rendered email
// for read-checks before save. Cadence preset picker reschedules all
// unfired touches in the package.
//
// Detect dirty state per touch by comparing current local state to the
// persisted row's preDraftedTouch. Save button enables only when dirty.

interface TouchDraft {
  subject: string;
  bodyText: string;
}

function toHtmlFromPlainText(plain: string): string {
  // Mirror the simple "split paragraphs by blank lines, wrap in <p>" pattern
  // that the skill's draft step uses. Keeps HTML/text in sync without an
  // editor framework.
  return plain
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

function inferCurrentPreset(cadences: any[]): string {
  // Look at the actual nextDueAt offsets between unfired touches to guess
  // which preset best matches. If gaps don't match any preset, return
  // "custom".
  const sorted = [...cadences]
    .filter((c) => (c.packageOrder ?? 0) >= 1)
    .sort((a, b) => (a.packageOrder ?? 0) - (b.packageOrder ?? 0));
  if (sorted.length < 2) return "custom";
  const t1 = sorted[0];
  const anchor = t1.lastFiredAt ?? t1.nextDueAt;
  if (!anchor) return "custom";
  const anchorMs = new Date(anchor).getTime();
  const gaps = sorted.slice(1).map((c) => {
    if (!c.nextDueAt) return -1;
    return Math.round((new Date(c.nextDueAt).getTime() - anchorMs) / (24 * 60 * 60 * 1000));
  });
  const presets: Record<string, number[]> = {
    light: [10, 25, 60],
    moderate: [5, 12, 30],
    aggressive: [2, 5, 10],
  };
  for (const [name, expected] of Object.entries(presets)) {
    let match = true;
    for (let i = 0; i < gaps.length; i++) {
      const exp = expected[i];
      if (exp === undefined) break;
      // Allow ±1 day tolerance for rounding/timezone slippage
      if (Math.abs(gaps[i] - exp) > 1) {
        match = false;
        break;
      }
    }
    if (match) return name;
  }
  return "custom";
}

export function OutreachTab({ cadences, contacts }: OutreachTabProps) {
  const colors = useColors();
  const updateCadence = useMutation(api.cadences.update);
  const applyPreset = useMutation(api.cadences.applyPresetSchedule);
  const setPackageContact = useMutation(api.cadences.setPackageContact);

  const sorted = useMemo(
    () => [...cadences].sort((a, b) => (a.packageOrder ?? 0) - (b.packageOrder ?? 0)),
    [cadences],
  );
  const packageId = sorted[0]?.packageId;
  const currentPreset = useMemo(() => inferCurrentPreset(sorted), [sorted]);

  // Per-touch local draft state, keyed by cadence id
  const [drafts, setDrafts] = useState<Record<string, TouchDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presetApplying, setPresetApplying] = useState<string | null>(null);
  const [changingRecipient, setChangingRecipient] = useState(false);

  // Current recipient — taken from the first UNFIRED touch (that's the row a
  // recipient change would affect), falling back to Touch 1 if everything has
  // fired. A package drafted contactless (needs_contact) has no contactId at
  // all, in which case the selector below is how the operator attaches one.
  const recipientContactId =
    sorted.find((c) => !c.lastFiredAt)?.contactId ?? sorted[0]?.contactId;
  const recipient = (contacts ?? []).find((ct) => ct._id === recipientContactId);
  const hasUnfired = sorted.some((c) => !c.lastFiredAt);

  async function handleRecipientChange(contactId: string) {
    if (!packageId || !contactId || contactId === recipientContactId) return;
    setChangingRecipient(true);
    setError(null);
    try {
      await setPackageContact({ packageId, contactId: contactId as any });
    } catch (e: any) {
      setError(`Recipient change failed: ${e?.message ?? e}`);
    } finally {
      setChangingRecipient(false);
    }
  }

  // Initialize / reset drafts when cadences change (e.g., after a save the
  // useQuery re-runs and we want the new persisted values).
  useEffect(() => {
    const next: Record<string, TouchDraft> = {};
    for (const c of sorted) {
      next[c._id] = {
        subject: c.preDraftedTouch?.subject ?? "",
        bodyText: c.preDraftedTouch?.bodyText ?? "",
      };
    }
    setDrafts((prev) => {
      // Only overwrite drafts whose persisted version changed — preserves
      // in-progress edits if Convex pushes an update for an unrelated touch.
      const merged: Record<string, TouchDraft> = { ...prev };
      for (const c of sorted) {
        const persisted = next[c._id];
        const localDraft = prev[c._id];
        if (!localDraft) {
          merged[c._id] = persisted;
          continue;
        }
        // If the local draft matches a previous persisted value AND the
        // new persisted differs, update. This is a heuristic — perfect
        // diff tracking would need a separate "lastSyncedVersion" field.
        const localUnchanged =
          localDraft.subject === c.preDraftedTouch?.subject &&
          localDraft.bodyText === c.preDraftedTouch?.bodyText;
        if (!localUnchanged && (localDraft.subject !== persisted.subject || localDraft.bodyText !== persisted.bodyText)) {
          // Local has unsaved edits — keep them
          continue;
        }
        merged[c._id] = persisted;
      }
      return merged;
    });
  }, [sorted]);

  function isDirty(cadence: any): boolean {
    const d = drafts[cadence._id];
    if (!d) return false;
    return (
      d.subject !== (cadence.preDraftedTouch?.subject ?? "") ||
      d.bodyText !== (cadence.preDraftedTouch?.bodyText ?? "")
    );
  }

  async function handleSave(cadence: any) {
    setSavingId(cadence._id);
    setError(null);
    try {
      const draft = drafts[cadence._id];
      if (!draft) return;
      await updateCadence({
        cadenceId: cadence._id,
        preDraftedTouch: {
          subject: draft.subject,
          bodyText: draft.bodyText,
          bodyHtml: toHtmlFromPlainText(draft.bodyText),
          dynamicVars: cadence.preDraftedTouch?.dynamicVars,
        },
      });
      setSavedFlash((p) => ({ ...p, [cadence._id]: Date.now() }));
      setEditingId(null);
    } catch (e: any) {
      setError(`Save failed: ${e?.message ?? e}`);
    } finally {
      setSavingId(null);
    }
  }

  function handleRevert(cadence: any) {
    setDrafts((p) => ({
      ...p,
      [cadence._id]: {
        subject: cadence.preDraftedTouch?.subject ?? "",
        bodyText: cadence.preDraftedTouch?.bodyText ?? "",
      },
    }));
  }

  async function handleApplyPreset(preset: string) {
    if (!packageId) return;
    if (preset === "custom") return; // no-op
    if (preset === currentPreset) return; // no-op
    setPresetApplying(preset);
    setError(null);
    try {
      await applyPreset({ packageId, preset: preset as any });
    } catch (e: any) {
      setError(`Preset apply failed: ${e?.message ?? e}`);
    } finally {
      setPresetApplying(null);
    }
  }

  // Auto-fade the saved-flash badge after 2s
  useEffect(() => {
    const ids = Object.keys(savedFlash);
    if (ids.length === 0) return;
    const t = setTimeout(() => setSavedFlash({}), 2000);
    return () => clearTimeout(t);
  }, [savedFlash]);

  if (sorted.length === 0) {
    return (
      <div
        style={{
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          padding: 24,
          color: colors.text.muted,
          fontSize: 12,
        }}
      >
        No cadences in this package yet.
      </div>
    );
  }

  return (
    <div>
      {/* Recipient bar — who this whole package sends to. Changing it
          re-points every unfired touch (fired touches keep their history),
          so the package approval below is unambiguously "approve sending
          these emails to THIS person". */}
      <RecipientCard
        recipient={recipient}
        recipientContactId={recipientContactId}
        contacts={contacts ?? []}
        hasUnfired={hasUnfired}
        changing={changingRecipient}
        onChange={handleRecipientChange}
        colors={colors}
      />

      {/* Preset picker bar */}
      <div
        style={{
          padding: "12px 14px",
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          background: colors.bg.card,
          marginBottom: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: colors.text.muted,
              marginBottom: 4,
            }}
          >
            Cadence aggressiveness
          </div>
          <div style={{ fontSize: 11, color: colors.text.secondary }}>
            Reschedules Touches 2-4 relative to Touch 1.{" "}
            <span style={{ color: colors.text.muted }}>
              Fired touches are never moved.
            </span>
          </div>
        </div>
        <CadencePresetPicker
          current={presetApplying ?? currentPreset}
          onSelect={handleApplyPreset}
          disabled={presetApplying !== null}
        />
      </div>

      {error && (
        <div
          style={{
            padding: "10px 12px",
            background: "#fee2e2",
            border: `1px solid ${colors.accent.red}`,
            color: "#7f1d1d",
            borderRadius: 4,
            fontSize: 11,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {/* Per-touch editable cards */}
      {sorted.map((c) => {
        const draft = drafts[c._id] ?? {
          subject: c.preDraftedTouch?.subject ?? "",
          bodyText: c.preDraftedTouch?.bodyText ?? "",
        };
        const dirty = isDirty(c);
        const isSaving = savingId === c._id;
        const isPreview = editingId !== null && editingId !== c._id ? false : editingId === c._id ? false : false;
        // Simpler: track preview state per-touch in separate state
        return (
          <TouchCard
            key={c._id}
            cadence={c}
            draft={draft}
            dirty={dirty}
            isSaving={isSaving}
            saved={!!savedFlash[c._id]}
            colors={colors}
            onChange={(d) => setDrafts((p) => ({ ...p, [c._id]: d }))}
            onSave={() => handleSave(c)}
            onRevert={() => handleRevert(c)}
          />
        );
      })}
    </div>
  );
}

// "Sending to" bar at the top of the Outreach tab. Three states:
//  1. Recipient with email   → green-tinted card, name + email + status pill
//  2. Recipient, no email    → amber card, prominent LinkedIn button (a staff
//                              member reaches out on LinkedIn instead) + note
//                              that email touches can't fire without an email
//  3. No recipient at all    → red card prompting selection before approval
//                              (needs_contact held drafts land here)
function RecipientCard({
  recipient,
  recipientContactId,
  contacts,
  hasUnfired,
  changing,
  onChange,
  colors,
}: {
  recipient?: any;
  recipientContactId?: string;
  contacts: any[];
  hasUnfired: boolean;
  changing: boolean;
  onChange: (contactId: string) => void;
  colors: any;
}) {
  const noRecipient = !recipientContactId;
  const noEmail = !!recipient && !recipient.email;
  const accent = noRecipient
    ? colors.accent.red
    : noEmail
      ? colors.accent.yellow
      : colors.accent.green;
  const emailPill = recipient?.emailStatus
    ? emailStatusPill(recipient.emailStatus, colors)
    : null;

  return (
    <div
      style={{
        border: `1px solid ${accent}50`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
        background: `${accent}08`,
        padding: "12px 14px",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: colors.text.muted,
            }}
          >
            Sending to
          </div>
          {noRecipient ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: colors.accent.red }}>
              <AlertTriangle size={14} /> No recipient — select who this outreach goes to before approving
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: colors.text.primary }}>
                <User size={14} color={accent} />
                {recipient?.name ?? "Unknown contact"}
              </div>
              {recipient?.role && (
                <span style={{ fontSize: 11, color: colors.text.muted }}>{recipient.role}</span>
              )}
              {recipient?.email ? (
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "ui-monospace, monospace", fontSize: 12, color: colors.text.primary }}>
                  <Mail size={12} color={colors.accent.green} />
                  {recipient.email}
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#92400e", fontWeight: 500 }}>
                  <Mail size={12} /> No email on file
                </span>
              )}
              {emailPill && (
                <span
                  style={{
                    padding: "1px 6px",
                    background: emailPill.bg,
                    color: emailPill.fg,
                    border: `1px solid ${emailPill.border}`,
                    borderRadius: 2,
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 9,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  {recipient.emailStatus}
                </span>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {recipient?.linkedinUrl && noEmail && (
            <a
              href={recipient.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "#0a66c2",
                color: "#ffffff",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              <Linkedin size={12} /> Reach out on LinkedIn
            </a>
          )}
          {contacts.length > 0 && (
            <select
              value={recipientContactId ?? ""}
              disabled={changing || !hasUnfired}
              onChange={(e) => onChange(e.target.value)}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                borderRadius: 4,
                border: `1px solid ${colors.border.default}`,
                background: colors.bg.card,
                color: colors.text.primary,
                cursor: changing || !hasUnfired ? "default" : "pointer",
                maxWidth: 260,
              }}
            >
              {!recipientContactId && <option value="">Select recipient…</option>}
              {/* The current recipient may be a contact not (or no longer) linked
                  to this client — keep it selectable so the dropdown reflects truth. */}
              {recipientContactId && !recipient && (
                <option value={recipientContactId}>Unknown contact</option>
              )}
              {contacts.map((ct) => (
                <option key={ct._id} value={ct._id}>
                  {ct.name}
                  {ct.email ? ` — ${ct.email}` : " — no email"}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {noEmail && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#92400e", lineHeight: 1.5 }}>
          {recipient?.linkedinUrl
            ? "Email touches can't send without an address — use the LinkedIn profile above for manual outreach, or pick a contact with an email."
            : "Email touches can't send without an address, and no LinkedIn profile is on file. Try \"Find email via Apollo\" on the People tab."}
        </div>
      )}
      {!hasUnfired && !noRecipient && (
        <div style={{ marginTop: 8, fontSize: 10, color: colors.text.muted }}>
          All touches have fired — recipient can no longer be changed.
        </div>
      )}
      {changing && (
        <div style={{ marginTop: 8, fontSize: 10, color: colors.text.muted }}>
          Updating recipient on unfired touches…
        </div>
      )}
    </div>
  );
}

function emailStatusPill(status: string, colors: any): { bg: string; fg: string; border: string } {
  const s = status.toLowerCase();
  if (s === "verified") return { bg: "#dcfce7", fg: "#166534", border: "#86efac" };
  if (s === "unverified" || s === "guessed") return { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" };
  if (s === "questionable" || s === "spam_trap") return { bg: "#fee2e2", fg: "#7f1d1d", border: "#fca5a5" };
  return { bg: colors.bg.cardAlt, fg: colors.text.muted, border: colors.border.default };
}

function TouchCard({
  cadence,
  draft,
  dirty,
  isSaving,
  saved,
  colors,
  onChange,
  onSave,
  onRevert,
}: {
  cadence: any;
  draft: TouchDraft;
  dirty: boolean;
  isSaving: boolean;
  saved: boolean;
  colors: any;
  onChange: (d: TouchDraft) => void;
  onSave: () => void;
  onRevert: () => void;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const alreadyFired = !!cadence.lastFiredAt;
  const wasEdited = !!cadence.editedByOperator;

  return (
    <div
      style={{
        border: `1px solid ${dirty ? colors.accent.yellow : colors.border.default}`,
        borderLeft: `3px solid ${dirty ? colors.accent.yellow : alreadyFired ? colors.accent.green : colors.entityTypes.cadence}`,
        borderRadius: 4,
        marginBottom: 14,
        background: colors.bg.card,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${colors.border.default}`,
          background: colors.bg.light,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              color: colors.text.primary,
              fontWeight: 500,
            }}
          >
            Touch {cadence.packageOrder}
          </span>
          <span
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 10,
              color: colors.text.muted,
            }}
          >
            {alreadyFired
              ? `fired ${cadence.lastFiredAt?.slice(0, 16) ?? ""}`
              : `scheduled ${cadence.nextDueAt?.slice(0, 16) ?? "—"}`}
          </span>
          {alreadyFired && (
            <Pill colors={colors} bg={`${colors.accent.green}20`} fg={colors.accent.green} border={`${colors.accent.green}50`}>
              {cadence.lastResult === "approval_staged" ? "draft staged" : (cadence.lastResult ?? "—")}
            </Pill>
          )}
          {wasEdited && (
            <Pill colors={colors} bg={`${colors.accent.purple}15`} fg={colors.accent.purple} border={`${colors.accent.purple}40`}>
              edited
            </Pill>
          )}
          {dirty && (
            <Pill colors={colors} bg="#fef3c7" fg="#92400e" border="#fcd34d">
              unsaved
            </Pill>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setMode("edit")}
            style={tabStyle(mode === "edit", colors)}
            aria-label="Edit mode"
          >
            <Edit3 size={11} /> Edit
          </button>
          <button
            onClick={() => setMode("preview")}
            style={tabStyle(mode === "preview", colors)}
            aria-label="Preview mode"
          >
            <Eye size={11} /> Preview
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 14 }}>
        {mode === "edit" ? (
          <>
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 9,
                  color: colors.text.muted,
                  marginBottom: 4,
                  fontFamily: "ui-monospace, monospace",
                  textTransform: "uppercase" as const,
                }}
              >
                Subject
              </div>
              <input
                type="text"
                value={draft.subject}
                onChange={(e) => onChange({ ...draft, subject: e.target.value })}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  fontSize: 12,
                  color: colors.text.primary,
                  background: colors.bg.card,
                  boxSizing: "border-box" as const,
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 9,
                  color: colors.text.muted,
                  marginBottom: 4,
                  fontFamily: "ui-monospace, monospace",
                  textTransform: "uppercase" as const,
                }}
              >
                Body (plain text — paragraphs separated by blank lines)
              </div>
              <textarea
                value={draft.bodyText}
                onChange={(e) => onChange({ ...draft, bodyText: e.target.value })}
                rows={12}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  fontSize: 12,
                  color: colors.text.primary,
                  fontFamily: "system-ui, sans-serif",
                  background: colors.bg.card,
                  resize: "vertical" as const,
                  lineHeight: 1.6,
                  boxSizing: "border-box" as const,
                }}
              />
            </div>
          </>
        ) : (
          <PreviewPane draft={draft} colors={colors} />
        )}

        {/* Action row */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${colors.border.light}`,
            alignItems: "center",
          }}
        >
          {saved && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: colors.accent.green }}>
              <CheckCircle2 size={12} /> Saved
            </span>
          )}
          <button
            onClick={onRevert}
            disabled={!dirty || isSaving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              fontSize: 11,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 3,
              background: colors.bg.card,
              color: colors.text.secondary,
              cursor: dirty && !isSaving ? "pointer" : "not-allowed",
              opacity: dirty && !isSaving ? 1 : 0.45,
            }}
          >
            <RotateCcw size={11} /> Revert
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || isSaving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 14px",
              fontSize: 11,
              fontWeight: 500,
              border: "none",
              borderRadius: 3,
              background: dirty && !isSaving ? colors.accent.green : colors.bg.cardAlt,
              color: dirty && !isSaving ? "#ffffff" : colors.text.muted,
              cursor: dirty && !isSaving ? "pointer" : "not-allowed",
            }}
          >
            <Save size={11} /> {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewPane({ draft, colors }: { draft: TouchDraft; colors: any }) {
  return (
    <div
      style={{
        background: colors.bg.cardAlt,
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontSize: 11, color: colors.text.muted, marginBottom: 6, fontFamily: "ui-monospace, monospace", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
        Subject
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: colors.text.primary, marginBottom: 14 }}>
        {draft.subject || <em style={{ color: colors.text.dim }}>(no subject)</em>}
      </div>
      <div style={{ fontSize: 11, color: colors.text.muted, marginBottom: 6, fontFamily: "ui-monospace, monospace", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
        Body (rendered as it will send)
      </div>
      <div
        style={{
          fontSize: 13,
          color: colors.text.primary,
          lineHeight: 1.65,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {draft.bodyText.split(/\n{2,}/).map((para, i) => (
          <p key={i} style={{ margin: "0 0 12px 0", whiteSpace: "pre-wrap" as const }}>
            {para}
          </p>
        ))}
      </div>
    </div>
  );
}

function tabStyle(active: boolean, colors: any) {
  return {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 4,
    padding: "5px 10px",
    fontSize: 10,
    border: `1px solid ${active ? colors.entityTypes.cadence : colors.border.default}`,
    borderRadius: 3,
    background: active ? `${colors.entityTypes.cadence}15` : colors.bg.card,
    color: active ? colors.entityTypes.cadence : colors.text.muted,
    cursor: "pointer",
    fontWeight: active ? 500 : 400,
  };
}

function Pill({
  children,
  bg,
  fg,
  border,
}: {
  children: React.ReactNode;
  bg: string;
  fg: string;
  border: string;
  colors: any;
}) {
  return (
    <span
      style={{
        padding: "2px 6px",
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderRadius: 2,
        fontFamily: "ui-monospace, monospace",
        fontSize: 9,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}
