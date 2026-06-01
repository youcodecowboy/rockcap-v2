"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatePill } from "./StatePill";
import { FlagChip } from "./FlagChip";

interface ProspectDetailHeaderProps {
  prospect: any;
  intelRun?: any;
  cadences: any[];
  activeTab: "overview" | "intel" | "people" | "ch" | "track-record" | "outreach" | "replies" | "meetings" | "files" | "threads" | "knowledge" | "activity";
  onTabChange: (tab: "overview" | "intel" | "people" | "ch" | "track-record" | "outreach" | "replies" | "meetings" | "files" | "threads" | "knowledge" | "activity") => void;
  peopleCount?: number;
  chargesCount?: number;
  repliesCount?: number;
  meetingsCount?: number;
  schemesCount?: number;
  threadsCount?: number;
  knowledgeCount?: number;
  lenderTierConflict?: { action: "park" | "soften" | "none"; tier1: string[]; tier2: string[] };
}

export function ProspectDetailHeader({ prospect, intelRun, cadences, activeTab, onTabChange, peopleCount, chargesCount, repliesCount, meetingsCount, schemesCount, threadsCount, knowledgeCount, lenderTierConflict }: ProspectDetailHeaderProps) {
  const colors = useColors();
  const router = useRouter();
  const activate = useMutation(api.clients.activate as any);
  const [promoting, setPromoting] = useState(false);

  const state = prospect?.prospectState ?? "drafted";
  const touchCount = cadences?.length ?? 0;
  // Promote-to-client is offered only at the "engaged" rung (Meeting booked).
  const canPromote = state === "engaged" && !!prospect?._id;

  const handlePromote = async () => {
    if (!prospect?._id || promoting) return;
    const clientId = prospect._id as string;
    setPromoting(true);
    try {
      await activate({ clientId });
      router.push(`/clients/${clientId}`);
    } catch (err) {
      console.error("Failed to promote prospect to client", err);
      setPromoting(false);
    }
  };

  return (
    <>
      <div style={{ height: 2, background: colors.entityTypes.prospect }} />
      <div style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}`, position: "sticky", top: 64, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px 4px", fontSize: 11, color: colors.text.muted }}>
          <span onClick={() => router.push("/")} style={{ cursor: "pointer" }}>Dashboard</span>
          <span style={{ color: colors.text.dim }}>›</span>
          <span onClick={() => router.push("/prospects")} style={{ cursor: "pointer" }}>Prospects</span>
          <span style={{ color: colors.text.dim }}>›</span>
          <span style={{ color: colors.text.primary, fontWeight: 500 }}>{prospect?.name ?? "…"}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 24px 18px" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: `${colors.entityTypes.prospect}15`,
              border: `1px solid ${colors.entityTypes.prospect}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: colors.entityTypes.prospect, fontWeight: 600, fontSize: 16,
            }}>◆</div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 300, margin: 0, color: colors.text.primary }}>{prospect?.name ?? "…"}</h1>
              <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                {prospect?.companyName ?? ""}
              </div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                {intelRun?.dedupKey ? `CH-${intelRun.dedupKey}` : ""} {intelRun ? `· skillRun ${intelRun._id.slice(-8)}` : ""}
              </div>
            </div>
            <StatePill state={state} />
            {lenderTierConflict?.action === "park" && (
              <FlagChip label="Parked — Tier 1 lender" severity="warn" colors={colors} />
            )}
            {lenderTierConflict?.action === "soften" && (
              <FlagChip label="Soften — Tier 2 lender" severity="info" colors={colors} />
            )}
          </div>

          {canPromote && (
            <button
              onClick={handlePromote}
              disabled={promoting}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 6,
                border: `1px solid ${colors.entityTypes.client}`,
                background: promoting ? colors.bg.card : colors.entityTypes.client,
                color: promoting ? colors.text.muted : "#fff",
                cursor: promoting ? "default" : "pointer",
                opacity: promoting ? 0.7 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {promoting ? "Promoting…" : "Promote to client"}
            </button>
          )}
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1,
          padding: "0 24px 12px", background: colors.border.default,
        }}>
          {[
            { label: "Tier", value: "—", meta: "from Beauhurst", accent: colors.entityTypes.prospect },
            { label: "Cadence", value: String(touchCount), meta: "touches", accent: colors.entityTypes.cadence },
            { label: "Intel coverage", value: intelRun ? "OK" : "—", meta: intelRun ? "intel run complete" : "no intel run", accent: colors.entityTypes.skillRun },
            { label: "Last touch", value: "—", meta: "TBD", accent: colors.entityTypes.client },
            { label: "Replies", value: "0", meta: "no inbound yet", accent: colors.entityTypes.contact },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: colors.bg.card, padding: "12px 14px", borderTop: `2px solid ${kpi.accent}` }}>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted }}>{kpi.label}</div>
              <div style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary, marginTop: 6 }}>{kpi.value}</div>
              <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>{kpi.meta}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", padding: "0 24px", gap: 0, borderBottom: `1px solid ${colors.border.default}` }}>
          {(["overview", "intel", "people", "ch", "track-record", "outreach", "replies", "meetings", "files", "threads", "knowledge", "activity"] as const).map((tab) => {
            const labelMap: Record<typeof tab, string> = {
              overview: "Overview",
              intel: "Intel",
              people: "People",
              ch: "Companies House",
              "track-record": "Track Record",
              outreach: "Outreach",
              replies: "Replies",
              meetings: "Meetings",
              files: "Files",
              threads: "Threads",
              knowledge: "Knowledge",
              activity: "Activity",
            };
            return (
            <div
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                padding: "12px 16px", fontSize: 13, cursor: "pointer",
                color: tab === activeTab ? colors.text.primary : colors.text.muted,
                borderBottom: `2px solid ${tab === activeTab ? colors.entityTypes.prospect : "transparent"}`,
                fontWeight: tab === activeTab ? 500 : 400,
              }}
            >
              {labelMap[tab]}
              {tab === "outreach" && touchCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{touchCount}</span>
              )}
              {tab === "people" && peopleCount !== undefined && peopleCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{peopleCount}</span>
              )}
              {tab === "ch" && chargesCount !== undefined && chargesCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{chargesCount}</span>
              )}
              {tab === "track-record" && schemesCount !== undefined && schemesCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{schemesCount}</span>
              )}
              {tab === "replies" && repliesCount !== undefined && repliesCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{repliesCount}</span>
              )}
              {tab === "meetings" && meetingsCount !== undefined && meetingsCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{meetingsCount}</span>
              )}
              {tab === "threads" && threadsCount !== undefined && threadsCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{threadsCount}</span>
              )}
              {tab === "knowledge" && knowledgeCount !== undefined && knowledgeCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{knowledgeCount}</span>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
