"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatePill } from "../StatePill";

// "New" tab — unprocessed companies synced from HubSpot that have not yet
// been researched into a prospect. In the old board UI this lived inside a
// StatusSection collapsible; it's now a top-level tab, not a section in a stack.
export function NewTab() {
  const colors = useColors();
  const router = useRouter();
  const candidates = useQuery(api.companies.listUnprocessed as any, {
    limit: 25,
    sinceDays: 30,
    states: ["new", "running", "stuck"],
    excludePromoted: true,
  });

  const rows = candidates ?? [];

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        background: colors.bg.card,
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)} />
            <th style={thStyle(colors)}>Company</th>
            <th style={thStyle(colors)}>HubSpot ID</th>
            <th style={thStyle(colors)}>Industry</th>
            <th style={thStyle(colors)}>Lifecycle</th>
            <th style={thStyle(colors)}>State</th>
            <th style={thStyle(colors)}>Synced</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...tdStyle(colors), color: colors.text.muted, textAlign: "center" }}>
                No new companies from HubSpot.
              </td>
            </tr>
          )}
          {rows.map((c: any) => (
            <tr
              key={c.company._id}
              onClick={() => c.state === "running" ? undefined : router.push(`/prospects/${c.company._id}`)}
              style={{
                cursor: c.state === "running" ? "not-allowed" : "pointer",
                opacity: c.state === "running" ? 0.5 : 1,
              }}
            >
              <td style={tdStyle(colors)}>
                <input
                  type="checkbox"
                  disabled={c.state === "running"}
                  style={{ accentColor: colors.entityTypes.prospect }}
                  onClick={(e) => e.stopPropagation()}
                />
              </td>
              <td style={tdStyle(colors)}>
                <div style={{ color: colors.text.primary, fontWeight: 500 }}>{c.company.name}</div>
                <div style={{ fontSize: 10, color: colors.text.dim, marginTop: 2 }}>
                  {c.company.city ?? ""}{c.company.industry ? ` · ${c.company.industry}` : ""}
                </div>
              </td>
              <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", color: colors.text.muted }}>
                {c.company.hubspotCompanyId}
              </td>
              <td style={tdStyle(colors)}>{c.company.industry ?? "—"}</td>
              <td style={tdStyle(colors)}>{c.company.hubspotLifecycleStage ?? "—"}</td>
              <td style={tdStyle(colors)}>
                <StatePill state={c.state} />
                {c.state === "running" && (
                  <span style={{ marginLeft: 6, color: colors.text.muted, fontSize: 10 }}>
                    · {c.runAgeMinutes}m ago
                  </span>
                )}
              </td>
              <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", color: colors.text.muted }}>
                {c.company.createdAt?.slice(0, 10) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
