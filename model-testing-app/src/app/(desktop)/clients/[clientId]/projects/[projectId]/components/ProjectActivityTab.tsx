"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../convex/_generated/dataModel";
import { useColors } from "@/lib/useColors";
import { EmptyState } from "@/components/layouts";
import { Activity as ActivityIcon, Calendar, FileText, ListTodo, Mail } from "lucide-react";

// Project Activity tab — a composed timeline. Projects don't have their own
// `activities` row (that table is client-scoped), so this merges the already
// project-scoped sources (meetings, documents, tasks, touchpoints) into one
// dated feed. Self-contained; no schema/migration.
export default function ProjectActivityTab({ projectId }: { projectId: Id<"projects"> }) {
  const colors = useColors();
  const meetings = useQuery(api.meetings.getByProject, { projectId }) as any[] | undefined;
  const documents = useQuery(api.documents.getByProject, { projectId }) as any[] | undefined;
  const tasks = useQuery(api.tasks.getByProject, { projectId }) as any[] | undefined;
  const touchpoints = useQuery(api.touchpoints.getByProject, { projectId }) as any[] | undefined;

  const loading =
    meetings === undefined || documents === undefined || tasks === undefined || touchpoints === undefined;

  const items = useMemo(() => {
    const out: { id: string; date: string; kind: string; title: string; detail?: string }[] = [];
    (meetings ?? []).forEach((m: any) =>
      out.push({ id: `m-${m._id}`, date: m.meetingDate ?? m.createdAt, kind: "meeting", title: m.title || "Meeting", detail: m.summary }));
    (documents ?? []).forEach((d: any) =>
      out.push({ id: `d-${d._id}`, date: d.uploadedAt ?? d.createdAt, kind: "document", title: d.fileName || d.documentCode || "Document", detail: d.summary || d.category }));
    (tasks ?? []).forEach((t: any) =>
      out.push({ id: `t-${t._id}`, date: t.completedAt || t.createdAt, kind: "task", title: t.title || t.description || "Task", detail: t.status }));
    (touchpoints ?? []).forEach((tp: any) =>
      out.push({ id: `tp-${tp._id}`, date: tp.occurredAt || tp.touchpointDate || tp.activityDate || tp.createdAt, kind: "touchpoint", title: tp.subject || tp.type || "Touchpoint", detail: tp.preview || tp.bodyPreview }));
    return out.filter((x) => x.date).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [meetings, documents, tasks, touchpoints]);

  if (loading) {
    return <div style={{ color: colors.text.muted, fontSize: 12, padding: 16 }}>Loading activity…</div>;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ActivityIcon size={40} />}
        title="No activity yet"
        body="Meetings, documents, tasks, and touchpoints on this project will appear here as a single timeline."
      />
    );
  }

  const icon = (k: string) =>
    k === "meeting" ? <Calendar size={14} /> : k === "document" ? <FileText size={14} /> : k === "task" ? <ListTodo size={14} /> : <Mail size={14} />;
  const tint = (k: string) =>
    k === "meeting" ? colors.accent.purple : k === "document" ? colors.accent.blue : k === "task" ? colors.accent.green : colors.accent.orange;

  return (
    <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 6, overflow: "hidden" }}>
      {items.map((it, i) => (
        <div
          key={it.id}
          className="flex items-start gap-3"
          style={{ padding: "10px 14px", borderTop: i === 0 ? "none" : `1px solid ${colors.border.light}`, background: colors.bg.card }}
        >
          <span style={{ color: tint(it.kind), flexShrink: 0, marginTop: 2 }}>{icon(it.kind)}</span>
          <div className="flex-1 min-w-0">
            <div className="truncate" style={{ fontSize: 13, color: colors.text.primary }}>{it.title}</div>
            {it.detail && <div className="truncate" style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{String(it.detail)}</div>}
          </div>
          <span style={{ fontSize: 11, color: colors.text.dim, flexShrink: 0, whiteSpace: "nowrap" }}>
            {it.kind} · {new Date(it.date).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}
