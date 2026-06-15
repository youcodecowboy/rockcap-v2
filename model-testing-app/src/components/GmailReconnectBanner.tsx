"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { AlertTriangle } from "lucide-react";

// App-wide alarm banner for a stale Gmail connection. A connected account
// whose OAuth token has expired or been revoked (needsReconnect) silently
// stops sending — outbound approvals fail at execution time with "token needs
// reconnect". Operators had no signal until they dug into /approvals errors,
// so this pins a red bar under the nav bar on every desktop screen until they
// reconnect. A never-connected account is intentionally NOT alarmed here
// (that is a setup step at /settings/gmail, not a regression).
export default function GmailReconnectBanner() {
  const colors = useColors();
  const status = useQuery(api.gmailTokens.getConnectionStatus, {});

  if (!status || !status.connected || status.needsReconnect !== true) {
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        position: "sticky",
        top: 64, // sits directly under the fixed h-16 NavigationBar
        zIndex: 15,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 24px",
        background: colors.accent.red,
        color: "#ffffff",
        fontSize: 13,
        fontWeight: 500,
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        Gmail needs reconnecting — outgoing emails
        {status.connectedEmail ? ` from ${status.connectedEmail}` : ""} will not
        send until you reconnect.
      </span>
      <a
        href="/api/gmail/auth"
        style={{
          flexShrink: 0,
          padding: "6px 14px",
          borderRadius: 4,
          background: "#ffffff",
          color: colors.accent.red,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Reconnect Gmail
      </a>
    </div>
  );
}
