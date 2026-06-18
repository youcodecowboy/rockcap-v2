"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatePill } from "./StatePill";
import { FlagChip } from "./FlagChip";
import { PIPELINE_STAGES, derivePipelineStage, ladderForStage } from "@/lib/prospects/stages";
import { DealValueControl } from "./DealValueControl";

interface ProspectDetailHeaderProps {
  prospect: any;
  intelRun?: any;
  cadences: any[];
  activeTab: "overview" | "intel" | "people" | "ch" | "track-record" | "outreach" | "replies" | "meetings" | "files" | "notes" | "threads" | "knowledge" | "activity";
  onTabChange: (tab: "overview" | "intel" | "people" | "ch" | "track-record" | "outreach" | "replies" | "meetings" | "files" | "notes" | "threads" | "knowledge" | "activity") => void;
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
  const transition = useMutation(api.prospects.transitionState as any);
  const promoteStage = useMutation(api.prospectStages.promoteStage as any);
  const setQualSubStage = useMutation(api.prospectStages.setQualSubStage as any);
  const [promoting, setPromoting] = useState(false);
  const [changingStage, setChangingStage] = useState(false);
  const [changingPipeline, setChangingPipeline] = useState(false);
  const [changingSubStage, setChangingSubStage] = useState(false);

  // Effective pipeline stage (stored value wins; else derived from prospectState).
  const pipelineStage = derivePipelineStage(prospect ?? {});
  // The sub-stage ladder only applies to pre-qualification / qualified.
  const ladder = pipelineStage ? ladderForStage(pipelineStage) : null;
  const qualSubStage = (prospect as any)?.qualSubStage as string | undefined;

  const handlePipelineChange = async (toStage: string) => {
    if (!prospect?._id || changingPipeline || toStage === pipelineStage) return;
    setChangingPipeline(true);
    try {
      await promoteStage({ clientId: prospect._id as string, toStage });
    } catch (err) {
      console.error("Failed to change pipeline stage", err);
    } finally {
      setChangingPipeline(false);
    }
  };

  const handleSubStageChange = async (subStage: string) => {
    if (!prospect?._id || changingSubStage || !subStage || subStage === qualSubStage) return;
    setChangingSubStage(true);
    try {
      await setQualSubStage({ clientId: prospect._id as string, subStage });
    } catch (err) {
      console.error("Failed to change sub-stage", err);
    } finally {
      setChangingSubStage(false);
    }
  };

  // Collapse the chrome (breadcrumb + metrics cards + title meta) once the
  // operator scrolls into the content, so the sticky header stops eating half
  // the viewport while reading emails / intel. Hysteresis (collapse past
  // 140px, expand only back under 40px) avoids flicker: collapsing shrinks
  // the document, which can itself nudge scrollY around a single threshold.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setCollapsed((prev) => (prev ? y > 40 : y > 140));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const state = prospect?.prospectState ?? "drafted";
  const touchCount = cadences?.length ?? 0;
  // Every step is operator-advanceable: promote is available from any non-promoted
  // state (it's a judgment call, not gated to a rung), and the stage dropdown lets
  // the operator move to any other stage manually.
  const canPromote = state !== "promoted" && !!prospect?._id;

  // Manual stages the operator can set directly (promotion is the separate button,
  // since it also flips the client to active).
  const MANUAL_STAGES = ["researched", "drafted", "needs_revision", "active", "replied", "engaged", "parked", "lost"] as const;

  const handleStageChange = async (newState: string) => {
    if (!prospect?._id || changingStage || newState === state) return;
    setChangingStage(true);
    try {
      await transition({ clientId: prospect._id as string, newState });
    } catch (err) {
      console.error("Failed to change prospect stage", err);
    } finally {
      setChangingStage(false);
    }
  };

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
        <div
          style={{
            maxHeight: collapsed ? 0 : 32,
            opacity: collapsed ? 0 : 1,
            overflow: "hidden",
            transition: "max-height 0.25s ease, opacity 0.2s ease",
            display: "flex", alignItems: "center", gap: 8,
            padding: collapsed ? "0 24px" : "14px 24px 4px",
            fontSize: 11, color: colors.text.muted,
          }}
        >
          <span onClick={() => router.push("/")} style={{ cursor: "pointer" }}>Dashboard</span>
          <span style={{ color: colors.text.dim }}>›</span>
          <span onClick={() => router.push("/prospects")} style={{ cursor: "pointer" }}>Prospects</span>
          <span style={{ color: colors.text.dim }}>›</span>
          <span style={{ color: colors.text.primary, fontWeight: 500 }}>{prospect?.name ?? "…"}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: collapsed ? "center" : "flex-start", padding: collapsed ? "8px 24px" : "8px 24px 18px", transition: "padding 0.25s ease" }}>
          <div style={{ display: "flex", gap: collapsed ? 10 : 14, alignItems: "center" }}>
            <div style={{
              width: collapsed ? 22 : 32, height: collapsed ? 22 : 32, borderRadius: 6,
              background: `${colors.entityTypes.prospect}15`,
              border: `1px solid ${colors.entityTypes.prospect}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: colors.entityTypes.prospect, fontWeight: 600, fontSize: collapsed ? 11 : 16,
              transition: "width 0.25s ease, height 0.25s ease",
            }}>◆</div>
            <div>
              <h1 style={{ fontSize: collapsed ? 14 : 20, fontWeight: collapsed ? 500 : 300, margin: 0, color: colors.text.primary, transition: "font-size 0.25s ease" }}>
                {prospect?.name ?? "…"}
                {collapsed && prospect?.companyName && (
                  <span style={{ fontSize: 11, fontWeight: 400, color: colors.text.muted, marginLeft: 8 }}>{prospect.companyName}</span>
                )}
              </h1>
              {!collapsed && (
                <>
                  <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                    {prospect?.companyName ?? ""}
                  </div>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                    {intelRun?.dedupKey ? `CH-${intelRun.dedupKey}` : ""} {intelRun ? `· skillRun ${intelRun._id.slice(-8)}` : ""}
                  </div>
                </>
              )}
            </div>
            <StatePill state={state} />
            {lenderTierConflict?.action === "park" && (
              <FlagChip label="Parked — Tier 1 lender" severity="warn" colors={colors} />
            )}
            {lenderTierConflict?.action === "soften" && (
              <FlagChip label="Soften — Tier 2 lender" severity="info" colors={colors} />
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Operator-entered deal value — the only source of the pipeline-value
                metric (never the AI dealSizeRange estimate). */}
            {prospect?._id && (
              <DealValueControl
                clientId={prospect._id as string}
                valueGBP={(prospect as any)?.dealValueGBP}
                note={(prospect as any)?.dealValueNote}
                aiEstimate={(prospect as any)?.dealSizeRange}
              />
            )}
            {/* Manual pipeline-stage promotion — moves the prospect between the
                5 dashboards. Separate axis from prospectState (the Stage control). */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: colors.text.muted }}>
              Pipeline
              <select
                value={pipelineStage ?? ""}
                disabled={changingPipeline}
                onChange={(e) => handlePipelineChange(e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: `1px solid ${colors.border.default}`,
                  background: colors.bg.card,
                  color: colors.text.primary,
                  cursor: changingPipeline ? "default" : "pointer",
                }}
              >
                {!pipelineStage && <option value="">— holding —</option>}
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </label>
            {/* Sub-stage ladder — only for pre-qualification / qualified, where the
                operator advances a discrete workflow step (modelling → feedback,
                terms requested → credit approved). */}
            {ladder && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: colors.text.muted }}>
                Step
                <select
                  value={qualSubStage ?? ""}
                  disabled={changingSubStage}
                  onChange={(e) => handleSubStageChange(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.bg.card,
                    color: colors.text.primary,
                    cursor: changingSubStage ? "default" : "pointer",
                  }}
                >
                  <option value="">— not set —</option>
                  {ladder.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </label>
            )}
            {/* Manual stage control — operator can advance prospectState to any stage. */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: colors.text.muted }}>
              Stage
              <select
                value={MANUAL_STAGES.includes(state as any) ? state : ""}
                disabled={changingStage}
                onChange={(e) => handleStageChange(e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: `1px solid ${colors.border.default}`,
                  background: colors.bg.card,
                  color: colors.text.primary,
                  cursor: changingStage ? "default" : "pointer",
                }}
              >
                {!MANUAL_STAGES.includes(state as any) && <option value="">{state}</option>}
                {MANUAL_STAGES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
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
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1,
          padding: collapsed ? "0 24px" : "0 24px 12px", background: colors.border.default,
          maxHeight: collapsed ? 0 : 110,
          opacity: collapsed ? 0 : 1,
          overflow: "hidden",
          transition: "max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease",
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
          {(["overview", "intel", "people", "ch", "track-record", "outreach", "replies", "meetings", "files", "notes", "threads", "knowledge", "activity"] as const).map((tab) => {
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
              notes: "Notes",
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
