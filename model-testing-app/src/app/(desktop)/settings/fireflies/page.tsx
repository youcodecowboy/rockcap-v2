"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";

// Fireflies settings page.
// Per docs/INTEGRATIONS/fireflies-scoping.md confirmed decisions:
// - Per-user API token paste (no OAuth)
// - Sync action and cron arrive in BL-3.3; this page handles connect/disconnect only.

export default function FirefliesSettingsPage() {
  const status = useQuery(api.fireflies.getConnectionStatus as any);
  const syncConfig = useQuery(api.fireflies.getSyncConfig as any);

  const [apiToken, setApiToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Clear messages when the connection state changes.
  useEffect(() => {
    if (status?.connected) {
      setApiToken("");
    }
  }, [status?.connected]);

  const handleConnect = async () => {
    setError(null);
    setSuccessMessage(null);
    if (!apiToken.trim()) {
      setError("Paste your Fireflies API token to connect.");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch("/api/fireflies/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken: apiToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect Fireflies.");
        return;
      }
      setSuccessMessage(
        data.connectedEmail
          ? `Connected as ${data.connectedEmail}.`
          : "Connected to Fireflies.",
      );
    } catch (e: any) {
      setError(e?.message || "Unexpected error connecting Fireflies.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    setSuccessMessage(null);
    setDisconnecting(true);
    try {
      const res = await fetch("/api/fireflies/disconnect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to disconnect Fireflies.");
        return;
      }
      setSuccessMessage("Fireflies disconnected.");
    } catch (e: any) {
      setError(e?.message || "Unexpected error disconnecting Fireflies.");
    } finally {
      setDisconnecting(false);
    }
  };

  const loading = status === undefined;

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to settings
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Fireflies Integration</h1>
          <p className="mt-2 text-gray-600">
            Connect your Fireflies account so meeting transcripts and action items
            sync into RockCap automatically. Each user connects their own account;
            transcripts stay private to the connecting user.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Connection</span>
              {loading ? (
                <Badge variant="outline">Loading</Badge>
              ) : status?.connected ? (
                <Badge variant="default" className="bg-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline">
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  Not connected
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Fireflies uses a personal API token. Generate one in your{" "}
              <a
                href="https://app.fireflies.ai/integrations/custom/api"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center"
              >
                Fireflies API settings
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>{" "}
              and paste it below.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-sm text-gray-500 flex items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading connection status...
              </div>
            ) : status?.connected ? (
              <div className="space-y-3 text-sm">
                {status.connectedEmail && (
                  <div>
                    <div className="text-gray-500">Connected account</div>
                    <div className="font-medium text-gray-900">{status.connectedEmail}</div>
                  </div>
                )}
                {status.connectedAt && (
                  <div>
                    <div className="text-gray-500">Connected on</div>
                    <div className="text-gray-900">
                      {new Date(status.connectedAt).toLocaleString()}
                    </div>
                  </div>
                )}
                {status.lastSyncAt && (
                  <div>
                    <div className="text-gray-500">Last sync</div>
                    <div className="text-gray-900">
                      {new Date(status.lastSyncAt).toLocaleString()}
                      {status.lastSyncStatus && (
                        <span className="ml-2 text-xs text-gray-500">
                          ({status.lastSyncStatus})
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {status.needsReconnect && (
                  <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                    Your Fireflies token is no longer valid. Paste a new one
                    below to reconnect.
                  </div>
                )}
                <div className="pt-3">
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                  >
                    {disconnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Disconnecting
                      </>
                    ) : (
                      "Disconnect"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Fireflies API token
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                  placeholder="Paste your Fireflies API token"
                  disabled={connecting}
                />
                <div className="flex items-center gap-2">
                  <Button onClick={handleConnect} disabled={connecting || !apiToken.trim()}>
                    {connecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Connecting
                      </>
                    ) : (
                      "Connect Fireflies"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                {error}
              </div>
            )}
            {successMessage && !error && (
              <div className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
                {successMessage}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sync settings</CardTitle>
            <CardDescription>
              Sync runs are controlled centrally. The cron and backfill action
              ship in a later release; for now this page handles credential
              connection only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between">
                <dt className="text-gray-500">Global sync enabled</dt>
                <dd>
                  {syncConfig === undefined ? (
                    <span className="text-gray-400">loading</span>
                  ) : syncConfig.isEnabled ? (
                    <Badge variant="default" className="bg-emerald-600">on</Badge>
                  ) : (
                    <Badge variant="outline">off (default)</Badge>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Backfill window</dt>
                <dd>{syncConfig?.defaultBackfillDays ?? 365} days</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Sync interval</dt>
                <dd>{syncConfig?.syncIntervalMinutes ?? 30} minutes</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
