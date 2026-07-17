"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { StageNavBar } from "@/components/prospects/dashboards/StageNavBar";
import { SourcingTab } from "@/components/prospects/tabs2/SourcingTab";
import { NewTab } from "@/components/prospects/tabs2/NewTab";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Sourcing — the pre-pipeline intake lane, the first rung before Cold. Two
// tables of candidates not yet in the pipeline: charge-sourced batches (select
// → promote a keeper into Cold) and unprocessed HubSpot companies. Promoting a
// candidate files it into the Cold outreach stage as a prospect.
export default function SourcingPage() {
  const colors = useColors();
  const sourcingNew =
    (useQuery(api.sourcing.list as any, { state: "new", includeInBook: false }) as any[] | undefined) ?? [];
  const sourcingCount = sourcingNew.length;

  const sectionLabel = (text: string) => (
    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted, marginBottom: 10 }}>
      {text}
    </div>
  );

  return (
    <>
      <div style={{ height: 2, background: colors.accent.teal ?? colors.entityTypes.prospect }} />
      <div style={{ padding: "16px 24px", background: colors.bg.cardAlt, minHeight: "100vh" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary, margin: 0 }}>Sourcing</h1>
          <p style={{ fontSize: 13, color: colors.text.muted, marginTop: 4 }}>
            Candidate intake before the pipeline — review the batches, then select and promote keepers into Cold outreach.
          </p>
        </div>

        <StageNavBar active="sourcing" />

        <div style={{ marginBottom: 28 }}>
          {sectionLabel(`Sourcing · charge-sourced candidate batches${sourcingCount ? ` (${sourcingCount} new)` : ""}`)}
          <SourcingTab />
        </div>

        <div>
          {sectionLabel("New leads · unprocessed HubSpot companies")}
          <NewTab />
        </div>
      </div>
    </>
  );
}
