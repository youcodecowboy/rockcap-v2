"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import {
  Panel,
  Button,
  Field,
  Input,
  StatusPill,
  EmptyState,
  Skeleton,
  IconButton,
} from "@/components/layouts";
import {
  ArrowLeft,
  Key,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

// MCP token management UI (BL-5.9).
// Per-user opaque tokens for Claude Code to authenticate against the
// MCP server (convex/mcp.ts). The plaintext is shown once at mint time
// and never re-exposed; only the hash and a display prefix persist.

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export default function McpTokenSettingsPage() {
  const colors = useColors();
  const tokens = useQuery(api.mcpTokens.listMyTokens as any);
  const mintToken = useAction(api.mcpTokens.mintToken as any);
  const revokeToken = useMutation(api.mcpTokens.revokeToken as any);
  const deleteRevoked = useMutation(api.mcpTokens.deleteRevokedToken as any);

  const [newTokenName, setNewTokenName] = useState("");
  const [minting, setMinting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMint = async () => {
    setError(null);
    if (!newTokenName.trim()) {
      setError("Give the token a label (e.g., 'My MacBook') so you can recognise it later.");
      return;
    }
    setMinting(true);
    try {
      const result = await mintToken({ name: newTokenName.trim() });
      setMintedToken(result.token);
      setNewTokenName("");
    } catch (e: any) {
      setError(e?.message || "Failed to mint token");
    } finally {
      setMinting(false);
    }
  };

  const handleCopy = () => {
    if (!mintedToken) return;
    navigator.clipboard.writeText(mintedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async (tokenId: string) => {
    if (!confirm("Revoke this token? Any device using it will lose access immediately.")) return;
    setRevokingId(tokenId);
    try {
      await revokeToken({ tokenId });
    } catch (e: any) {
      alert(e?.message || "Failed to revoke token");
    } finally {
      setRevokingId(null);
    }
  };

  const handleDelete = async (tokenId: string) => {
    if (!confirm("Permanently delete this revoked token from the list?")) return;
    setRevokingId(tokenId);
    try {
      await deleteRevoked({ tokenId });
    } catch (e: any) {
      alert(e?.message || "Failed to delete token");
    } finally {
      setRevokingId(null);
    }
  };

  const loading = tokens === undefined;
  const activeTokens = tokens?.filter((t: any) => !t.revokedAt) ?? [];
  const revokedTokens = tokens?.filter((t: any) => t.revokedAt) ?? [];

  const codeChip = (text: string) => (
    <code
      style={{
        fontFamily: MONO,
        fontSize: 10,
        background: colors.bg.cardAlt,
        border: `1px solid ${colors.border.light}`,
        padding: "1px 4px",
        borderRadius: 2,
        color: colors.text.secondary,
      }}
    >
      {text}
    </code>
  );

  return (
    <div style={{ background: colors.bg.light, minHeight: "100vh" }}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link
            href="/settings"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: colors.text.muted, textDecoration: "none" }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Back to settings
          </Link>
        </div>

        <div className="mb-8 flex items-center gap-3">
          <Key style={{ width: 22, height: 22, color: colors.text.muted }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary }}>MCP Tokens</h1>
            <p style={{ marginTop: 4, fontSize: 12, color: colors.text.muted, maxWidth: 620 }}>
              Personal access tokens for Claude Code to authenticate against the RockCap MCP server.
              Each token grants the same access as your account. Generate one per device. Tokens are
              shown in full only at mint time; if lost, generate a new one and revoke the old.
            </p>
          </div>
        </div>

        {/* Mint new token */}
        <div style={{ marginBottom: 24 }}>
          <Panel title="Generate a new token">
            <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
              Give the token a label so you can identify it later. The plaintext is shown once,
              so copy it into Claude Code straight away.
            </p>
            {!mintedToken ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Token label" error={error ?? undefined}>
                  <Input
                    type="text"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    placeholder="e.g., My MacBook, Office desktop"
                    disabled={minting}
                  />
                </Field>
                <div>
                  <Button variant="primary" onClick={handleMint} disabled={minting || !newTokenName.trim()}>
                    {minting ? (
                      <>
                        <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                        Generating
                      </>
                    ) : (
                      <>
                        <Plus style={{ width: 14, height: 14 }} />
                        Generate token
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    color: colors.accent.orange,
                    background: `${colors.accent.orange}15`,
                    border: `1px solid ${colors.accent.orange}40`,
                    borderRadius: 4,
                    padding: 12,
                    fontSize: 12,
                  }}
                >
                  <AlertTriangle style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>Copy this token now</div>
                    <div style={{ color: colors.text.secondary }}>
                      It is shown only once. If you close this page without copying, you will need
                      to revoke this token and generate a new one.
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code
                    style={{
                      flex: 1,
                      fontFamily: MONO,
                      fontSize: 12,
                      background: colors.text.primary,
                      color: colors.bg.card,
                      borderRadius: 4,
                      padding: "8px 12px",
                      wordBreak: "break-all",
                    }}
                  >
                    {mintedToken}
                  </code>
                  <Button onClick={handleCopy} variant="secondary" size="sm">
                    {copied ? (
                      <>
                        <CheckCircle2 style={{ width: 14, height: 14, color: colors.accent.green }} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy style={{ width: 14, height: 14 }} />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.6 }}>
                  Paste this into your Claude Code settings under {codeChip("mcpServers.rockcap.headers.Authorization")} as {codeChip("Bearer {token}")}. See {codeChip("skills/SETUP.md")} for the full configuration.
                </div>
                <div>
                  <Button onClick={() => setMintedToken(null)} variant="secondary">
                    Done
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* Active tokens */}
        <div style={{ marginBottom: 24 }}>
          <Panel title="Active tokens">
            <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
              Tokens currently usable for MCP requests. Revoking a token blocks it immediately.
            </p>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton height={40} />
                <Skeleton height={40} />
              </div>
            ) : activeTokens.length === 0 ? (
              <EmptyState
                icon={<Key size={20} />}
                title="No active tokens"
                body="Generate one above to connect Claude Code."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {activeTokens.map((token: any, i: number) => (
                  <div
                    key={token._id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "12px 0",
                      borderBottom: i === activeTokens.length - 1 ? "none" : `1px solid ${colors.border.light}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{token.name}</div>
                      <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                        <code style={{ fontFamily: MONO }}>{token.tokenPrefix}...</code>
                        <span style={{ margin: "0 8px" }}>·</span>
                        Created {new Date(token.createdAt).toLocaleDateString()}
                        {token.lastUsedAt ? (
                          <>
                            <span style={{ margin: "0 8px" }}>·</span>
                            Last used {new Date(token.lastUsedAt).toLocaleString()}
                          </>
                        ) : (
                          <>
                            <span style={{ margin: "0 8px" }}>·</span>
                            <span style={{ color: colors.text.dim }}>never used</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleRevoke(token._id)}
                      disabled={revokingId === token._id}
                      variant="secondary"
                      size="sm"
                    >
                      {revokingId === token._id ? (
                        <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                      ) : (
                        "Revoke"
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Revoked tokens (allow deletion to clean up the list) */}
        {revokedTokens.length > 0 && (
          <Panel title="Revoked tokens">
            <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
              Tokens that were revoked. Kept for audit; can be deleted to clean up the list.
            </p>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {revokedTokens.map((token: any, i: number) => (
                <div
                  key={token._id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 0",
                    opacity: 0.6,
                    borderBottom: i === revokedTokens.length - 1 ? "none" : `1px solid ${colors.border.light}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                      {token.name}
                      <StatusPill label="revoked" tone={colors.text.dim} />
                    </div>
                    <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                      <code style={{ fontFamily: MONO }}>{token.tokenPrefix}...</code>
                      <span style={{ margin: "0 8px" }}>·</span>
                      Revoked {token.revokedAt && new Date(token.revokedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <IconButton
                    label="Delete token"
                    onClick={() => handleDelete(token._id)}
                    disabled={revokingId === token._id}
                  >
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </IconButton>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
