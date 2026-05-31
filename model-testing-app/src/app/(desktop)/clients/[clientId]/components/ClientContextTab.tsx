"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { MarkdownView } from "@/components/shared/MarkdownView";
import { NotebookPen } from "lucide-react";

// Context tab — renders clientIntelligence.contextMarkdown, the running log of
// OPERATOR-STATED primary knowledge (meetings, calls, personal knowledge),
// written by the `client-context-capture` skill. Distinct from the structured
// Intelligence tab (doc/web-derived facts) and from Notes (a separate lane).
export default function ClientContextTab({
  clientId,
  clientName,
}: {
  clientId: Id<"clients">;
  clientName?: string;
}) {
  const intelligence = useQuery(api.intelligence.getClientIntelligence, { clientId });

  // Loading
  if (intelligence === undefined) {
    return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  }

  const contextMarkdown: string | undefined = (intelligence as any)?.contextMarkdown;
  const updatedAt: string | undefined = (intelligence as any)?.contextMarkdownUpdatedAt;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <NotebookPen className="w-4 h-4 text-gray-500" />
            Operator context
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Primary knowledge you&apos;ve captured — meetings, calls, things you know.
            {updatedAt ? ` Last updated ${updatedAt.slice(0, 10)}.` : ""}
          </p>
        </div>
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
            Tell the assistant what you know about {clientName ?? "this client"} — e.g.
            &ldquo;I met with them, here&apos;s a load of context&hellip;&rdquo; — and the
            client-context-capture skill will structure it and log it here.
          </p>
        </div>
      )}
    </div>
  );
}
