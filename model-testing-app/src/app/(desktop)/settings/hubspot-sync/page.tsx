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
import { RefreshCw, CheckCircle2, XCircle, Clock, Database } from "lucide-react";

type SyncStats = {
  companiesSynced: number;
  contactsSynced: number;
  dealsSynced: number;
  activitiesSynced?: number;
  leadsSynced?: number;
  errors: number;
};

type SyncResult = {
  success?: boolean;
  stats?: SyncStats;
  errorMessages?: string[];
  error?: string;
};

function formatDate(dateString?: string) {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleString();
}

function StatusBadge({ status }: { status?: string }) {
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

export default function HubSpotSyncV2Page() {
  const syncConfig = useQuery(api.hubspotSync.getSyncConfig as any);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Form state
  const [maxRecords, setMaxRecords] = useState<string>("");
  const [syncCompanies, setSyncCompanies] = useState(true);
  const [syncContacts, setSyncContacts] = useState(true);
  const [syncDeals, setSyncDeals] = useState(true);
  const [syncActivities, setSyncActivities] = useState(true);

  const runSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const body: Record<string, unknown> = {
        syncCompanies,
        syncContacts,
        syncDeals,
        syncActivities,
      };
      const parsed = parseInt(maxRecords, 10);
      if (Number.isFinite(parsed) && parsed > 0) body.maxRecords = parsed;

      const res = await fetch("/api/hubspot/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      setSyncResult(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setSyncResult({ error: message });
    } finally {
      setIsSyncing(false);
    }
  };

  const lastStats = syncConfig?.lastSyncStats as SyncStats | undefined;

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
          <Database className="size-7" />
          HubSpot Sync
        </h1>
        <p className="text-muted-foreground text-sm">
          V2 pipeline (Apr 2026): companies, contacts, deals, and full engagement
          timeline. Replaces the legacy scoped sync buttons.
        </p>
      </div>

      {/* Last sync status */}
      <Card>
        <CardHeader>
          <CardTitle>Last Sync</CardTitle>
          <CardDescription>Status and stats from the most recent sync run</CardDescription>
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
                <span className="font-medium text-sm">{formatDate(syncConfig.lastSyncAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <StatusBadge status={syncConfig.lastSyncStatus} />
              </div>
              {lastStats && (
                <div className="pt-3 border-t grid grid-cols-2 gap-x-6 gap-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Companies</span>
                    <span className="font-medium">{lastStats.companiesSynced ?? "—"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contacts</span>
                    <span className="font-medium">{lastStats.contactsSynced ?? "—"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Deals</span>
                    <span className="font-medium">{lastStats.dealsSynced ?? "—"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Activities</span>
                    <span className="font-medium">{lastStats.activitiesSynced ?? "—"}</span>
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
          <CardDescription>Configure what to include in the next sync run</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1" htmlFor="maxRecords">
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
            <p className="text-sm font-medium">Include</p>
            {[
              { label: "Companies", value: syncCompanies, setter: setSyncCompanies },
              { label: "Contacts", value: syncContacts, setter: setSyncContacts },
              { label: "Deals", value: syncDeals, setter: setSyncDeals },
              { label: "Activities (engagement timeline)", value: syncActivities, setter: setSyncActivities },
            ].map(({ label, value, setter }) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setter(e.target.checked)}
                  className="size-4 rounded border-gray-300"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Run button */}
      <div className="space-y-2">
        <Button
          size="lg"
          className="w-full"
          onClick={runSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <>
              <RefreshCw className="size-4 mr-2 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="size-4 mr-2" />
              Run HubSpot Sync
            </>
          )}
        </Button>
        {isSyncing && (
          <p className="text-xs text-center text-muted-foreground">
            Syncing… this may take 15–30 min for a full sync.
          </p>
        )}
      </div>

      {/* Result card */}
      {syncResult && (
        <Card className={syncResult.error || syncResult.success === false
          ? "border-red-200 bg-red-50"
          : "border-green-200 bg-green-50"
        }>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center gap-2">
              {syncResult.error || syncResult.success === false ? (
                <XCircle className="size-5 text-red-600" />
              ) : (
                <CheckCircle2 className="size-5 text-green-600" />
              )}
              <span className={`font-semibold ${
                syncResult.error || syncResult.success === false
                  ? "text-red-900"
                  : "text-green-900"
              }`}>
                {syncResult.error || syncResult.success === false
                  ? "Sync failed"
                  : "Sync completed"}
              </span>
            </div>

            {syncResult.error && (
              <p className="text-sm text-red-700">{syncResult.error}</p>
            )}

            {syncResult.stats && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-2 border-t border-green-200">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Companies</span>
                  <span className="font-medium">{syncResult.stats.companiesSynced}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Contacts</span>
                  <span className="font-medium">{syncResult.stats.contactsSynced}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Deals</span>
                  <span className="font-medium">{syncResult.stats.dealsSynced}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Activities</span>
                  <span className="font-medium">{syncResult.stats.activitiesSynced ?? "—"}</span>
                </div>
                {(syncResult.stats.errors ?? 0) > 0 && (
                  <div className="flex justify-between text-sm col-span-2 text-destructive">
                    <span>Errors</span>
                    <span className="font-medium">{syncResult.stats.errors}</span>
                  </div>
                )}
              </div>
            )}

            {syncResult.errorMessages && syncResult.errorMessages.length > 0 && (
              <div className="text-sm text-red-700">
                <p className="font-medium mb-1">Error details:</p>
                <ul className="list-disc list-inside space-y-1">
                  {syncResult.errorMessages.slice(0, 5).map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
