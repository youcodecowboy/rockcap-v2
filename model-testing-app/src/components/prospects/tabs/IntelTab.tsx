"use client";

import { useColors } from "@/lib/useColors";

export function IntelTab({ intelRun }: { intelRun?: any }) {
  const colors = useColors();
  const content = intelRun?.intelMarkdown ?? intelRun?.brief ?? "No intel report yet. The skill may not have run, or may not have produced an intelMarkdown field.";
  return (
    <div style={{ background: colors.bg.card, padding: 16, border: `1px solid ${colors.border.default}`, borderRadius: 4 }}>
      <pre style={{ whiteSpace: "pre-wrap" as const, fontFamily: "system-ui, sans-serif", fontSize: 12, color: colors.text.primary, lineHeight: 1.6, margin: 0 }}>
        {content}
      </pre>
    </div>
  );
}
