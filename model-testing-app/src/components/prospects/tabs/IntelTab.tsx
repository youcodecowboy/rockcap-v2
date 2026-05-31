"use client";

import { useColors } from "@/lib/useColors";
import { MarkdownView } from "@/components/shared/MarkdownView";

// Intel tab renders the skillRun.intelMarkdown field — a long-form markdown
// artefact produced by hardened skills (prospect-intel v2, qualify-and-draft,
// lender-intel). Rendering is delegated to the shared MarkdownView so the
// prospect Intel tab and the client/project Context tab stay visually in sync.

export function IntelTab({ intelRun }: { intelRun?: any }) {
  const colors = useColors();
  const content =
    intelRun?.intelMarkdown ??
    intelRun?.brief ??
    "No intel report yet. The skill may not have run, or may not have produced an intelMarkdown field.";

  return (
    <div
      style={{
        background: colors.bg.card,
        padding: 24,
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        color: colors.text.primary,
        fontSize: 13,
        lineHeight: 1.65,
      }}
    >
      <MarkdownView content={content} />
    </div>
  );
}
