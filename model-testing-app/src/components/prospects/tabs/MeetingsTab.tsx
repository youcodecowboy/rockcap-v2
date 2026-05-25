"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { Calendar, Users, CheckSquare, FileText, MapPin, Clock } from "lucide-react";

interface MeetingsTabProps {
  prospect: any;
}

// v1.3 Sprint C — Meetings tab. Lists all meetings linked to this client
// (upcoming + past), with full expandable detail for any specific meeting
// (attendees, decisions, action items, summary).
//
// Data source: api.meetings.getByClient — returns newest first. We split
// client-side into upcoming vs past based on meetingDate.

const TYPE_LABELS: Record<string, { label: string; color: "blue" | "green" | "yellow" | "purple" | "grey" }> = {
  kickoff: { label: "Kickoff", color: "green" },
  progress: { label: "Progress", color: "blue" },
  review: { label: "Review", color: "purple" },
  site_visit: { label: "Site visit", color: "yellow" },
  call: { label: "Call", color: "grey" },
  other: { label: "Other", color: "grey" },
};

export function MeetingsTab({ prospect }: MeetingsTabProps) {
  const colors = useColors();
  const meetings = useQuery(
    api.meetings.getByClient,
    prospect ? { clientId: prospect._id, limit: 100 } : "skip",
  ) ?? [];

  const nowIso = new Date().toISOString();
  const upcoming = meetings.filter((m: any) => m.meetingDate >= nowIso)
    .sort((a: any, b: any) => a.meetingDate.localeCompare(b.meetingDate));
  const past = meetings.filter((m: any) => m.meetingDate < nowIso)
    .sort((a: any, b: any) => b.meetingDate.localeCompare(a.meetingDate));

  if (meetings.length === 0) {
    return (
      <div
        style={{
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          padding: 24,
          color: colors.text.muted,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Calendar size={14} />
          <strong style={{ color: colors.text.primary }}>No meetings yet</strong>
        </div>
        Meetings get created via the meeting-prep skill's responder mode (when a reply intent is{" "}
        <code style={codeStyle(colors)}>book_meeting</code>) OR via Claude Code with{" "}
        <code style={codeStyle(colors)}>meeting.create({"{"} clientId, title, meetingDate, attendees {"}"})</code>.
        Post-meeting, the meeting-capture skill ingests transcripts/notes to populate decisions + action items.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 14, fontSize: 11, color: colors.text.muted }}>
        {upcoming.length} upcoming · {past.length} past · {meetings.length} total
      </div>

      {upcoming.length > 0 && (
        <>
          <SectionLabel colors={colors}>Upcoming ({upcoming.length})</SectionLabel>
          {upcoming.map((m: any) => (
            <MeetingCard key={m._id} meeting={m} colors={colors} isUpcoming={true} />
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionLabel colors={colors} style={{ marginTop: upcoming.length > 0 ? 24 : 0 }}>
            Past ({past.length})
          </SectionLabel>
          {past.map((m: any) => (
            <MeetingCard key={m._id} meeting={m} colors={colors} isUpcoming={false} />
          ))}
        </>
      )}
    </div>
  );
}

function MeetingCard({ meeting, colors, isUpcoming }: { meeting: any; colors: any; isUpcoming: boolean }) {
  const typeMeta = TYPE_LABELS[meeting.meetingType ?? "other"] ?? TYPE_LABELS.other;
  const typeColor = typePillColor(typeMeta.color, colors);
  const pendingActions = (meeting.actionItems ?? []).filter((a: any) => a.status === "pending");
  const hasContent = !!meeting.summary || (meeting.keyPoints ?? []).length > 0 || (meeting.decisions ?? []).length > 0;

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderLeft: `3px solid ${isUpcoming ? colors.accent.blue : colors.text.dim}`,
        borderRadius: 4,
        marginBottom: 12,
        background: colors.bg.card,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: hasContent || meeting.attendees?.length > 0 ? `1px solid ${colors.border.default}` : "none",
          background: colors.bg.light,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <Calendar size={13} color={colors.text.muted} />
            <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
              {meeting.title}
            </span>
            <Pill bg={typeColor.bg} fg={typeColor.fg} border={typeColor.border}>
              {typeMeta.label}
            </Pill>
            {meeting.verified && (
              <Pill bg={`${colors.accent.green}15`} fg={colors.accent.green} border={`${colors.accent.green}40`}>
                verified
              </Pill>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted }}>
            <Clock size={10} />
            {meeting.meetingDate?.slice(0, 16).replace("T", " ") ?? "—"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10, color: colors.text.muted }}>
          {meeting.attendees?.length > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Users size={10} />
              {meeting.attendees.length} attendee{meeting.attendees.length === 1 ? "" : "s"}
            </span>
          )}
          {pendingActions.length > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: colors.accent.yellow, fontWeight: 500 }}>
              <CheckSquare size={10} />
              {pendingActions.length} open
            </span>
          )}
        </div>
      </div>

      {/* Body — attendees + summary + key points + decisions + action items */}
      {(meeting.attendees?.length > 0 || hasContent) && (
        <div style={{ padding: 14, fontSize: 11, color: colors.text.primary, lineHeight: 1.6 }}>
          {meeting.attendees?.length > 0 && (
            <div style={{ marginBottom: hasContent ? 12 : 0 }}>
              <FieldLabel colors={colors}>Attendees</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {meeting.attendees.map((a: any, i: number) => (
                  <span
                    key={i}
                    style={{
                      padding: "2px 8px",
                      background: colors.bg.cardAlt,
                      border: `1px solid ${colors.border.light}`,
                      borderRadius: 2,
                      fontSize: 10,
                      color: colors.text.secondary,
                    }}
                  >
                    {a.name}
                    {a.role && <span style={{ color: colors.text.dim }}> ({a.role})</span>}
                    {a.company && <span style={{ color: colors.text.muted, marginLeft: 4 }}>· {a.company}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {meeting.summary && (
            <div style={{ marginBottom: 12 }}>
              <FieldLabel colors={colors}>Summary</FieldLabel>
              <div style={{ color: colors.text.primary, whiteSpace: "pre-wrap" as const }}>{meeting.summary}</div>
            </div>
          )}

          {meeting.keyPoints?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <FieldLabel colors={colors}>Key points</FieldLabel>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {meeting.keyPoints.map((p: string, i: number) => (
                  <li key={i} style={{ marginBottom: 3 }}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {meeting.decisions?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <FieldLabel colors={colors}>Decisions</FieldLabel>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {meeting.decisions.map((d: string, i: number) => (
                  <li key={i} style={{ marginBottom: 3 }}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {meeting.actionItems?.length > 0 && (
            <div>
              <FieldLabel colors={colors}>Action items ({pendingActions.length}/{meeting.actionItems.length} open)</FieldLabel>
              <div>
                {meeting.actionItems.map((a: any, i: number) => (
                  <div
                    key={a.id ?? i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "4px 0",
                      fontSize: 11,
                      opacity: a.status === "completed" ? 0.6 : 1,
                      textDecoration: a.status === "completed" ? "line-through" : "none",
                    }}
                  >
                    <CheckSquare
                      size={11}
                      style={{ marginTop: 2 }}
                      color={a.status === "completed" ? colors.accent.green : colors.text.muted}
                    />
                    <div style={{ flex: 1 }}>
                      <div>{a.description}</div>
                      {(a.assignee || a.dueDate) && (
                        <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                          {a.assignee && <span>@{a.assignee}</span>}
                          {a.assignee && a.dueDate && " · "}
                          {a.dueDate && <span>due {a.dueDate.slice(0, 10)}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasContent && meeting.attendees?.length === 0 && (
            <div style={{ fontStyle: "italic", color: colors.text.muted }}>
              <FileText size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              {isUpcoming
                ? "Scheduled — notes will populate after the meeting via meeting-capture."
                : "No notes captured. Run meeting-capture in Claude Code with a Fireflies transcript or pasted notes."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children, colors }: { children: React.ReactNode; colors: any }) {
  return (
    <div
      style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: 9,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: colors.text.muted,
        marginBottom: 4,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, colors, style }: { children: React.ReactNode; colors: any; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: colors.text.muted,
        marginBottom: 8,
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function typePillColor(color: string, colors: any): { bg: string; fg: string; border: string } {
  switch (color) {
    case "green":
      return { bg: "#dcfce7", fg: "#166534", border: "#86efac" };
    case "blue":
      return { bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" };
    case "yellow":
      return { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" };
    case "purple":
      return { bg: "#f3e8ff", fg: "#6b21a8", border: "#d8b4fe" };
    default:
      return { bg: colors.bg.cardAlt, fg: colors.text.muted, border: colors.border.default };
  }
}

function Pill({ children, bg, fg, border }: { children: React.ReactNode; bg: string; fg: string; border: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: 2,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        fontFamily: "ui-monospace, monospace",
        fontSize: 9,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function codeStyle(colors: any) {
  return {
    fontFamily: "ui-monospace, monospace",
    fontSize: 11,
    background: colors.bg.cardAlt,
    padding: "1px 5px",
    borderRadius: 3,
  };
}
