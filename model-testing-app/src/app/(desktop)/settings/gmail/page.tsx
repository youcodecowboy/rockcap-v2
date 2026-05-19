"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, AlertTriangle, Mail } from "lucide-react";

// Gmail settings page.
// Per docs/INTEGRATIONS/gmail-scoping.md confirmed decisions:
// - Separate OAuth client from Calendar (BL-4.1)
// - Scope: send + modify (BL-4)
// - Approval-gated send default (BL-4.4): per-user sendEnabled defaults
//   off; global gmailSendConfig.isEnabled defaults off. Both must be on.

export default function GmailSettingsPage() {
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
          <h1 className="text-2xl font-semibold text-gray-900">Gmail Integration</h1>
          <p className="mt-2 text-gray-600">
            Connect your Gmail account so inbound and outbound emails flow into
            the touchpoint history. Sending from skills is gated behind two
            switches: your own per-account opt-in, and an admin-controlled
            global switch. Both must be on.
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
              Gmail uses Google OAuth. Connecting opens a Google consent screen
              and requests permission to send mail and modify messages (labels,
              archive, mark read). Disconnecting clears the local connection;
              you can also revoke access from your Google account settings.
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
                <div>
                  <div className="text-gray-500">Connected account</div>
                  <div className="font-medium text-gray-900 flex items-center">
                    <Mail className="w-4 h-4 mr-2 text-gray-400" />
                    {status.connectedEmail}
                  </div>
                </div>
                {status.connectedAt && (
                  <div>
                    <div className="text-gray-500">Connected on</div>
                    <div className="text-gray-900">
                      {new Date(status.connectedAt).toLocaleString()}
                    </div>
                  </div>
                )}
                {status.scope && (
                  <div>
                    <div className="text-gray-500">Granted scopes</div>
                    <div className="text-xs font-mono text-gray-700 break-all">
                      {status.scope}
                    </div>
                  </div>
                )}
                {status.needsReconnect && (
                  <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      Gmail token has expired or been revoked. Reconnect to
                      restore syncing.
                    </div>
                  </div>
                )}
                <div className="pt-3 flex items-center gap-2">
                  <Button asChild variant="outline">
                    <a href="/api/gmail/auth">Reconnect</a>
                  </Button>
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
                <p className="text-sm text-gray-600">
                  Click below to open Google's consent screen. Gmail uses its
                  own OAuth client, separate from Google Calendar; connecting
                  Gmail will not affect your Calendar connection.
                </p>
                <Button asChild>
                  <a href="/api/gmail/auth">Connect Gmail</a>
                </Button>
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

        {status?.connected && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Outbound send</CardTitle>
              <CardDescription>
                Two switches gate skill-originated outbound email. The global
                switch is admin-controlled; the per-account switch is yours.
                Both must be on for any skill to send mail from your address.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between border rounded p-3">
                  <div>
                    <div className="font-medium text-sm">Your account</div>
                    <div className="text-xs text-gray-500">
                      Opt your own account in or out of skill-originated send.
                    </div>
                  </div>
                  <Button
                    onClick={handleToggleSend}
                    variant={status.sendEnabled ? "outline" : "default"}
                    disabled={togglingSend}
                  >
                    {togglingSend ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Saving
                      </>
                    ) : status.sendEnabled ? (
                      "Disable send for my account"
                    ) : (
                      "Enable send for my account"
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between border rounded p-3 bg-gray-50">
                  <div>
                    <div className="font-medium text-sm">Global send</div>
                    <div className="text-xs text-gray-500">
                      Admin-controlled. If off, no skill can send from any
                      account, even if individual users have opted in.
                    </div>
                  </div>
                  {globalSendOn ? (
                    <Badge variant="default" className="bg-emerald-600">on</Badge>
                  ) : (
                    <Badge variant="outline">off</Badge>
                  )}
                </div>
                <div
                  className={
                    sendActuallyWorks
                      ? "flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3"
                      : "flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3"
                  }
                >
                  {sendActuallyWorks ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Skills can send mail from your address.
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      Skill send is currently blocked.{" "}
                      {!globalSendOn && "Global send is off. "}
                      {globalSendOn && !userSendOn && "Your account opt-in is off. "}
                      {status.needsReconnect && "Reconnect Gmail. "}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
