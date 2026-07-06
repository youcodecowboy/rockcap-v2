"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useAction, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import {
  Panel,
  Section,
  Row,
  StatusPill,
  Button,
  Skeleton,
  SkeletonText,
  EmptyState,
} from "@/components/layouts";
import { useColors } from "@/lib/useColors";
import {
  ArrowLeft,
  AlertTriangle,
  AlertCircle,
  HardDrive,
  Folder,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  RefreshCw,
  Loader2,
  X,
  Link2,
} from "lucide-react";

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

  // Phase 4b — sync stats, corpus mapping, extraction errors.
  const mirrorStats = useQuery(
    api.driveSync.getMirrorStats,
    isAuthenticated ? {} : "skip",
  );
  const extractionErrors = useQuery(
    api.driveSync.listExtractionErrors,
    isAuthenticated ? {} : "skip",
  );
  const activeClients = useQuery(
    api.driveSync.getActiveClientsForMapping,
    isAuthenticated ? {} : "skip",
  );
  const startBackfill = useAction(api.driveSync.startBackfillManual);
  const [syncing, setSyncing] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const handleRunSync = async () => {
    setError(null);
    setSuccessMessage(null);
    setSyncing(true);
    try {
      const res = await startBackfill({});
      if (res?.status === "started") {
        setSuccessMessage("Initial sync started. Progress shows in the stats below.");
      } else {
        setError(`Could not start sync (${res?.status ?? "unknown"}).`);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to start sync.");
    } finally {
      setSyncing(false);
    }
  };

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

        {/* ── Sync stats + manual sync ──────────────────────────── */}
        {status?.connected && (
          <div style={{ marginTop: 24 }}>
            <Panel
              title="Sync"
              actions={
                <Button
                  variant="secondary"
                  onClick={handleRunSync}
                  disabled={syncing || !status.rootFolderId}
                >
                  {syncing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Run initial sync
                </Button>
              }
            >
              <p style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.5, marginBottom: 14 }}>
                The mirror rebuilds itself from Drive. Run an initial sync after
                setting the root folder or to force a full re-walk; progress
                shows in the counts below and updates the last-sync time.
              </p>
              {mirrorStats === undefined ? (
                <SkeletonText lines={3} />
              ) : !mirrorStats ? (
                <p style={{ fontSize: 12, color: colors.text.dim }}>No stats yet.</p>
              ) : (
                <Section title="Mirror">
                  <Row label="Folders" value={`${mirrorStats.folders} (${mirrorStats.mappedFolders} mapped)`} mono />
                  <Row label="Files" value={`${mirrorStats.files}`} mono />
                  <Row
                    label="Extraction"
                    value={
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        <StatusPill label={`${mirrorStats.byExtractionStatus.complete} done`} tone={colors.accent.green} />
                        <StatusPill label={`${mirrorStats.byExtractionStatus.settling + mirrorStats.byExtractionStatus.processing} pending`} tone={colors.accent.orange} />
                        {mirrorStats.byExtractionStatus.error > 0 && (
                          <StatusPill label={`${mirrorStats.byExtractionStatus.error} error`} tone={colors.accent.red} />
                        )}
                      </span>
                    }
                  />
                  {status.lastSyncAt && (
                    <Row label="Last sync" value={new Date(status.lastSyncAt).toLocaleString()} mono />
                  )}
                </Section>
              )}
            </Panel>
          </div>
        )}

        {/* ── Corpus tree + folder→client mapping ───────────────── */}
        {status?.connected && status.rootFolderId && (
          <div style={{ marginTop: 24 }}>
            <Panel title="Folder mapping">
              <p style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.5, marginBottom: 14 }}>
                Map Drive folders to clients. A mapping establishes ownership so
                files imported from that folder (and its subfolders) file to the
                client. Mapping alone imports nothing — an unmapped folder costs
                nothing. Subfolders inherit their nearest mapped ancestor.
              </p>
              <DriveCorpusTree activeClients={activeClients ?? []} />
            </Panel>
          </div>
        )}

        {/* ── Extraction errors (collapsible) ───────────────────── */}
        {status?.connected && extractionErrors && extractionErrors.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Panel
              title={`Extraction errors (${extractionErrors.length})`}
              actions={
                <button
                  onClick={() => setErrorsOpen((o) => !o)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: colors.text.muted, cursor: "pointer", fontSize: 12 }}
                >
                  {errorsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {errorsOpen ? "Hide" : "Show"}
                </button>
              }
            >
              {errorsOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {extractionErrors.map((e) => (
                    <div
                      key={e.driveFileId}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: 10,
                        borderRadius: 4,
                        background: `${colors.accent.red}10`,
                        border: `1px solid ${colors.accent.red}30`,
                      }}
                    >
                      <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0, color: colors.accent.red }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{e.name}</div>
                        <div style={{ fontSize: 11, color: colors.text.dim, fontFamily: "ui-monospace, monospace" }}>{e.path}</div>
                        {e.extractionError && (
                          <div style={{ fontSize: 11, color: colors.accent.red, marginTop: 2 }}>{e.extractionError}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drive corpus tree + folder→client mapping ─────────────────────
// Drill-down browser over listFolderChildren. Each folder shows its effective
// client mapping (explicit = solid green chip with a clear affordance;
// inherited = muted chip) and a "Map" popover that assigns/clears the mapping
// via mapFolderToClient. This is THE operator mapping surface.
function DriveCorpusTree({
  activeClients,
}: {
  activeClients: { _id: Id<"clients">; name: string }[];
}) {
  const colors = useColors();
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [popoverFor, setPopoverFor] = useState<string | null>(null);

  const children = useQuery(api.driveSync.listFolderChildren, { parentFolderId: folderId });
  const mapFolder = useMutation(api.driveSync.mapFolderToClient);

  const breadcrumb = children?.breadcrumb ?? [];
  const folders = children?.folders ?? [];

  const handleMap = async (driveFolderId: string, clientId?: Id<"clients">) => {
    try {
      await mapFolder({ driveFolderId, clientId });
    } catch {
      /* surfaced by the reactive query re-render; keep the UI quiet */
    }
    setPopoverFor(null);
  };

  return (
    <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, overflow: "hidden" }}>
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexWrap: "wrap",
          padding: "8px 12px",
          borderBottom: `1px solid ${colors.border.light}`,
          minHeight: 38,
        }}
      >
        {breadcrumb.length > 1 && (
          <button
            onClick={() => {
              const parentIdx = breadcrumb.length - 2;
              setFolderId(parentIdx === 0 ? undefined : breadcrumb[parentIdx]?.driveFolderId);
            }}
            style={{ display: "inline-flex", alignItems: "center", background: "transparent", border: "none", color: colors.text.secondary, cursor: "pointer" }}
            title="Up one level"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        {breadcrumb.length === 0 ? (
          <span style={{ fontSize: 12, color: colors.text.dim }}>Drive</span>
        ) : (
          breadcrumb.map((b, i) => (
            <span key={b.driveFolderId} style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              {i > 0 && <ChevronRight size={12} style={{ color: colors.text.dim }} />}
              <button
                onClick={() => setFolderId(i === 0 ? undefined : b.driveFolderId)}
                style={{ fontSize: 12, color: i === breadcrumb.length - 1 ? colors.text.primary : colors.text.muted, background: "transparent", border: "none", cursor: "pointer", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {i === 0 ? (b.name || "Drive") : b.name}
              </button>
            </span>
          ))
        )}
      </div>

      {/* Folder list */}
      <div style={{ maxHeight: 360, overflow: "auto" }}>
        {children === undefined ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
            <Loader2 size={18} className="animate-spin" style={{ color: colors.text.dim }} />
          </div>
        ) : children.notConnected ? (
          <div style={{ padding: 16 }}>
            <EmptyState icon={<HardDrive className="w-8 h-8" />} title="Not connected" />
          </div>
        ) : folders.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: colors.text.muted }}>
            No subfolders here.
          </div>
        ) : (
          folders.map((f) => (
            <div
              key={f.driveFolderId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderBottom: `1px solid ${colors.border.light}`,
                position: "relative",
              }}
            >
              <button
                onClick={() => setFolderId(f.driveFolderId)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                title="Open folder"
              >
                <Folder size={16} style={{ color: colors.accent.yellow, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: colors.text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              </button>

              {/* Effective mapping chip */}
              {f.effectiveClientId && (
                f.isExplicitMapping ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <StatusPill label={f.effectiveClientName ?? "Mapped"} tone={colors.accent.green} />
                    <button
                      onClick={() => handleMap(f.driveFolderId, undefined)}
                      title="Clear mapping"
                      style={{ display: "inline-flex", background: "transparent", border: "none", color: colors.text.dim, cursor: "pointer" }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ) : (
                  <StatusPill label={`↑ ${f.effectiveClientName ?? "inherited"}`} tone={colors.text.muted} />
                )
              )}

              {/* Map popover trigger */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setPopoverFor(popoverFor === f.driveFolderId ? null : f.driveFolderId)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, padding: "3px 8px", borderRadius: 3, background: colors.bg.cardAlt, border: `1px solid ${colors.border.default}`, color: colors.text.secondary, cursor: "pointer" }}
                >
                  <Link2 size={12} />
                  {f.isExplicitMapping ? "Change" : "Map"}
                </button>
                {popoverFor === f.driveFolderId && (
                  <MapToClientPopover
                    activeClients={activeClients}
                    onSelect={(clientId) => handleMap(f.driveFolderId, clientId)}
                    onClear={f.isExplicitMapping ? () => handleMap(f.driveFolderId, undefined) : undefined}
                    onClose={() => setPopoverFor(null)}
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Client picker popover for folder mapping.
function MapToClientPopover({
  activeClients,
  onSelect,
  onClear,
  onClose,
}: {
  activeClients: { _id: Id<"clients">; name: string }[];
  onSelect: (clientId: Id<"clients">) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const filtered = activeClients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 4,
        width: 240,
        zIndex: 50,
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        padding: 6,
      }}
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search clients…"
        style={{
          width: "100%",
          fontSize: 12,
          padding: "6px 8px",
          marginBottom: 6,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 3,
          background: colors.bg.light,
          color: colors.text.primary,
        }}
      />
      <div style={{ maxHeight: 220, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: colors.text.dim, padding: "6px 8px" }}>No clients</div>
        ) : (
          filtered.map((c) => (
            <button
              key={c._id}
              onClick={() => onSelect(c._id)}
              style={{ display: "block", width: "100%", textAlign: "left", fontSize: 12, padding: "6px 8px", borderRadius: 3, background: "transparent", border: "none", color: colors.text.secondary, cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {c.name}
            </button>
          ))
        )}
      </div>
      {onClear && (
        <>
          <div style={{ height: 1, background: colors.border.light, margin: "6px 0" }} />
          <button
            onClick={onClear}
            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", fontSize: 12, padding: "6px 8px", borderRadius: 3, background: "transparent", border: "none", color: colors.accent.red, cursor: "pointer" }}
          >
            <X size={12} />
            Clear mapping
          </button>
        </>
      )}
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
