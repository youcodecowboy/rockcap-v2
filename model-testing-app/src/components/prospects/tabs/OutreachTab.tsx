"use client";

import { useColors } from "@/lib/useColors";

export function OutreachTab({ cadences }: { cadences: any[] }) {
  const colors = useColors();
  const sorted = [...cadences].sort((a, b) => (a.packageOrder ?? 0) - (b.packageOrder ?? 0));
  return (
    <div>
      <div style={{ marginBottom: 14, padding: "10px 14px", border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, fontSize: 11, color: colors.text.muted }}>
        Cadence aggressiveness picker (Light / Moderate / Aggressive / Custom) lands in v1.2.1.
      </div>
      {sorted.map((c) => (
        <div key={c._id} style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, marginBottom: 14, background: colors.bg.card }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: colors.text.primary, fontWeight: 500 }}>
              Touch {c.packageOrder} · {c.nextDueAt?.slice(0, 10) ?? "—"}
            </div>
            <span style={{ fontSize: 10, color: colors.text.muted }}>{c.lastResult ?? "queued"}</span>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: colors.text.muted, marginBottom: 4, fontFamily: "ui-monospace, monospace", textTransform: "uppercase" as const }}>Subject</div>
              <input type="text" defaultValue={c.preDraftedTouch?.subject ?? ""} disabled style={{ width: "100%", padding: "6px 10px", border: `1px solid ${colors.border.default}`, borderRadius: 4, fontSize: 12, color: colors.text.primary, background: colors.bg.cardAlt, boxSizing: "border-box" as const }} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: colors.text.muted, marginBottom: 4, fontFamily: "ui-monospace, monospace", textTransform: "uppercase" as const }}>Body</div>
              <textarea defaultValue={c.preDraftedTouch?.bodyText ?? ""} disabled rows={8} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${colors.border.default}`, borderRadius: 4, fontSize: 11, color: colors.text.primary, fontFamily: "system-ui, sans-serif", background: colors.bg.cardAlt, resize: "vertical" as const, boxSizing: "border-box" as const }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: colors.text.muted }}>
              Inline edit + save (via cadence.update mutation) lands in v1.2.1.
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
