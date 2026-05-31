"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import {
  Panel,
  Section,
  Row,
  StatusPill,
  Button,
  Field,
  Input,
  SkeletonText,
} from "@/components/layouts";
import { useColors } from "@/lib/useColors";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  Loader2,
  Building2,
  User,
  Briefcase,
  Activity,
} from "lucide-react";
import type { ColorPalette } from "@/lib/colors";

type StageStatus = "pending" | "running" | "success" | "error";

type StageState = {
  status: StageStatus;
  stats?: Record<string, number>;
  errorMessage?: string;
};

type SyncStats = {
  companiesSynced?: number;
  contactsSynced?: number;
  dealsSynced?: number;
  activitiesSynced?: number;
  leadsSynced?: number;
  errors?: number;
};

const STAGES = [
  {
    id: "companies" as const,
    label: "Companies",
    icon: Building2,
    flag: "syncCompanies" as const,
    statKey: "companiesSynced",
  },
  {
    id: "contacts" as const,
    label: "Contacts",
    icon: User,
    flag: "syncContacts" as const,
    statKey: "contactsSynced",
  },
  {
    id: "deals" as const,
    label: "Deals",
    icon: Briefcase,
    flag: "syncDeals" as const,
    statKey: "dealsSynced",
  },
  {
    id: "activities" as const,
    label: "Engagements",
    icon: Activity,
    flag: "syncActivities" as const,
    statKey: "activitiesSynced",
  },
] as const;

type StageId = (typeof STAGES)[number]["id"];
type StageFlag = (typeof STAGES)[number]["flag"];

function formatDate(dateString?: string) {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleString();
}

function lastSyncTone(status: string | undefined, colors: ColorPalette): string {
  if (status === "success") return colors.accent.green;
  if (status === "error") return colors.accent.red;
  if (status === "in_progress") return colors.accent.blue;
  return colors.text.dim;
}

function StageStatusIcon({ status, colors }: { status: StageStatus; colors: ColorPalette }) {
  if (status === "pending") return <Clock size={16} style={{ color: colors.text.muted }} />;
  if (status === "running")
    return <Loader2 size={16} className="animate-spin" style={{ color: colors.accent.blue }} />;
  if (status === "success")
    return <CheckCircle2 size={16} style={{ color: colors.accent.green }} />;
  return <XCircle size={16} style={{ color: colors.accent.red }} />;
}

function StageRow({
  stage,
  state,
  enabled,
  isRunning,
  onRetry,
  colors,
}: {
  stage: (typeof STAGES)[number];
  state: StageState;
  enabled: boolean;
  isRunning: boolean;
  onRetry: () => void;
  colors: ColorPalette;
}) {
  const Icon = stage.icon;
  const synced = state.stats?.[stage.statKey];
  const errors = state.stats?.errors;

  const tone =
    state.status === "running"
      ? colors.accent.blue
      : state.status === "success"
      ? colors.accent.green
      : state.status === "error"
      ? colors.accent.red
      : colors.border.default;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        borderRadius: 4,
        border: `1px solid ${state.status === "pending" ? colors.border.default : tone + "40"}`,
        background:
          state.status === "pending" || !enabled ? colors.bg.card : `${tone}10`,
        padding: "10px 14px",
        opacity: enabled ? 1 : 0.4,
        transition: "background 100ms linear, border-color 100ms linear",
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <Icon
          size={18}
          style={{
            color:
              !enabled || state.status === "pending"
                ? colors.text.muted
                : tone,
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{stage.label}</p>
        {state.status === "error" && state.errorMessage && (
          <p
            style={{
              fontSize: 11,
              color: colors.accent.red,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {state.errorMessage}
          </p>
        )}
      </div>

      {state.status === "success" && (
        <div style={{ fontSize: 11, color: colors.text.muted, flexShrink: 0 }}>
          {synced !== undefined && (
            <span style={{ fontWeight: 500, color: colors.text.primary }}>{synced} synced</span>
          )}
          {errors !== undefined && errors > 0 && (
            <span style={{ color: colors.accent.red, marginLeft: 8 }}>{errors} errors</span>
          )}
        </div>
      )}

      {state.status === "error" && (
        <Button variant="secondary" size="sm" onClick={onRetry} disabled={isRunning}>
          <RefreshCw size={12} />
          Retry
        </Button>
      )}

      <div style={{ flexShrink: 0 }}>
        <StageStatusIcon status={state.status} colors={colors} />
      </div>
    </div>
  );
}

const INITIAL_STAGES: Record<StageId, StageState> = {
  companies: { status: "pending" },
  contacts: { status: "pending" },
  deals: { status: "pending" },
  activities: { status: "pending" },
};

export default function HubSpotSyncPage() {
  const colors = useColors();
  const syncConfig = useQuery(api.hubspotSync.getSyncConfig as any);

  const [stages, setStages] =
    useState<Record<StageId, StageState>>(INITIAL_STAGES);
  const [isRunning, setIsRunning] = useState(false);
  const [maxRecords, setMaxRecords] = useState<string>("");
  // Incremental mode by default — syncs only records modified since
  // `syncConfig.lastSyncAt`. Check "Force full resync" to ignore lastSyncAt
  // and re-pull everything (useful after schema changes or to backfill
  // records HubSpot silently mutated without touching lastmodifieddate).
  const [forceFull, setForceFull] = useState(false);
  const [enabled, setEnabled] = useState<Record<StageId, boolean>>({
    companies: true,
    contacts: true,
    deals: true,
    activities: true,
  });

  const runStage = async (
    stageId: StageId,
    flagKey: StageFlag
  ): Promise<boolean> => {
    setStages((s) => ({ ...s, [stageId]: { status: "running" } }));
    try {
      const body: Record<string, unknown> = {
        syncCompanies: flagKey === "syncCompanies",
        syncContacts: flagKey === "syncContacts",
        syncDeals: flagKey === "syncDeals",
        syncActivities: flagKey === "syncActivities",
        mode: forceFull ? "full" : "incremental",
      };
      const parsed = parseInt(maxRecords, 10);
      if (Number.isFinite(parsed) && parsed > 0) body.maxRecords = parsed;

      const res = await fetch("/api/hubspot/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();

      if (!res.ok || result.error) {
        setStages((s) => ({
          ...s,
          [stageId]: {
            status: "error",
            errorMessage: result.error || `HTTP ${res.status}`,
          },
        }));
        return false;
      }

      setStages((s) => ({
        ...s,
        [stageId]: { status: "success", stats: result.stats },
      }));
      return true;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      setStages((s) => ({
        ...s,
        [stageId]: { status: "error", errorMessage: message },
      }));
      return false;
    }
  };

  const runAllStages = async () => {
    setIsRunning(true);
    // Reset all enabled stages to pending
    setStages((s) => {
      const next = { ...s };
      for (const stage of STAGES) {
        if (enabled[stage.id]) next[stage.id] = { status: "pending" };
      }
      return next;
    });

    for (const stage of STAGES) {
      if (!enabled[stage.id]) continue;
      const ok = await runStage(stage.id, stage.flag);
      if (!ok) break; // Stop chain on first error
    }
    setIsRunning(false);
  };

  const retryStage = async (stageId: StageId) => {
    const stage = STAGES.find((s) => s.id === stageId);
    if (!stage) return;
    setIsRunning(true);
    await runStage(stageId, stage.flag);
    setIsRunning(false);
  };

  const toggleEnabled = (stageId: StageId, value: boolean) => {
    setEnabled((e) => ({ ...e, [stageId]: value }));
  };

  const lastStats = syncConfig?.lastSyncStats as SyncStats | undefined;

  const anyError = STAGES.some((s) => stages[s.id].status === "error");
  const allDone = STAGES.filter((s) => enabled[s.id]).every(
    (s) => stages[s.id].status === "success"
  );

  return (
    <div style={{ background: colors.bg.light, minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 768,
          margin: "0 auto",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Header */}
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: colors.text.primary,
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Database size={26} />
            HubSpot Sync
          </h1>
          <p style={{ fontSize: 12, color: colors.text.secondary, lineHeight: 1.5 }}>
            V2 pipeline (Apr 2026): runs as 4 sequential stages to prevent
            timeouts. Companies → Contacts → Deals → Engagements. Each stage
            can be retried independently.
          </p>
        </div>

        {/* Last sync status */}
        <Panel title="Last Sync">
          {syncConfig === undefined ? (
            <SkeletonText lines={2} />
          ) : !syncConfig?.lastSyncAt ? (
            <p style={{ fontSize: 12, color: colors.text.muted }}>Never synced</p>
          ) : (
            <Section title="Most recent run">
              <Row label="Completed" value={formatDate(syncConfig.lastSyncAt)} mono />
              <Row
                label="Status"
                value={
                  <StatusPill
                    label={syncConfig.lastSyncStatus ?? "unknown"}
                    tone={lastSyncTone(syncConfig.lastSyncStatus, colors)}
                  />
                }
              />
              {lastStats && (
                <>
                  <Row label="Companies" value={lastStats.companiesSynced ?? "—"} mono />
                  <Row label="Contacts" value={lastStats.contactsSynced ?? "—"} mono />
                  <Row label="Deals" value={lastStats.dealsSynced ?? "—"} mono />
                  <Row label="Activities" value={lastStats.activitiesSynced ?? "—"} mono />
                  {(lastStats.errors ?? 0) > 0 && (
                    <Row
                      label="Errors"
                      value={lastStats.errors}
                      mono
                      valueColor={colors.accent.red}
                    />
                  )}
                </>
              )}
            </Section>
          )}
        </Panel>

        {/* Sync options */}
        <Panel title="Sync Options">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Max records per object">
              <Input
                id="maxRecords"
                type="number"
                min={1}
                placeholder="Leave blank for unlimited"
                value={maxRecords}
                onChange={(e) => setMaxRecords(e.target.value)}
              />
            </Field>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: colors.text.muted,
                  fontWeight: 500,
                }}
              >
                Include stages
              </p>
              {STAGES.map((stage) => (
                <label
                  key={stage.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={enabled[stage.id]}
                    onChange={(e) => toggleEnabled(stage.id, e.target.checked)}
                    disabled={isRunning}
                    style={{ width: 16, height: 16, accentColor: colors.accent.blue }}
                  />
                  <span style={{ fontSize: 12, color: colors.text.primary }}>{stage.label}</span>
                </label>
              ))}
            </div>

            <div style={{ paddingTop: 12, borderTop: `1px solid ${colors.border.light}` }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={forceFull}
                  onChange={(e) => setForceFull(e.target.checked)}
                  disabled={isRunning}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: colors.accent.blue }}
                />
                <span style={{ fontSize: 12, color: colors.text.primary }}>
                  <span style={{ fontWeight: 500 }}>Force full resync</span>
                  <span style={{ display: "block", fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                    {syncConfig?.lastSyncAt
                      ? `Default is incremental — only records modified since last sync (${new Date(syncConfig.lastSyncAt).toLocaleString()}). Check this to re-pull everything.`
                      : "First sync (no lastSyncAt on record); this pulls everything by default."}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </Panel>

        {/* Stage progress */}
        <Panel title="Sync Progress">
          <p style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.5, marginBottom: 12 }}>
            Stages run sequentially. A stage failure stops the chain — use
            Retry to resume from that stage.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STAGES.map((stage) => (
              <StageRow
                key={stage.id}
                stage={stage}
                state={stages[stage.id]}
                enabled={enabled[stage.id]}
                isRunning={isRunning}
                onRetry={() => retryStage(stage.id)}
                colors={colors}
              />
            ))}

            {/* Final success banner */}
            {allDone && !isRunning && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 4,
                  border: `1px solid ${colors.accent.green}40`,
                  background: `${colors.accent.green}15`,
                  padding: "10px 14px",
                  marginTop: 8,
                }}
              >
                <CheckCircle2 size={18} style={{ color: colors.accent.green, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: colors.accent.green }}>
                    All stages completed
                  </p>
                  <p style={{ fontSize: 11, color: colors.text.muted }}>
                    HubSpot sync finished successfully.
                  </p>
                </div>
              </div>
            )}

            {/* Error banner */}
            {anyError && !isRunning && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 4,
                  border: `1px solid ${colors.accent.red}40`,
                  background: `${colors.accent.red}15`,
                  padding: "10px 14px",
                  marginTop: 8,
                }}
              >
                <XCircle size={18} style={{ color: colors.accent.red, flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: colors.accent.red }}>
                  Sync stopped due to an error. Retry the failed stage or run the
                  full sync again.
                </p>
              </div>
            )}
          </div>
        </Panel>

        {/* Run button */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Button
            variant="primary"
            accent={colors.accent.blue}
            onClick={runAllStages}
            disabled={isRunning}
            style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}
          >
            {isRunning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Run Sync
              </>
            )}
          </Button>
          {isRunning && (
            <p style={{ fontSize: 11, textAlign: "center", color: colors.text.muted }}>
              Running stages sequentially — do not close this page.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
