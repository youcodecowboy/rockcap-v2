"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../convex/_generated/dataModel";
import { MarkdownView } from "@/components/shared/MarkdownView";
import { NotebookPen } from "lucide-react";

// Context tab — renders projectIntelligence.contextMarkdown, the running log of
// OPERATOR-STATED primary knowledge about THIS deal/scheme, written by the
// `client-context-capture` skill. Deal-scoped twin of the client Context tab.
export default function ProjectContextTab({
  projectId,
  projectName,
}: {
  projectId: Id<"projects">;
  projectName?: string;
}) {
  const intelligence = useQuery(api.intelligence.getProjectIntelligence, { projectId });

  if (intelligence === undefined) {
    return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  }

  const contextMarkdown: string | undefined = (intelligence as any)?.contextMarkdown;
  const updatedAt: string | undefined = (intelligence as any)?.contextMarkdownUpdatedAt;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <NotebookPen className="w-4 h-4 text-gray-500" />
          Operator context
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Primary knowledge you&apos;ve captured about this deal — meetings, calls, things you know.
          {updatedAt ? ` Last updated ${updatedAt.slice(0, 10)}.` : ""}
        </p>
      </div>

      {contextMarkdown ? (
        <div
          className="rounded border border-gray-200 bg-white p-6"
          style={{ fontSize: 13, lineHeight: 1.65 }}
        >
          <MarkdownView content={contextMarkdown} />
        </div>
      ) : (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <NotebookPen className="w-6 h-6 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600 font-medium">No operator context yet</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Tell the assistant what you know about {projectName ?? "this deal"} — e.g.
            &ldquo;log this about the deal&hellip;&rdquo; — and the client-context-capture
            skill will structure it and log it here.
          </p>
        </div>
      )}
    </div>
  );
}
