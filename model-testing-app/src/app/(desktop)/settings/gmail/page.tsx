"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
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
import { ArrowLeft, AlertTriangle, Mail } from "lucide-react";

// Gmail settings page.
// Per docs/INTEGRATIONS/gmail-scoping.md confirmed decisions:
// - Separate OAuth client from Calendar (BL-4.1)
// - Scope: send + modify (BL-4)
// - Approval-gated send default (BL-4.4): per-user sendEnabled defaults
//   off; global gmailSendConfig.isEnabled defaults off. Both must be on.

function GmailSettingsInner() {
  const colors = useColors();
  const status = useQuery(api.gmailTokens.getConnectionStatus as any);
  const sendConfig = useQuery(api.gmailTokens.getSendConfig as any);
  const setMySendEnabled = useMutation(api.gmailTokens.setMySendEnabled as any);

  const params = useSearchParams();
  const callbackState = params.get("gmail");

  const [disconnecting, setDisconnecting] = useState(false);
  const [togglingSend, setTogglingSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!callbackState) return;
    if (callbackState === "success") {
      setSuccessMessage("Gmail connected.");
    } else if (callbackState === "denied") {
      setError("Gmail consent was declined. You can try again at any time.");
    } else if (callbackState === "error") {
      setError("Gmail connection failed. Check the OAuth setup and try again.");
    }
  }, [callbackState]);

  const handleDisconnect = async () => {
    setError(null);
    setSuccessMessage(null);
    setDisconnecting(true);
    try {
      const res = await fetch("/api/gmail/disconnect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to disconnect Gmail.");
        return;
      }
      setSuccessMessage("Gmail disconnected.");
    } catch (e: any) {
      setError(e?.message || "Unexpected error disconnecting Gmail.");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleToggleSend = async () => {
    if (!status?.connected) return;
    setError(null);
    setSuccessMessage(null);
    setTogglingSend(true);
    try {
      await setMySendEnabled({ enabled: !status.sendEnabled });
    } catch (e: any) {
      setError(e?.message || "Failed to toggle send enable.");
    } finally {
      setTogglingSend(false);
    }
  };

  const loading = status === undefined;

  const globalSendOn = sendConfig?.isEnabled === true;
  const userSendOn = status?.connected && status.sendEnabled === true;
  const sendActuallyWorks = globalSendOn && userSendOn && status?.needsReconnect !== true;

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
            Gmail Integration
          </h1>
          <p style={{ marginTop: 8, fontSize: 13, color: colors.text.secondary, lineHeight: 1.5 }}>
            Connect your Gmail account so inbound and outbound emails flow into
            the touchpoint history. Sending from skills is gated behind two
            switches: your own per-account opt-in, and an admin-controlled
            global switch. Both must be on.
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
              Gmail uses Google OAuth. Connecting opens a Google consent screen
              and requests permission to send mail and modify messages (labels,
              archive, mark read). Disconnecting clears the local connection;
              you can also revoke access from your Google account settings.
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
                        <Mail size={14} style={{ color: colors.text.dim }} />
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
                      Gmail token has expired or been revoked. Reconnect to
                      restore syncing.
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <a href="/api/gmail/auth">
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
                  Open Google's consent screen below. Gmail uses its own OAuth
                  client, separate from Google Calendar; connecting Gmail will
                  not affect your Calendar connection.
                </p>
                <div>
                  <a href="/api/gmail/auth">
                    <Button variant="primary">Connect Gmail</Button>
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
          <Panel title="Outbound send">
            <p style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.5, marginBottom: 14 }}>
              Two switches gate skill-originated outbound email. The global
              switch is admin-controlled; the per-account switch is yours.
              Both must be on for any skill to send mail from your address.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  padding: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    Your account
                  </div>
                  <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                    Opt your own account in or out of skill-originated send.
                  </div>
                </div>
                <Button
                  onClick={handleToggleSend}
                  variant={status.sendEnabled ? "secondary" : "primary"}
                  disabled={togglingSend}
                >
                  {togglingSend
                    ? "Saving"
                    : status.sendEnabled
                    ? "Disable send for my account"
                    : "Enable send for my account"}
                </Button>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  padding: 12,
                  background: colors.bg.light,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    Global send
                  </div>
                  <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                    Admin-controlled. If off, no skill can send from any
                    account, even if individual users have opted in.
                  </div>
                </div>
                <StatusPill
                  label={globalSendOn ? "on" : "off"}
                  tone={globalSendOn ? colors.accent.green : colors.text.dim}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: sendActuallyWorks ? colors.accent.green : colors.accent.yellow,
                  background: `${sendActuallyWorks ? colors.accent.green : colors.accent.yellow}15`,
                  border: `1px solid ${(sendActuallyWorks ? colors.accent.green : colors.accent.yellow)}40`,
                  borderRadius: 4,
                  padding: 12,
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                {sendActuallyWorks ? (
                  "Skills can send mail from your address."
                ) : (
                  <span>
                    Skill send is currently blocked.{" "}
                    {!globalSendOn && "Global send is off. "}
                    {globalSendOn && !userSendOn && "Your account opt-in is off. "}
                    {status.needsReconnect && "Reconnect Gmail. "}
                  </span>
                )}
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

export default function GmailSettingsPage() {
  return (
    <Suspense fallback={<SkeletonText lines={4} />}>
      <GmailSettingsInner />
    </Suspense>
  );
}
