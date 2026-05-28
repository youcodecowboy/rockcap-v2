"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { ProspectsHomeHeader } from "@/components/prospects/ProspectsHomeHeader";
import { RepliesAwaitingTriageSection } from "@/components/prospects/sections/RepliesAwaitingTriageSection";
import { UpcomingMeetingsSection } from "@/components/prospects/sections/UpcomingMeetingsSection";
import { NewTab } from "@/components/prospects/tabs2/NewTab";
import { ProspectsTab } from "@/components/prospects/tabs2/ProspectsTab";

type Tab = "new" | "prospects";

export default function ProspectsPage() {
  const colors = useColors();
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<Tab>("prospects");

  // Counts for the header (each is a small query)
  const draftedCount = useQuery(api.prospects.countByState as any, { state: "drafted" }) ?? 0;
  const allClients = useQuery(api.clients.list as any, {}) ?? [];
  const prospectCount = (allClients as any[]).filter(
    (c: any) => c.status === "prospect" && c.prospectState,
  ).length;

  // New tab count — unprocessed HubSpot companies (same query the tab itself uses).
  const candidates = useQuery(api.companies.listUnprocessed as any, {
    limit: 25,
    sinceDays: 30,
    states: ["new", "running", "stuck"],
    excludePromoted: true,
  });
  const newCount = (candidates ?? []).length;

  return (
    <>
      {/* TopAccent strip — amber for prospect entity */}
      <div style={{ height: 2, background: colors.entityTypes.prospect }} />
      <div style={{ padding: "16px 24px", background: colors.bg.cardAlt, minHeight: "100vh" }}>
        <ProspectsHomeHeader
          totalCount={prospectCount}
          draftedCount={draftedCount}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Cross-cutting morning triage — these are NOT pipeline rungs, so they
            stay above the tab bar regardless of which tab is active.
            v1.3 Sprint C — Upcoming meetings: "what calls do I have today".
            v1.3 — Replies awaiting triage: the morning triage queue.
            Both auto-expand when rows are present. */}
        <UpcomingMeetingsSection />
        <RepliesAwaitingTriageSection />

        {/* Pipeline tabs — New (unprocessed HubSpot companies) vs
            Prospects (the researched → meeting-booked ladder). */}
        <div
          style={{
            display: "flex",
            gap: 4,
            borderBottom: `1px solid ${colors.border.default}`,
            marginBottom: 14,
          }}
        >
          <TabButton
            label="New"
            count={newCount}
            active={tab === "new"}
            onClick={() => setTab("new")}
            colors={colors}
          />
          <TabButton
            label="Prospects"
            count={prospectCount}
            active={tab === "prospects"}
            onClick={() => setTab("prospects")}
            colors={colors}
          />
        </div>

        {tab === "new" ? <NewTab /> : <ProspectsTab />}
      </div>
    </>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
  colors,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  colors: any;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? colors.entityTypes.prospect : "transparent"}`,
        marginBottom: -1,
        cursor: "pointer",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        fontWeight: active ? 600 : 400,
        color: active ? colors.text.primary : colors.text.muted,
      }}
    >
      {label}
      <span
        style={{
          fontSize: 10,
          padding: "1px 6px",
          borderRadius: 2,
          background: active ? `${colors.entityTypes.prospect}20` : colors.bg.cardAlt,
          color: active ? colors.entityTypes.prospect : colors.text.muted,
          border: `1px solid ${active ? `${colors.entityTypes.prospect}40` : colors.border.default}`,
        }}
      >
        {count}
      </span>
    </button>
  );
}
