"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatusSection } from "../StatusSection";

// Researched prospects that have not yet entered the outreach state machine.
//
// prospect-intel persists its findings (and, via clients.setProspectFacts, the
// Companies House number + lead director) but does NOT set prospectState — that
// transition happens when the cadence package is staged/approved. If outreach is
// blocked (e.g. no contact email, Apollo unconfigured), the prospect completes
// intel with no prospectState and falls through every state-keyed board section,
// becoming invisible. This section is the safety net: status="prospect", no
// prospectState, but with intel facts persisted (CH number or lead director).
//
// Proxy note: we key off companiesHouseNumber / primaryDirectorName (set only by
// prospect-intel step 10) rather than the skillRuns row, so this stays a pure
// client-side read of the already-loaded clients.list — no extra query. A run
// where CH resolution failed AND no director was found would be missed; a
// skillRuns-backed query would close that edge case.
export function ResearchedSection() {
  const colors = useColors();
  const router = useRouter();
  const allClients = useQuery(api.clients.list as any, {}) ?? [];

  const rows = (allClients as any[]).filter(
    (c) =>
      c.status === "prospect" &&
      !c.prospectState &&
      (c.companiesHouseNumber || c.primaryDirectorName),
  );
  const count = rows.length;

  return (
    <StatusSection
      title="Researched"
      count={`${count} awaiting outreach`}
      dotColor={colors.entityTypes.prospect}
      defaultExpanded={count > 0}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)}>Company</th>
            <th style={thStyle(colors)}>Companies House</th>
            <th style={thStyle(colors)}>Lead director</th>
            <th style={thStyle(colors)}>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c: any) => (
            <tr
              key={c._id}
              onClick={() => router.push(`/prospects/${c._id}`)}
              style={{ cursor: "pointer" }}
            >
              <td style={tdStyle(colors)}>
                <div style={{ color: colors.text.primary, fontWeight: 500 }}>
                  {c.name ?? c.companyName ?? "—"}
                </div>
                <div style={{ fontSize: 10, color: colors.text.dim, marginTop: 2 }}>
                  {c.city ?? ""}
                  {c.industry ? ` · ${c.industry}` : ""}
                </div>
              </td>
              <td
                style={{
                  ...tdStyle(colors),
                  fontFamily: "ui-monospace, monospace",
                  color: colors.text.muted,
                }}
              >
                {c.companiesHouseNumber ?? "—"}
              </td>
              <td style={tdStyle(colors)}>{c.primaryDirectorName ?? "—"}</td>
              <td style={tdStyle(colors)}>{c.source ?? "—"}</td>
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
