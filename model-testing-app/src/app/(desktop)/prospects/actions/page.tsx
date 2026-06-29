"use client";

import { useColors } from "@/lib/useColors";
import { StageNavBar } from "@/components/prospects/dashboards/StageNavBar";
import { RequiresAttentionTable } from "@/components/prospects/dashboards/RequiresAttentionTable";

// Action required — the consolidated cross-stage queue. Everything that needs the
// operator, grouped by prospect. Cheap actions (approve / dismiss / move stage)
// fire in place; generative actions (draft reply, meeting prep, refresh intel,
// draft outreach) open a prompt to run in Claude Code (the harness), which does
// the work via MCP and stages the result for approval.
export default function ProspectActionsPage() {
  const colors = useColors();

  return (
    <>
      <div style={{ height: 2, background: colors.accent.orange ?? colors.entityTypes.prospect }} />
      <div style={{ padding: "16px 24px", background: colors.bg.cardAlt, minHeight: "100vh" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary, margin: 0 }}>Action required</h1>
          <p style={{ fontSize: 13, color: colors.text.muted, marginTop: 4 }}>
            Everything waiting on you, across every stage — act in place, or launch a prompt for Claude Code.
          </p>
        </div>

        <StageNavBar active="actions" />

        <RequiresAttentionTable />
      </div>
    </>
  );
}
