"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useAction, useConvexAuth } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import {
  Panel,
  Section,
  Row,
  StatusPill,
  Button,
  Skeleton,
  SkeletonText,
} from "@/components/layouts";
import { useColors } from "@/lib/useColors";
import { ArrowLeft, AlertTriangle, HardDrive, Folder } from "lucide-react";

// Google Drive settings page.
// - Independent OAuth client from Gmail/Calendar.
// - ONE org-wide connection (app@rockcap.uk); NOT per-user like Gmail.
// - Full drive scope (write-back is a committed fast-follow).
// - Phase 1: OAuth connect/disconnect + root-folder selection. The changes
//   poller, mirror tables, and file UI are later phases.

// Parse a Drive folder id out of a pasted URL, or accept a bare id.
// Handles: drive.google.com/drive/folders/<id>, ...?id=<id>, or raw id.
function parseFolderId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idParam = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam) return idParam[1];
  // Bare id (no slashes / not a URL).
  if (/^[a-zA-Z0-9_-]+$/.test(raw)) return raw;
  return null;
}

function DriveSettingsInner() {
  const colors = useColors();
  // Convex auth resolves a beat after the Clerk session cookie is valid: the
  // browser must mint a `convex`-template JWT before the backend will accept
  // an authed query. getConnectionStatus is auth-gated server-side, so firing
  // it during that window throws an uncaught `Unauthenticated`. Skip it until
  // Convex reports authenticated.
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const status = useQuery(
    api.driveTokens.getConnectionStatus as any,
    isAuthenticated ? {} : "skip",
  );
  const validateAndSetRootFolder = useAction(
    api.driveTokens.validateAndSetRootFolder as any,
  );

  const params = useSearchParams();
  const callbackState = params.get("drive");

  const [disconnecting, setDisconnecting] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!callbackState) return;
    if (callbackState === "success") {
      setSuccessMessage("Google Drive connected.");
    } else if (callbackState === "denied") {
      setError("Drive consent was declined. You can try again at any time.");
    } else if (callbackState === "error") {
      setError("Drive connection failed. Check the OAuth setup and try again.");
    }
  }, [callbackState]);

  const handleDisconnect = async () => {
    setError(null);
    setSuccessMessage(null);
    setDisconnecting(true);
    try {
      const res = await fetch("/api/drive/disconnect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to disconnect Drive.");
        return;
      }
      setSuccessMessage("Google Drive disconnected.");
    } catch (e: any) {
      setError(e?.message || "Unexpected error disconnecting Drive.");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveFolder = async () => {
    setError(null);
    setSuccessMessage(null);
    const folderId = parseFolderId(folderInput);
    if (!folderId) {
      setError("Could not read a folder ID from that. Paste the folder link or ID.");
      return;
    }
    setSavingFolder(true);
    try {
      const result = await validateAndSetRootFolder({ folderId });
      if (result?.ok) {
        setSuccessMessage(`Root folder set to "${result.rootFolderName}".`);
        setFolderInput("");
      } else {
        setError(result?.error || "Could not set the root folder.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to set the root folder.");
    } finally {
      setSavingFolder(false);
    }
  };

  const loading = authLoading || !isAuthenticated || status === undefined;

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
            Google Drive Integration
          </h1>
          <p style={{ marginTop: 8, fontSize: 13, color: colors.text.secondary, lineHeight: 1.5 }}>
            Connect one Google account (app@rockcap.uk) to mirror a Drive
            folder into the app. This is a single org-wide connection, not a
            per-user one. Point it at the ROCKCAP Historic Drive folder below.
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
              Drive uses Google OAuth with its own client, independent of Gmail
              and Calendar. Connecting opens a Google consent screen and
              requests full Drive access (read now; write-back is a planned
              fast-follow). Disconnecting clears the local connection; you can
              also revoke access from the Google account settings.
            </p>

            {loading ? (
              <SkeletonText lines={3} />
            ) : status?.connected ? (
              <div>
                <Section title="Account">
                  <Row
                    label="Connected account"
                    value={
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <HardDrive size={14} style={{ color: colors.text.dim }} />
                        {status.connectedEmail}
                      </span>
                    }
                  />
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
                      value={new Date(status.lastSyncAt).toLocaleString()}
                      mono
                    />
                  )}
                  {status.scope && (
                    <Row label="Granted scopes" value={status.scope} mono />
                  )}
                </Section>

                {status.needsReconnect && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      color: colors.accent.yellow,
                      background: `${colors.accent.yellow}15`,
                      border: `1px solid ${colors.accent.yellow}40`,
                      borderRadius: 4,
                      padding: 12,
                      fontSize: 12,
                      marginBottom: 12,
                    }}
                  >
                    <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                    <div>
                      Drive token has expired or been revoked. Reconnect to
                      restore syncing.
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <a href="/api/drive/auth">
                    <Button variant="secondary">Reconnect</Button>
                  </a>
                  <Button variant="secondary" onClick={handleDisconnect} disabled={disconnecting}>
                    {disconnecting ? "Disconnecting" : "Disconnect"}
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.5 }}>
                  Open Google's consent screen below. Sign in as the shared
                  app@rockcap.uk account. Drive uses its own OAuth client, so
                  connecting it does not affect Gmail or Calendar.
                </p>
                <div>
                  <a href="/api/drive/auth">
                    <Button variant="primary">Connect Google Drive</Button>
                  </a>
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

        {status?.connected && (
          <Panel title="Root folder">
            <p style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.5, marginBottom: 14 }}>
              Paste the ROCKCAP Historic Drive folder link (or its ID). We
              verify it exists and is a folder before saving it as the mirror
              root.
            </p>

            {status.rootFolderId ? (
              <Section title="Current root">
                <Row
                  label="Folder"
                  value={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Folder size={14} style={{ color: colors.text.dim }} />
                      {status.rootFolderName || status.rootFolderId}
                    </span>
                  }
                />
                <Row label="Folder ID" value={status.rootFolderId} mono />
              </Section>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: colors.accent.yellow,
                  background: `${colors.accent.yellow}15`,
                  border: `1px solid ${colors.accent.yellow}40`,
                  borderRadius: 4,
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                No root folder set yet. The mirror has nothing to sync until you
                set one.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…"
                style={{
                  flex: 1,
                  fontSize: 12,
                  padding: "8px 10px",
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  background: colors.bg.card,
                  color: colors.text.primary,
                }}
              />
              <Button
                variant="primary"
                onClick={handleSaveFolder}
                disabled={savingFolder || !folderInput.trim()}
              >
                {savingFolder ? "Verifying" : status.rootFolderId ? "Change folder" : "Set folder"}
              </Button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

export default function DriveSettingsPage() {
  return (
    <Suspense fallback={<SkeletonText lines={4} />}>
      <DriveSettingsInner />
    </Suspense>
  );
}
