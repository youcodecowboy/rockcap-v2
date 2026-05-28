"use client";

import { useColors } from "@/lib/useColors";

export type ChronologyCharge = {
  chargeId?: string;
  _id?: string;
  chargeDate?: string;
  chargeeName?: string;
  chargeStatus?: string;
  chargeDescription?: string;
};

function chargeStatusPill(status: string | undefined, colors: any) {
  if (!status) return null;
  const s = status.toLowerCase();
  let bg: string, fg: string;
  if (s === "outstanding") {
    bg = "#fef3c7";
    fg = "#92400e";
  } else if (s.startsWith("fully-satisfied") || s === "satisfied") {
    bg = "#dcfce7";
    fg = "#166534";
  } else if (s === "part-satisfied") {
    bg = "#dbeafe";
    fg = "#1e40af";
  } else {
    bg = colors.bg.cardAlt;
    fg = colors.text.muted;
  }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: 2,
        background: bg,
        color: fg,
        fontFamily: "ui-monospace, monospace",
        fontSize: 9,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {status}
    </span>
  );
}

export function ChargeChronologyTable({ charges }: { charges: ChronologyCharge[] }) {
  const colors = useColors();

  // Sort newest-first so callers can pass unsorted arrays
  const sorted = [...charges].sort((a, b) =>
    (b.chargeDate ?? "").localeCompare(a.chargeDate ?? ""),
  );

  return (
    <div style={{ overflowX: "auto", border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: colors.bg.cardAlt }}>
            {["Date", "Lender / chargee", "Status", "Description (excerpt)"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  borderBottom: `1px solid ${colors.border.default}`,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 9,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: colors.text.muted,
                  fontWeight: 500,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c._id ?? c.chargeId ?? `${c.chargeDate}-${c.chargeeName}`}>
              <td
                style={{
                  padding: "8px 12px",
                  borderBottom: `1px solid ${colors.border.light}`,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 10,
                  color: colors.text.muted,
                  verticalAlign: "top",
                  whiteSpace: "nowrap",
                }}
              >
                {c.chargeDate ?? "—"}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  borderBottom: `1px solid ${colors.border.light}`,
                  color: colors.text.primary,
                  verticalAlign: "top",
                  maxWidth: 280,
                }}
              >
                {c.chargeeName ?? "(unnamed)"}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  borderBottom: `1px solid ${colors.border.light}`,
                  verticalAlign: "top",
                  whiteSpace: "nowrap",
                }}
              >
                {chargeStatusPill(c.chargeStatus, colors)}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  borderBottom: `1px solid ${colors.border.light}`,
                  color: colors.text.secondary,
                  verticalAlign: "top",
                  fontSize: 10,
                  lineHeight: 1.5,
                }}
              >
                {(c.chargeDescription ?? "").slice(0, 200)}
                {(c.chargeDescription ?? "").length > 200 && "…"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
