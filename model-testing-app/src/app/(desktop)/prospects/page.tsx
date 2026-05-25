"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { ProspectsHomeHeader } from "@/components/prospects/ProspectsHomeHeader";
import { CandidatesSection } from "@/components/prospects/sections/CandidatesSection";
import { NeedsReviewSection } from "@/components/prospects/sections/NeedsReviewSection";
import { NeedsRevisionSection } from "@/components/prospects/sections/NeedsRevisionSection";
import { ActiveSection } from "@/components/prospects/sections/ActiveSection";
import { RepliedSection } from "@/components/prospects/sections/RepliedSection";
import { RepliesAwaitingTriageSection } from "@/components/prospects/sections/RepliesAwaitingTriageSection";
import { SimpleSection } from "@/components/prospects/sections/SimpleSection";

export default function ProspectsPage() {
  const colors = useColors();
  const [searchQuery, setSearchQuery] = useState("");

  // Counts for the header (each is a small query)
  const draftedCount = useQuery(api.prospects.countByState as any, { state: "drafted" }) ?? 0;
  const allClients = useQuery(api.clients.list as any, {}) ?? [];
  const allCount = (allClients as any[]).filter((c: any) => c.prospectState).length;

  return (
    <>
      {/* TopAccent strip — amber for prospect entity */}
      <div style={{ height: 2, background: colors.entityTypes.prospect }} />
      <div style={{ padding: "16px 24px", background: colors.bg.cardAlt, minHeight: "100vh" }}>
        <ProspectsHomeHeader
          totalCount={allCount}
          draftedCount={draftedCount}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* v1.3 — Replies awaiting triage: top of the morning queue.
            Auto-expands when rows are present. */}
        <RepliesAwaitingTriageSection />

        {/* Action-item sections — expanded by default */}
        <CandidatesSection />
        <NeedsReviewSection />
        <NeedsRevisionSection />
        <ActiveSection />
        <RepliedSection />

        {/* Monitoring + historic sections — collapsed by default */}
        <SimpleSection state="engaged" title="Engaged" dotColor={colors.status.engaged} subtitle="meeting booked / in convo" />
        <SimpleSection state="parked" title="Parked" dotColor={colors.status.parked} subtitle="long-term wakeup queue" />
        <SimpleSection state="promoted" title="Promoted" dotColor={colors.status.promoted} subtitle="now active clients" />
        <SimpleSection state="lost" title="Lost" dotColor={colors.status.lost} subtitle="closed" />
      </div>
    </>
  );
}
