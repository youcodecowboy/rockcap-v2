"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { EmptyState } from "@/components/layouts";
import { FolderOpen, FileText, FileSpreadsheet, FileSignature } from "lucide-react";

interface FilesTabProps {
  prospect: any;
}

// Files tab for a prospect (semi-client). Documents attach to the clientId, so a
// prospect can accumulate files — NDAs, teasers, appraisals — before being
// promoted to a client. Persistent from the start; empty until files arrive.
export function FilesTab({ prospect }: FilesTabProps) {
  const colors = useColors();
  const docs = useQuery(
    api.documents.getByClient,
    prospect ? { clientId: prospect._id } : "skip",
  ) as any[] | undefined;

  if (docs === undefined) {
    return <div style={{ color: colors.text.muted, fontSize: 12, padding: 16 }}>Loading files…</div>;
  }

  if (docs.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpen size={40} />}
        title="No files yet"
        body="Documents you receive from this prospect — NDAs, teasers, appraisals, term sheets — will appear here. Drop them in via Claude (document.requestUpload → document.analyze) and they'll be classified and filed automatically."
      />
    );
  }

  // Group by category for a tidy view.
  const byCategory = new Map<string, any[]>();
  for (const d of docs) {
    const c = d.category || "Uncategorized";
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c)!.push(d);
  }
  const groups = [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const icon = (name: string) =>
    /\.(xlsx?|csv)$/i.test(name || "") ? <FileSpreadsheet size={14} /> :
    /\.(pdf|docx?)$/i.test(name || "") ? <FileText size={14} /> : <FileSignature size={14} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontSize: 12, color: colors.text.muted }}>{docs.length} file{docs.length === 1 ? "" : "s"}</div>
      {groups.map(([cat, items]) => (
        <div key={cat}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: colors.text.muted, marginBottom: 6 }}>{cat}</div>
          <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 6, overflow: "hidden" }}>
            {items.map((d, i) => (
              <div
                key={d._id}
                className="flex items-center gap-3"
                style={{ padding: "10px 12px", borderTop: i === 0 ? "none" : `1px solid ${colors.border.light}`, background: colors.bg.card }}
              >
                <span style={{ color: colors.entityTypes.prospect, flexShrink: 0 }}>{icon(d.fileName)}</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ fontSize: 13, color: colors.text.primary }}>{d.fileName || d.documentCode || "Untitled"}</div>
                  {d.summary && <div className="truncate" style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{d.summary}</div>}
                </div>
                <span style={{ fontSize: 11, color: colors.text.dim, flexShrink: 0 }}>
                  {d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
