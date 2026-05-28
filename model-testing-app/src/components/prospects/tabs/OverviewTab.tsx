"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { TrendingUp, AlertCircle, Plus, Mail, CheckCircle2, ExternalLink, UserPlus } from "lucide-react";
import { computeProspectFlags } from "@/lib/prospects/flags";
import { FlagChip } from "../FlagChip";

interface OverviewTabProps {
  prospect: any;
  intelRun?: any;
  cadences: any[];
  onJumpToOutreach: () => void;
  onJumpToIntel?: () => void;
}

// Parse the Recommended Approach section (#7) into structured fields for
// the prominent Recommendation card. The template (intel-report-template.md)
// uses fixed labels under section 7: "Classification:", "Estimated deal size",
// "Best initial angle:", "Touch 1 anchor:", "Risk flags:".
interface ParsedRecommendation {
  classification?: string;
  classificationReasoning?: string;
  dealSize?: string;
  angle?: string;
  touch1Anchor?: string;
  riskFlags?: string[];
}

function parseRecommendation(intelMarkdown?: string): ParsedRecommendation | null {
  if (!intelMarkdown) return null;
  const sec7 = intelMarkdown.match(/##\s*7\.\s*Recommend(ed|ation)[\s\S]*?(?=##\s*\d|$)/i);
  if (!sec7) return null;
  const body = sec7[0];

  const findBullet = (label: string): string | undefined => {
    // Match "- **Label:** value" until next bullet or section
    const re = new RegExp(
      `^-\\s+\\*\\*${label}[:.]\\*\\*\\s+([\\s\\S]*?)(?=^-\\s+\\*\\*|^##\\s+|$)`,
      "im",
    );
    const m = body.match(re);
    return m?.[1]?.trim().replace(/\n+/g, " ").replace(/\s+/g, " ");
  };

  // Classification is its own bullet; reasoning is the sub-bullet directly under it
  const classRaw = findBullet("Classification");
  let classification: string | undefined;
  let classificationReasoning: string | undefined;
  if (classRaw) {
    // The classification value might be wrapped in ** **; reasoning typically begins after
    const reasoningMatch = classRaw.match(/Reasoning:\s*(.+?)(?=\s*-\s|$)/i);
    classificationReasoning = reasoningMatch?.[1]?.trim();
    // Just the first line of classRaw is the classification itself
    classification = classRaw.split(/-\s+Reasoning/i)[0]?.trim().replace(/\*\*/g, "");
  }

  const dealSize = findBullet("Estimated deal size( \\+ timing)?");
  const angle = findBullet("Best initial angle");
  const touch1Anchor = findBullet("Touch 1 anchor");
  const riskFlagsRaw = findBullet("Risk flags");
  const riskFlags = riskFlagsRaw
    ? riskFlagsRaw
        .split(/\s*-\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  if (!classification && !dealSize && !angle && !touch1Anchor) return null;
  return { classification, classificationReasoning, dealSize, angle, touch1Anchor, riskFlags };
}

function classificationColor(text: string | undefined, colors: any): string {
  if (!text) return colors.text.muted;
  const t = text.toLowerCase();
  if (t.includes("bridging") && t.includes("term")) return colors.accent.cyan;
  if (t.includes("bridging")) return colors.accent.orange;
  if (t.includes("development")) return colors.accent.indigo;
  if (t.includes("term")) return colors.accent.green;
  if (t.includes("unclassif")) return colors.text.muted;
  return colors.accent.blue;
}

export function OverviewTab({ prospect, intelRun, cadences, onJumpToOutreach, onJumpToIntel }: OverviewTabProps) {
  const colors = useColors();
  const state = prospect?.prospectState ?? "drafted";
  const rec = parseRecommendation(intelRun?.intelMarkdown);
  const hasIntel = !!intelRun?.intelMarkdown;
  const cadencesEmpty = cadences.length === 0;

  // Findings/flags banner. computeProspectFlags merges the contact-presence
  // warn with the intel run's gaps (as info). Only `all_clear` → green "All
  // found"; otherwise amber, listing each warn/info chip.
  const flags = computeProspectFlags(prospect ?? {}, intelRun ?? null);
  const allClear = flags.length === 1 && flags[0].key === "all_clear";
  const hasNoContact = flags.some((f) => f.key === "no_contact");

  // v1.3 Sprint B — pending approvals for this client. Surfaces drafts
  // staged by qualify-and-draft, meeting-prep-respond, lender-outreach,
  // and any other client_communication / gmail_send / lender_outreach
  // approval type. Operator can click through to /approvals to review.
  const pendingApprovals = useQuery(
    api.approvals.listPendingByClient,
    prospect ? { clientId: prospect._id, limit: 10 } : "skip",
  ) ?? [];

  return (
    <div>
      {/* Findings / flags banner — TOP of the overview. Green when everything
          intel needed was found; amber when items need attention (e.g. no
          contact email to send to, or intel gaps surfaced during the run). */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          borderRadius: 4,
          marginBottom: 18,
          background: allClear ? `${colors.accent.green}12` : `${colors.accent.orange}12`,
          border: `1px solid ${allClear ? colors.accent.green : colors.accent.orange}40`,
          borderLeft: `3px solid ${allClear ? colors.accent.green : colors.accent.orange}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: allClear ? 0 : 8 }}>
            {allClear ? (
              <CheckCircle2 size={14} color={colors.accent.green} />
            ) : (
              <AlertCircle size={14} color={colors.accent.orange} />
            )}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: allClear ? colors.accent.green : colors.accent.orange,
              }}
            >
              {allClear
                ? "All found"
                : `${flags.length} item${flags.length === 1 ? "" : "s"} need attention`}
            </span>
          </div>
          {!allClear && (
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
              {flags.map((f, i) => (
                <FlagChip key={`${f.key}-${i}`} label={f.label} severity={f.severity} colors={colors} />
              ))}
            </div>
          )}
        </div>
        {hasNoContact && (
          // TODO: wire to an add-contact flow once a prospect add-contact UI
          // exists (no add-contact UI in this phase). The button + chip must
          // render now; the action is a no-op placeholder until then.
          <button
            onClick={() => {
              // TODO: open add-contact form when available.
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 500,
              color: "#fff",
              background: colors.accent.orange,
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              whiteSpace: "nowrap" as const,
            }}
          >
            <UserPlus size={12} />
            Add contact
          </button>
        )}
      </div>

      {/* Recommendation card — TOP PRIORITY card. Surfaces classification +
          deal sizing + Touch 1 anchor from intel section 7 so the operator
          sees the answer first, then can dig into evidence. */}
      {rec && (
        <div
          style={{
            border: `1px solid ${colors.border.default}`,
            borderTop: `3px solid ${classificationColor(rec.classification, colors)}`,
            borderRadius: 4,
            background: colors.bg.card,
            marginBottom: 18,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              background: colors.bg.light,
              borderBottom: `1px solid ${colors.border.default}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={14} color={classificationColor(rec.classification, colors)} />
              <span
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: colors.text.primary,
                  fontWeight: 500,
                }}
              >
                Recommendation
              </span>
            </div>
            {onJumpToIntel && (
              <a
                onClick={onJumpToIntel}
                style={{ color: colors.accent.blue, fontSize: 10, cursor: "pointer", textDecoration: "none" }}
              >
                See full reasoning →
              </a>
            )}
          </div>
          <div style={{ padding: 16 }}>
            {rec.classification && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 9,
                    color: colors.text.muted,
                    fontFamily: "ui-monospace, monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  Classification
                </div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 500,
                    color: classificationColor(rec.classification, colors),
                    lineHeight: 1.3,
                  }}
                >
                  {rec.classification}
                </div>
                {rec.classificationReasoning && (
                  <div style={{ fontSize: 11, color: colors.text.secondary, marginTop: 4, lineHeight: 1.5 }}>
                    {rec.classificationReasoning}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: rec.touch1Anchor ? 12 : 0 }}>
              {rec.dealSize && (
                <CardField label="Deal size + timing" value={rec.dealSize} colors={colors} />
              )}
              {rec.angle && (
                <CardField label="Best initial angle" value={rec.angle} colors={colors} />
              )}
            </div>

            {rec.touch1Anchor && (
              <div
                style={{
                  background: colors.bg.cardAlt,
                  borderLeft: `3px solid ${colors.accent.purple}`,
                  padding: "10px 14px",
                  borderRadius: "0 3px 3px 0",
                  marginTop: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: colors.text.muted,
                    fontFamily: "ui-monospace, monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  Touch 1 anchor
                </div>
                <div style={{ fontSize: 12, color: colors.text.primary, fontStyle: "italic", lineHeight: 1.5 }}>
                  {rec.touch1Anchor}
                </div>
              </div>
            )}

            {rec.riskFlags && rec.riskFlags.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.border.light}` }}>
                <div
                  style={{
                    fontSize: 9,
                    color: colors.text.muted,
                    fontFamily: "ui-monospace, monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <AlertCircle size={11} color={colors.accent.yellow} />
                  Risk flags
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: colors.text.secondary }}>
                  {rec.riskFlags.slice(0, 5).map((rf, i) => (
                    <li key={i} style={{ marginBottom: 3, lineHeight: 1.4 }}>{rf}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* State-driven callouts */}
      {state === "drafted" && cadences.length > 0 && (
        <div
          style={{
            background: "#fef3c7",
            borderLeft: `3px solid ${colors.accent.yellow}`,
            padding: "10px 14px",
            borderRadius: "0 4px 4px 0",
            fontSize: 11,
            color: "#78350f",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <strong>Package awaiting approval.</strong> Review intel + {cadences.length} emails. Click Approve below to release the schedule.
          </div>
          <a onClick={onJumpToOutreach} style={{ color: "#78350f", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
            Jump to outreach →
          </a>
        </div>
      )}

      {/* v1.3 Sprint B — Pending Approvals card. Surfaces drafts staged by
          qualify-and-draft, meeting-prep-respond, etc. Shown above the
          cadence-nudge so it's the first action item the operator sees. */}
      {pendingApprovals.length > 0 && (
        <div
          style={{
            border: `1px solid ${colors.border.default}`,
            borderTop: `3px solid ${colors.accent.green}`,
            borderRadius: 4,
            background: colors.bg.card,
            marginBottom: 18,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              background: colors.bg.light,
              borderBottom: `1px solid ${colors.border.default}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={14} color={colors.accent.green} />
              <span
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: colors.text.primary,
                  fontWeight: 500,
                }}
              >
                Pending operator review · {pendingApprovals.length}
              </span>
            </div>
            <a
              href="/approvals"
              style={{ color: colors.accent.blue, fontSize: 10, textDecoration: "none" }}
            >
              Open /approvals →
            </a>
          </div>
          <div>
            {pendingApprovals.map((a: any, i: number) => (
              <a
                key={a._id}
                href={`/approvals/${a._id}`}
                style={{
                  display: "block",
                  padding: "10px 16px",
                  borderTop: i === 0 ? "none" : `1px solid ${colors.border.light}`,
                  textDecoration: "none",
                  color: colors.text.primary,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Mail size={12} color={colors.text.muted} />
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: "ui-monospace, monospace",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: colors.text.muted,
                        }}
                      >
                        {a.entityType.replace(/_/g, " ")}
                      </span>
                      {a.requestSourceName && (
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: "ui-monospace, monospace",
                            color: colors.accent.purple,
                            background: `${colors.accent.purple}15`,
                            padding: "1px 6px",
                            borderRadius: 2,
                            border: `1px solid ${colors.accent.purple}40`,
                          }}
                        >
                          via {a.requestSourceName}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: colors.text.primary, fontWeight: 500 }}>
                      {a.summary}
                    </div>
                    {a.draftPayload?.subject && (
                      <div
                        style={{
                          fontSize: 11,
                          color: colors.text.secondary,
                          marginTop: 4,
                          fontStyle: "italic",
                        }}
                      >
                        Subject: {a.draftPayload.subject}
                      </div>
                    )}
                    {a.draftPayload?.reasoning && (
                      <div
                        style={{
                          fontSize: 11,
                          color: colors.text.muted,
                          marginTop: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        {a.draftPayload.reasoning}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: colors.text.muted, fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" as const }}>
                    {a.requestedAt?.slice(0, 16)}
                    <ExternalLink size={10} />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Cadence-creation nudge — when prospect has intel but no cadences yet */}
      {hasIntel && cadencesEmpty && (
        <div
          style={{
            background: `${colors.accent.blue}10`,
            border: `1px solid ${colors.accent.blue}40`,
            borderRadius: 4,
            padding: "12px 14px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 11, color: colors.text.primary, lineHeight: 1.5 }}>
            <Plus size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4, color: colors.accent.blue }} />
            <strong>Intel ready; no cadence package yet.</strong> Run the prospect-intel skill's step 11
            in Claude Code to compose 4 touches per the cadence-package spec — or create touches manually.
          </div>
        </div>
      )}

      {/* Intel summary panel */}
      {intelRun?.brief && (
        <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, marginBottom: 16, background: colors.bg.card }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light, fontFamily: "ui-monospace, monospace", fontSize: 11, textTransform: "uppercase" as const, color: colors.text.primary, fontWeight: 500 }}>
            Intel Summary
          </div>
          <div style={{ padding: 16, fontSize: 11, color: colors.text.primary, lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>
            {intelRun.brief}
          </div>
        </div>
      )}

      {/* Outreach package preview */}
      <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, marginBottom: 16, background: colors.bg.card }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light, fontFamily: "ui-monospace, monospace", fontSize: 11, textTransform: "uppercase" as const, color: colors.text.primary, fontWeight: 500, display: "flex", justifyContent: "space-between" }}>
          <span>Outreach Package ({cadences.length} touches)</span>
          {cadences.length > 0 && (
            <a onClick={onJumpToOutreach} style={{ color: colors.accent.blue, fontSize: 10, cursor: "pointer" }}>
              Edit all →
            </a>
          )}
        </div>
        <div>
          {cadences.length === 0 && (
            <div style={{ padding: 16, color: colors.text.muted, fontSize: 11 }}>No cadences queued yet.</div>
          )}
          {[...cadences].sort((a, b) => (a.packageOrder ?? 0) - (b.packageOrder ?? 0)).map((c, i) => (
            <div key={c._id} style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${colors.border.light}` }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                {c.preDraftedTouch?.subject ?? "(no subject)"}
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, marginLeft: 8 }}>
                  · Touch {c.packageOrder} · {c.nextDueAt?.slice(0, 10) ?? "—"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: colors.text.secondary, marginTop: 4, lineHeight: 1.5 }}>
                {(c.preDraftedTouch?.bodyText ?? "(no body)").slice(0, 200)}…
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CardField({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: colors.text.muted,
          fontFamily: "ui-monospace, monospace",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: colors.text.primary, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}
