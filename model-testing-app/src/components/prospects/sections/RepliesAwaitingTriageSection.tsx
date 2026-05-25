"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatusSection } from "../StatusSection";
import { StatePill } from "../StatePill";
import { Mail } from "lucide-react";

// v1.3 — "Replies awaiting triage" section at the top of /prospects.
// The operator's morning queue: inbound replies the classifier didn't
// auto-route to a downstream skill (intent: unknown OR
// dispatchedTo === "operator_review"). Click a row → routes to that
// prospect's detail Replies tab.

const INTENT_DISPLAY: Record<string, string> = {
  book_meeting: "book meeting",
  defer_long_term: "defer long-term",
  not_interested: "not interested",
  info_question: "info question",
  out_of_office: "out of office",
  unknown: "unknown",
};

export function RepliesAwaitingTriageSection() {
  const colors = useColors();
  const router = useRouter();
  const rows = (useQuery(api.replyEvents.listUnrouted, { limit: 25 }) ?? []) as any[];

  return (
    <StatusSection
      title="Replies awaiting triage"
      count={`${rows.length} unrouted`}
      dotColor={colors.entityTypes.contact}
      defaultExpanded={rows.length > 0}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)} />
            <th style={thStyle(colors)}>Received</th>
            <th style={thStyle(colors)}>Subject</th>
            <th style={thStyle(colors)}>Intent</th>
            <th style={thStyle(colors)}>Evidence</th>
            <th style={thStyle(colors)}>Cancelled</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...tdStyle(colors), color: colors.text.muted, textAlign: "center", padding: "20px 14px" }}>
                <Mail size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                No replies in the operator-review queue. Either nothing has landed since the last triage, or the classifier auto-routed everything.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r._id}
              onClick={() => r.linkedClientId ? router.push(`/prospects/${r.linkedClientId}`) : undefined}
              style={{ cursor: r.linkedClientId ? "pointer" : "default", opacity: r.linkedClientId ? 1 : 0.6 }}
            >
              <td style={tdStyle(colors)}>
                <Mail size={12} color={colors.text.muted} />
              </td>
              <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, whiteSpace: "nowrap" as const }}>
                {r.receivedAt?.slice(0, 16) ?? "—"}
              </td>
              <td style={{ ...tdStyle(colors), maxWidth: 320 }}>
                <div style={{ color: colors.text.primary, fontWeight: 500 }}>{r.replySubject || "(no subject)"}</div>
                {r.replyBodyText && (
                  <div style={{ fontSize: 10, color: colors.text.dim, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 320 }}>
                    {r.replyBodyText.slice(0, 100)}…
                  </div>
                )}
              </td>
              <td style={tdStyle(colors)}>
                {r.classifiedIntent ? (
                  <StatePill state={INTENT_DISPLAY[r.classifiedIntent] ?? r.classifiedIntent} />
                ) : (
                  <span style={{ color: colors.text.muted, fontSize: 10 }}>—</span>
                )}
                {r.classifiedConfidence !== undefined && r.classifiedConfidence > 0 && (
                  <span style={{ fontSize: 9, color: colors.text.muted, marginLeft: 6, fontFamily: "ui-monospace, monospace" }}>
                    {Math.round(r.classifiedConfidence * 100)}%
                  </span>
                )}
              </td>
              <td style={{ ...tdStyle(colors), fontSize: 10, color: colors.text.secondary, fontStyle: "italic", maxWidth: 220 }}>
                {r.classifierEvidence ? (
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    "{r.classifierEvidence}"
                  </span>
                ) : (
                  <span style={{ color: colors.text.dim }}>—</span>
                )}
              </td>
              <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, textAlign: "center" as const }}>
                {r.cadencesCancelled?.length ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </StatusSection>
  );
}

function thStyle(colors: any) {
  return {
    textAlign: "left" as const,
    fontFamily: "ui-monospace, monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.text.muted,
    fontWeight: 400,
    padding: "8px 14px",
    borderBottom: `1px solid ${colors.border.default}`,
    background: colors.bg.cardAlt,
  };
}

function tdStyle(colors: any) {
  return {
    padding: "10px 14px",
    borderBottom: `1px solid ${colors.border.light}`,
    fontSize: 11,
    color: colors.text.primary,
    verticalAlign: "middle" as const,
  };
}
