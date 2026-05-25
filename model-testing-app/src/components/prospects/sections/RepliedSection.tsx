"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatusSection } from "../StatusSection";

export function RepliedSection() {
  const colors = useColors();
  const router = useRouter();
  const rows = useQuery(api.prospects.listByState as any, { state: "replied" }) ?? [];

  return (
    <StatusSection
      title="Replied"
      count={`${rows.length} awaiting response`}
      dotColor={colors.status.replied}
      defaultExpanded={true}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)} />
            <th style={thStyle(colors)}>Company</th>
            <th style={thStyle(colors)}>Intent</th>
            <th style={thStyle(colors)}>Evidence</th>
            <th style={thStyle(colors)}>Drafted reply</th>
            <th style={thStyle(colors)}>Received at</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r._id} onClick={() => router.push(`/prospects/${r._id}`)} style={{ cursor: "pointer" }}>
              <td style={tdStyle(colors)}>
                <input
                  type="checkbox"
                  onClick={(e) => e.stopPropagation()}
                  style={{ accentColor: colors.entityTypes.prospect }}
                />
              </td>
              <td style={tdStyle(colors)}>
                <div style={{ fontWeight: 500, color: colors.text.primary }}>{r.name}</div>
                {r.companyName && r.companyName !== r.name && (
                  <div style={{ fontSize: 10, color: colors.text.dim, marginTop: 2 }}>{r.companyName}</div>
                )}
              </td>
              <td style={{ ...tdStyle(colors), color: colors.text.muted }}>—</td>
              <td style={{ ...tdStyle(colors), color: colors.text.muted }}>—</td>
              <td style={{ ...tdStyle(colors), color: colors.text.muted }}>—</td>
              <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", color: colors.text.muted }}>
                {r.prospectStateChangedAt?.slice(0, 16) ?? "—"}
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
