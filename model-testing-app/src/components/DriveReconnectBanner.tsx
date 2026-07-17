"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { AlertTriangle } from "lucide-react";

// App-wide alarm banner for a stale Google Drive connection. Drive is a single
// org-wide connection; when its OAuth token expires or is revoked
// (needsReconnect) the changes poller and hydration worker silently stop, so
// imported files stop syncing and no new files can be imported. This pins a red
// bar under the nav bar until an operator reconnects. A never-connected account
// is intentionally NOT alarmed (that is a setup step at /settings/drive). Sits
// below GmailReconnectBanner (both are sticky; they stack in DOM order).
export default function DriveReconnectBanner() {
  const colors = useColors();
  const status = useQuery(api.driveTokens.getConnectionStatus, {});

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
        Google Drive needs reconnecting — file syncing
        {status.connectedEmail ? ` for ${status.connectedEmail}` : ""} is paused
        until you reconnect.
      </span>
      <a
        href="/settings/drive"
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
        Reconnect Drive
      </a>
    </div>
  );
}
