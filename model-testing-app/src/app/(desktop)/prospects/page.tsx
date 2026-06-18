"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { StageNavBar } from "@/components/prospects/dashboards/StageNavBar";
import { PipelineSummary } from "@/components/prospects/dashboards/PipelineSummary";
import { RepliesAwaitingTriageSection } from "@/components/prospects/sections/RepliesAwaitingTriageSection";
import { UpcomingMeetingsSection } from "@/components/prospects/sections/UpcomingMeetingsSection";
import { NewTab } from "@/components/prospects/tabs2/NewTab";
import { SourcingTab } from "@/components/prospects/tabs2/SourcingTab";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Prospecting landing → the pipeline SUMMARY. KPIs across the whole pipeline, a
// card per stage (linking into each stage dashboard), the cross-cutting morning
// triage (today's meetings + replies awaiting triage), and the pre-pipeline
// intake lanes (Sourcing candidate batches + unprocessed HubSpot companies).
export default function ProspectsPage() {
  const colors = useColors();

  // Sourcing intake count — un-triaged charge-sourced candidates not yet in the book.
  const sourcingNew = useQuery(api.sourcing.list as any, { state: "new", includeInBook: false }) ?? [];
  const sourcingCount = (sourcingNew as any[]).length;

  const sectionLabel = (text: string) => (
    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted, marginBottom: 10 }}>
      {text}
    </div>
  );

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

        {/* Pre-pipeline intake lanes. Sourcing (charge-sourced candidate batches)
            → New (unprocessed HubSpot companies) → become prospects in the
            pipeline above once researched. */}
        <div style={{ marginTop: 28 }}>
          {sectionLabel(`Sourcing · candidate batches${sourcingCount ? ` (${sourcingCount})` : ""}`)}
          <SourcingTab />
        </div>

        <div style={{ marginTop: 28 }}>
          {sectionLabel("New leads · unprocessed")}
          <NewTab />
        </div>
      </div>
    </>
  );
}
