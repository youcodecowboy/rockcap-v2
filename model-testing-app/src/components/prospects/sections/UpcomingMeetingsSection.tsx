"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatusSection } from "../StatusSection";
import { Calendar, Users, MapPin } from "lucide-react";

// v1.3 Sprint C — "Upcoming meetings" section at the top of /prospects.
// Operator's morning queue: what calls are coming up across all prospects
// and clients. Click a row → routes to that client's detail page Meetings
// tab.
//
// Mirrors the "Replies awaiting triage" section pattern from Sprint A.

const TYPE_DOT_COLOR: Record<string, string> = {
  kickoff: "#22c55e",
  progress: "#3b82f6",
  review: "#a855f7",
  site_visit: "#eab308",
  call: "#9a9a9a",
  other: "#9a9a9a",
};

function friendlyDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  if (diffHours < 1) return `In <1h · ${time}`;
  if (diffHours < 24) return `In ${diffHours}h · ${time}`;
  if (diffDays === 0) return `Today · ${time}`;
  if (diffDays === 1) return `Tomorrow · ${time}`;
  if (diffDays < 7) return `${d.toLocaleDateString("en-GB", { weekday: "long" })} · ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${time}`;
}

export function UpcomingMeetingsSection() {
  const colors = useColors();
  const router = useRouter();
  const rows = (useQuery(api.meetings.listUpcoming, { limit: 25 }) ?? []) as any[];

  return (
    <StatusSection
      title="Upcoming meetings"
      count={`${rows.length} on the schedule`}
      dotColor={colors.entityTypes.client}
      defaultExpanded={rows.length > 0}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)} />
            <th style={thStyle(colors)}>When</th>
            <th style={thStyle(colors)}>Meeting</th>
            <th style={thStyle(colors)}>Type</th>
            <th style={thStyle(colors)}>Attendees</th>
            <th style={thStyle(colors)}>Open items</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...tdStyle(colors), color: colors.text.muted, textAlign: "center", padding: "20px 14px" }}>
                <Calendar size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                No upcoming meetings. Schedule one via the meeting-prep responder (auto-fires on book_meeting reply intent) or manually via Claude Code with{" "}
                <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, background: colors.bg.cardAlt, padding: "1px 5px", borderRadius: 3 }}>meeting.create</code>.
              </td>
            </tr>
          )}
          {rows.map((m) => {
            const dotColor = TYPE_DOT_COLOR[m.meetingType ?? "other"] ?? TYPE_DOT_COLOR.other;
            const pendingActions = (m.actionItems ?? []).filter((a: any) => a.status === "pending").length;
            return (
              <tr
                key={m._id}
                onClick={() => router.push(`/prospects/${m.clientId}`)}
                style={{ cursor: "pointer" }}
              >
                <td style={tdStyle(colors)}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
                </td>
                <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, whiteSpace: "nowrap" as const }}>
                  {friendlyDate(m.meetingDate)}
                </td>
                <td style={tdStyle(colors)}>
                  <div style={{ color: colors.text.primary, fontWeight: 500 }}>{m.title}</div>
                </td>
                <td style={{ ...tdStyle(colors), fontSize: 10, color: colors.text.secondary, textTransform: "capitalize" as const }}>
                  {(m.meetingType ?? "other").replace(/_/g, " ")}
                </td>
                <td style={{ ...tdStyle(colors), fontSize: 10, color: colors.text.muted }}>
                  {m.attendees?.length > 0 ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Users size={10} />
                      {m.attendees.length}
                    </span>
                  ) : (
                    <span style={{ color: colors.text.dim }}>—</span>
                  )}
                </td>
                <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", fontSize: 10, textAlign: "center" as const }}>
                  {pendingActions > 0 ? (
                    <span style={{ color: colors.accent.yellow, fontWeight: 500 }}>{pendingActions}</span>
                  ) : (
                    <span style={{ color: colors.text.dim }}>0</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </StatusSection>
  );
}

function thStyle(colors: any) {
  return {
    textAlign: "left" as const,
    fontFamily: "ui-monospace, monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.text.muted,
    fontWeight: 400,
    padding: "8px 14px",
    borderBottom: `1px solid ${colors.border.default}`,
    background: colors.bg.cardAlt,
  };
}

function tdStyle(colors: any) {
  return {
    padding: "10px 14px",
    borderBottom: `1px solid ${colors.border.light}`,
    fontSize: 11,
    color: colors.text.primary,
    verticalAlign: "middle" as const,
  };
}
