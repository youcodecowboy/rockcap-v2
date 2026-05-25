"use client";

import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatePill } from "./StatePill";

interface ProspectDetailHeaderProps {
  prospect: any;
  intelRun?: any;
  cadences: any[];
  activeTab: "overview" | "intel" | "people" | "ch" | "outreach" | "replies" | "meetings" | "activity";
  onTabChange: (tab: "overview" | "intel" | "people" | "ch" | "outreach" | "replies" | "meetings" | "activity") => void;
  peopleCount?: number;
  chargesCount?: number;
  repliesCount?: number;
  meetingsCount?: number;
}

export function ProspectDetailHeader({ prospect, intelRun, cadences, activeTab, onTabChange, peopleCount, chargesCount, repliesCount, meetingsCount }: ProspectDetailHeaderProps) {
  const colors = useColors();
  const router = useRouter();

  const state = prospect?.prospectState ?? "drafted";
  const touchCount = cadences?.length ?? 0;

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
          </div>
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
          {(["overview", "intel", "people", "ch", "outreach", "replies", "meetings", "activity"] as const).map((tab) => {
            const labelMap: Record<typeof tab, string> = {
              overview: "Overview",
              intel: "Intel",
              people: "People",
              ch: "Companies House",
              outreach: "Outreach",
              replies: "Replies",
              meetings: "Meetings",
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
              {tab === "replies" && repliesCount !== undefined && repliesCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{repliesCount}</span>
              )}
              {tab === "meetings" && meetingsCount !== undefined && meetingsCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{meetingsCount}</span>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
