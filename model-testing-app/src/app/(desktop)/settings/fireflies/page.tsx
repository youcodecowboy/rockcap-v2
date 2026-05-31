"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  Skeleton,
} from "@/components/layouts";
import { useColors } from "@/lib/useColors";
import { ArrowLeft, ExternalLink } from "lucide-react";

// Fireflies settings page.
// Per docs/INTEGRATIONS/fireflies-scoping.md confirmed decisions:
// - Per-user API token paste (no OAuth)
// - Sync action and cron arrive in BL-3.3; this page handles connect/disconnect only.

export default function FirefliesSettingsPage() {
  const colors = useColors();
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
    <div style={{ background: colors.bg.light, minHeight: "100vh" }}>
      <div style={{ maxWidth: 768, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/settings"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: colors.text.muted,
            }}
          >
            <ArrowLeft size={14} />
            Back to settings
          </Link>
        </div>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: colors.text.primary }}>
            Fireflies Integration
          </h1>
          <p style={{ marginTop: 8, fontSize: 13, color: colors.text.secondary, lineHeight: 1.5 }}>
            Connect your Fireflies account so meeting transcripts and action items
            sync into RockCap automatically. Each user connects their own account;
            transcripts stay private to the connecting user.
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <Panel
            title="Connection"
            actions={
              loading ? (
                <Skeleton width={88} height={18} />
              ) : status?.connected ? (
                <StatusPill label="Connected" tone={colors.accent.green} />
              ) : (
                <StatusPill label="Not connected" tone={colors.text.dim} />
              )
            }
          >
            <p style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.5, marginBottom: 14 }}>
              Fireflies uses a personal API token. Generate one in your{" "}
              <a
                href="https://app.fireflies.ai/integrations/custom/api"
                target="_blank"
                rel="noreferrer"
                style={{ color: colors.accent.blue, display: "inline-flex", alignItems: "center", gap: 2 }}
              >
                Fireflies API settings
                <ExternalLink size={12} />
              </a>{" "}
              and paste it below.
            </p>

            {loading ? (
              <SkeletonText lines={3} />
            ) : status?.connected ? (
              <div>
                <Section title="Account">
                  {status.connectedEmail && (
                    <Row label="Connected account" value={status.connectedEmail} />
                  )}
                  {status.connectedAt && (
                    <Row
                      label="Connected on"
                      value={new Date(status.connectedAt).toLocaleString()}
                      mono
                    />
                  )}
                  {status.lastSyncAt && (
                    <Row
                      label="Last sync"
                      value={
                        new Date(status.lastSyncAt).toLocaleString() +
                        (status.lastSyncStatus ? ` (${status.lastSyncStatus})` : "")
                      }
                      mono
                    />
                  )}
                </Section>

                {status.needsReconnect && (
                  <div
                    style={{
                      color: colors.accent.yellow,
                      background: `${colors.accent.yellow}15`,
                      border: `1px solid ${colors.accent.yellow}40`,
                      borderRadius: 4,
                      padding: 12,
                      fontSize: 12,
                      marginBottom: 12,
                    }}
                  >
                    Your Fireflies token is no longer valid. Paste a new one
                    below to reconnect.
                  </div>
                )}

                <Button variant="secondary" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? "Disconnecting" : "Disconnect"}
                </Button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Fireflies API token">
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="Paste your Fireflies API token"
                    disabled={connecting}
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  />
                </Field>
                <div>
                  <Button
                    variant="primary"
                    onClick={handleConnect}
                    disabled={connecting || !apiToken.trim()}
                  >
                    {connecting ? "Connecting" : "Connect Fireflies"}
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: 16,
                  fontSize: 12,
                  color: colors.accent.red,
                  background: `${colors.accent.red}15`,
                  border: `1px solid ${colors.accent.red}40`,
                  borderRadius: 4,
                  padding: 12,
                }}
              >
                {error}
              </div>
            )}
            {successMessage && !error && (
              <div
                style={{
                  marginTop: 16,
                  fontSize: 12,
                  color: colors.accent.green,
                  background: `${colors.accent.green}15`,
                  border: `1px solid ${colors.accent.green}40`,
                  borderRadius: 4,
                  padding: 12,
                }}
              >
                {successMessage}
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Sync settings">
          <p style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.5, marginBottom: 14 }}>
            Sync runs are controlled centrally. The cron and backfill action
            ship in a later release; for now this page handles credential
            connection only.
          </p>
          <Section title="Configuration">
            <Row
              label="Global sync enabled"
              value={
                syncConfig === undefined ? (
                  <span style={{ color: colors.text.dim }}>loading</span>
                ) : syncConfig.isEnabled ? (
                  <StatusPill label="on" tone={colors.accent.green} />
                ) : (
                  <StatusPill label="off (default)" tone={colors.text.dim} />
                )
              }
            />
            <Row
              label="Backfill window"
              value={`${syncConfig?.defaultBackfillDays ?? 365} days`}
              mono
            />
            <Row
              label="Sync interval"
              value={`${syncConfig?.syncIntervalMinutes ?? 30} minutes`}
              mono
            />
          </Section>
        </Panel>
      </div>
    </div>
  );
}
