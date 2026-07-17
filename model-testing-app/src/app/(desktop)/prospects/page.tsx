"use client";

import { useState } from "react";
import { useColors } from "@/lib/useColors";
import { StageNavBar } from "@/components/prospects/dashboards/StageNavBar";
import { PipelineSummary } from "@/components/prospects/dashboards/PipelineSummary";
import { RequiresAttentionTable } from "@/components/prospects/dashboards/RequiresAttentionTable";
import { RepliesAwaitingTriageSection } from "@/components/prospects/sections/RepliesAwaitingTriageSection";
import { UpcomingMeetingsSection } from "@/components/prospects/sections/UpcomingMeetingsSection";
import ProspectingInboxDrawer from "@/components/prospects/ProspectingInboxDrawer";
import { Mail } from "lucide-react";

// Prospecting landing → the pipeline SUMMARY. KPIs across the whole pipeline, a
// card per stage (linking into each stage dashboard), and the cross-cutting
// morning triage (today's meetings + replies awaiting triage). The pre-pipeline
// intake lanes (charge-sourced batches + unprocessed HubSpot companies) live on
// their own first-rung tab now — see /prospects/sourcing.
export default function ProspectsPage() {
  const colors = useColors();
  const [inboxOpen, setInboxOpen] = useState(false);

  return (
    <>
      <div style={{ height: 2, background: colors.entityTypes.prospect }} />
      <div style={{ padding: "16px 24px", background: colors.bg.cardAlt, minHeight: "100vh" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary, margin: 0 }}>Prospecting</h1>
            <p style={{ fontSize: 13, color: colors.text.muted, marginTop: 4 }}>
              Stage-by-stage pipeline — open a stage to see what needs action and how it&apos;s performing.
            </p>
          </div>
          {/* Prospects Inbox — the org-wide both-direction mail feed, in a
              near-full-screen drawer. Top-right by design: always reachable
              from the prospecting summary. */}
          <button
            onClick={() => setInboxOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              color: colors.text.primary,
              background: colors.bg.base,
              border: `1px solid ${colors.border.default}`,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Mail size={14} style={{ color: colors.entityTypes.prospect }} />
            Prospects Inbox
          </button>
        </div>

        <StageNavBar active="summary" />

        <PipelineSummary />

        {/* "What needs me now" — the unified cross-stage action surface, first
            thing under the KPI strip. Every row is actionable in place. */}
        <RequiresAttentionTable />

        {/* Cross-cutting morning triage — not pipeline rungs, so they sit on the
            summary. Both auto-expand when rows are present. The unified table
            above is the canonical home for drafted/needs-action replies; these
            sections stay as the time-ordered "upcoming / unlinked" companions. */}
        <div style={{ marginTop: 28 }}>
          <UpcomingMeetingsSection />
          <RepliesAwaitingTriageSection />
        </div>
      </div>

      {inboxOpen && <ProspectingInboxDrawer onClose={() => setInboxOpen(false)} />}
    </>
  );
}
