"use client";

import { useColors } from "@/lib/useColors";
import { StageNavBar } from "@/components/prospects/dashboards/StageNavBar";
import { PipelineSummary } from "@/components/prospects/dashboards/PipelineSummary";
import { RepliesAwaitingTriageSection } from "@/components/prospects/sections/RepliesAwaitingTriageSection";
import { UpcomingMeetingsSection } from "@/components/prospects/sections/UpcomingMeetingsSection";
import { NewTab } from "@/components/prospects/tabs2/NewTab";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Prospecting landing → the pipeline SUMMARY. KPIs across the whole pipeline, a
// card per stage (linking into each stage dashboard), the cross-cutting morning
// triage (today's meetings + replies awaiting triage), and the New-leads intake.
export default function ProspectsPage() {
  const colors = useColors();

  return (
    <>
      <div style={{ height: 2, background: colors.entityTypes.prospect }} />
      <div style={{ padding: "16px 24px", background: colors.bg.cardAlt, minHeight: "100vh" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary, margin: 0 }}>Prospecting</h1>
          <p style={{ fontSize: 13, color: colors.text.muted, marginTop: 4 }}>
            Stage-by-stage pipeline — open a stage to see what needs action and how it&apos;s performing.
          </p>
        </div>

        <StageNavBar active="summary" />

        <PipelineSummary />

        {/* Cross-cutting morning triage — not pipeline rungs, so they sit on the
            summary above the intake. Both auto-expand when rows are present. */}
        <div style={{ marginTop: 28 }}>
          <UpcomingMeetingsSection />
          <RepliesAwaitingTriageSection />
        </div>

        {/* Pre-pipeline intake — unprocessed HubSpot companies awaiting research. */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted, marginBottom: 10 }}>
            New leads · unprocessed
          </div>
          <NewTab />
        </div>
      </div>
    </>
  );
}
