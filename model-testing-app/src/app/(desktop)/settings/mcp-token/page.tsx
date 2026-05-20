"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export default function McpTokenSettingsPage() {
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
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Key className="w-6 h-6" />
            MCP Tokens
          </h1>
          <p className="mt-2 text-gray-600">
            Personal access tokens for Claude Code to authenticate against the RockCap MCP server.
            Each token grants the same access as your account. Generate one per device. Tokens are
            shown in full only at mint time; if lost, generate a new one and revoke the old.
          </p>
        </div>

        {/* Mint new token */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Generate a new token</CardTitle>
            <CardDescription>
              Give the token a label so you can identify it later. The plaintext is shown once,
              so copy it into Claude Code straight away.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!mintedToken ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Token label
                </label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="e.g., My MacBook, Office desktop"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  disabled={minting}
                />
                <Button onClick={handleMint} disabled={minting || !newTokenName.trim()}>
                  {minting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Generating
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Generate token
                    </>
                  )}
                </Button>
                {error && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                    {error}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-1">Copy this token now</div>
                    <div>
                      It is shown only once. If you close this page without copying, you will need
                      to revoke this token and generate a new one.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-sm bg-gray-900 text-gray-100 rounded px-3 py-2 break-all">
                    {mintedToken}
                  </code>
                  <Button onClick={handleCopy} variant="outline" size="sm">
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="text-sm text-gray-600">
                  Paste this into your Claude Code settings under{" "}
                  <code className="font-mono text-xs bg-gray-100 px-1 rounded">
                    mcpServers.rockcap.headers.Authorization
                  </code>{" "}
                  as <code className="font-mono text-xs bg-gray-100 px-1 rounded">Bearer {"{token}"}</code>.
                  See <code className="font-mono text-xs bg-gray-100 px-1 rounded">skills/SETUP.md</code> for the full configuration.
                </div>
                <Button onClick={() => setMintedToken(null)} variant="outline">
                  Done
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active tokens */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Active tokens</CardTitle>
            <CardDescription>
              Tokens currently usable for MCP requests. Revoking a token blocks it immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-gray-500 flex items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </div>
            ) : activeTokens.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center">
                No active tokens. Generate one above to connect Claude Code.
              </div>
            ) : (
              <div className="divide-y">
                {activeTokens.map((token: any) => (
                  <div key={token._id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{token.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        <code className="font-mono">{token.tokenPrefix}...</code>
                        <span className="mx-2">·</span>
                        Created {new Date(token.createdAt).toLocaleDateString()}
                        {token.lastUsedAt ? (
                          <>
                            <span className="mx-2">·</span>
                            Last used {new Date(token.lastUsedAt).toLocaleString()}
                          </>
                        ) : (
                          <>
                            <span className="mx-2">·</span>
                            <span className="text-gray-400">never used</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleRevoke(token._id)}
                      disabled={revokingId === token._id}
                      variant="outline"
                      size="sm"
                    >
                      {revokingId === token._id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Revoke"
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revoked tokens (allow deletion to clean up the list) */}
        {revokedTokens.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Revoked tokens</CardTitle>
              <CardDescription>
                Tokens that were revoked. Kept for audit; can be deleted to clean up the list.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {revokedTokens.map((token: any) => (
                  <div key={token._id} className="py-3 flex items-center justify-between gap-3 opacity-60">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {token.name}
                        <Badge variant="outline" className="ml-2">
                          revoked
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        <code className="font-mono">{token.tokenPrefix}...</code>
                        <span className="mx-2">·</span>
                        Revoked {token.revokedAt && new Date(token.revokedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleDelete(token._id)}
                      disabled={revokingId === token._id}
                      variant="ghost"
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
