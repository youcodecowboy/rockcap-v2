"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function LastSyncBadge({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "success")
    return (
      <Badge variant="default" className="bg-green-500">
        <CheckCircle2 className="size-3 mr-1" />
        Success
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="destructive">
        <XCircle className="size-3 mr-1" />
        Error
      </Badge>
    );
  if (status === "in_progress")
    return (
      <Badge variant="secondary">
        <Clock className="size-3 mr-1" />
        In Progress
      </Badge>
    );
  return null;
}

function StageStatusIcon({ status }: { status: StageStatus }) {
  if (status === "pending")
    return <Clock className="size-4 text-muted-foreground" />;
  if (status === "running")
    return <Loader2 className="size-4 text-blue-500 animate-spin" />;
  if (status === "success")
    return <CheckCircle2 className="size-4 text-green-500" />;
  return <XCircle className="size-4 text-red-500" />;
}

function StageCard({
  stage,
  state,
  enabled,
  isRunning,
  onRetry,
}: {
  stage: (typeof STAGES)[number];
  state: StageState;
  enabled: boolean;
  isRunning: boolean;
  onRetry: () => void;
}) {
  const Icon = stage.icon;
  const synced = state.stats?.[stage.statKey];
  const errors = state.stats?.errors;

  return (
    <div
      className={`flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors ${
        !enabled
          ? "opacity-40"
          : state.status === "running"
          ? "border-blue-200 bg-blue-50/50"
          : state.status === "success"
          ? "border-green-200 bg-green-50/50"
          : state.status === "error"
          ? "border-red-200 bg-red-50/50"
          : "border-border"
      }`}
    >
      {/* Stage icon */}
      <div className="shrink-0">
        <Icon
          className={`size-5 ${
            !enabled
              ? "text-muted-foreground"
              : state.status === "running"
              ? "text-blue-500"
              : state.status === "success"
              ? "text-green-600"
              : state.status === "error"
              ? "text-red-600"
              : "text-muted-foreground"
          }`}
        />
      </div>

      {/* Label + error message */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{stage.label}</p>
        {state.status === "error" && state.errorMessage && (
          <p className="text-xs text-red-600 truncate mt-0.5">
            {state.errorMessage}
          </p>
        )}
      </div>

      {/* Stats on success */}
      {state.status === "success" && (
        <div className="text-xs text-muted-foreground shrink-0">
          {synced !== undefined && (
            <span className="font-medium text-foreground">{synced} synced</span>
          )}
          {errors !== undefined && errors > 0 && (
            <span className="text-red-500 ml-2">{errors} errors</span>
          )}
        </div>
      )}

      {/* Retry button on error */}
      {state.status === "error" && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 h-7 text-xs"
          onClick={onRetry}
          disabled={isRunning}
        >
          <RefreshCw className="size-3 mr-1" />
          Retry
        </Button>
      )}

      {/* Status icon */}
      <div className="shrink-0">
        <StageStatusIcon status={state.status} />
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
  const syncConfig = useQuery(api.hubspotSync.getSyncConfig as any);

  const [stages, setStages] =
    useState<Record<StageId, StageState>>(INITIAL_STAGES);
  const [isRunning, setIsRunning] = useState(false);
  const [maxRecords, setMaxRecords] = useState<string>("");
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
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
          <Database className="size-7" />
          HubSpot Sync
        </h1>
        <p className="text-muted-foreground text-sm">
          V2 pipeline (Apr 2026): runs as 4 sequential stages to prevent
          timeouts. Companies → Contacts → Deals → Engagements. Each stage
          can be retried independently.
        </p>
      </div>

      {/* Last sync status */}
      <Card>
        <CardHeader>
          <CardTitle>Last Sync</CardTitle>
          <CardDescription>
            Status and stats from the most recent sync run
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncConfig === undefined ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !syncConfig?.lastSyncAt ? (
            <p className="text-sm text-muted-foreground">Never synced</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Completed</span>
                <span className="font-medium text-sm">
                  {formatDate(syncConfig.lastSyncAt)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <LastSyncBadge status={syncConfig.lastSyncStatus} />
              </div>
              {lastStats && (
                <div className="pt-3 border-t grid grid-cols-2 gap-x-6 gap-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Companies</span>
                    <span className="font-medium">
                      {lastStats.companiesSynced ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contacts</span>
                    <span className="font-medium">
                      {lastStats.contactsSynced ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Deals</span>
                    <span className="font-medium">
                      {lastStats.dealsSynced ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Activities</span>
                    <span className="font-medium">
                      {lastStats.activitiesSynced ?? "—"}
                    </span>
                  </div>
                  {(lastStats.errors ?? 0) > 0 && (
                    <div className="flex justify-between text-sm col-span-2 text-destructive">
                      <span>Errors</span>
                      <span className="font-medium">{lastStats.errors}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync options */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Options</CardTitle>
          <CardDescription>
            Configure what to include in the next sync run
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label
              className="text-sm font-medium block mb-1"
              htmlFor="maxRecords"
            >
              Max records per object
            </label>
            <input
              id="maxRecords"
              type="number"
              min={1}
              placeholder="Leave blank for unlimited"
              value={maxRecords}
              onChange={(e) => setMaxRecords(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Include stages</p>
            {STAGES.map((stage) => (
              <label
                key={stage.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={enabled[stage.id]}
                  onChange={(e) => toggleEnabled(stage.id, e.target.checked)}
                  className="size-4 rounded border-gray-300"
                  disabled={isRunning}
                />
                <span className="text-sm">{stage.label}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stage progress cards */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Progress</CardTitle>
          <CardDescription>
            Stages run sequentially. A stage failure stops the chain — use
            Retry to resume from that stage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {STAGES.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              state={stages[stage.id]}
              enabled={enabled[stage.id]}
              isRunning={isRunning}
              onRetry={() => retryStage(stage.id)}
            />
          ))}

          {/* Final success banner */}
          {allDone && !isRunning && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 mt-2">
              <CheckCircle2 className="size-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-900">
                  All stages completed
                </p>
                <p className="text-xs text-green-700">
                  HubSpot sync finished successfully.
                </p>
              </div>
            </div>
          )}

          {/* Error banner */}
          {anyError && !isRunning && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 mt-2">
              <XCircle className="size-5 text-red-600 shrink-0" />
              <p className="text-sm text-red-800">
                Sync stopped due to an error. Retry the failed stage or run the
                full sync again.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run button */}
      <div className="space-y-2">
        <Button
          size="lg"
          className="w-full"
          onClick={runAllStages}
          disabled={isRunning}
        >
          {isRunning ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="size-4 mr-2" />
              Run Sync
            </>
          )}
        </Button>
        {isRunning && (
          <p className="text-xs text-center text-muted-foreground">
            Running stages sequentially — do not close this page.
          </p>
        )}
      </div>
    </div>
  );
}
