"use client";

import { useColors } from "@/lib/useColors";

interface OverviewTabProps {
  prospect: any;
  intelRun?: any;
  cadences: any[];
  onJumpToOutreach: () => void;
}

export function OverviewTab({ prospect, intelRun, cadences, onJumpToOutreach }: OverviewTabProps) {
  const colors = useColors();
  const state = prospect?.prospectState ?? "drafted";

  return (
    <div>
      {state === "drafted" && (
        <div style={{
          background: "#fef3c7", borderLeft: `3px solid ${colors.accent.yellow}`,
          padding: "10px 14px", borderRadius: "0 4px 4px 0",
          fontSize: 11, color: "#78350f", marginBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div><strong>Package awaiting approval.</strong> Review intel + {cadences.length} emails. Click Approve below to release the schedule.</div>
          <a onClick={onJumpToOutreach} style={{ color: "#78350f", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Jump to outreach →</a>
        </div>
      )}

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

      <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, marginBottom: 16, background: colors.bg.card }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light, fontFamily: "ui-monospace, monospace", fontSize: 11, textTransform: "uppercase" as const, color: colors.text.primary, fontWeight: 500, display: "flex", justifyContent: "space-between" }}>
          <span>Outreach Package ({cadences.length} touches)</span>
          <a onClick={onJumpToOutreach} style={{ color: colors.accent.blue, fontSize: 10, cursor: "pointer" }}>Edit all →</a>
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
