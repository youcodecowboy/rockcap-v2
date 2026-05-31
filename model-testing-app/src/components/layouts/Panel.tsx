"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";

// Flat, hairline-bordered container — the canon replacement for shadcn <Card>.
// No shadow, small radius, optional mono-uppercase header + actions slot.
export function Panel({
  title,
  actions,
  accent,
  padded = true,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  accent?: string;
  padded?: boolean;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <div
      style={{
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderTop: accent ? `2px solid ${accent}` : `1px solid ${colors.border.default}`,
        borderRadius: 4,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            borderBottom: `1px solid ${colors.border.default}`,
          }}
        >
          {title ? (
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: colors.text.muted,
                fontWeight: 500,
              }}
            >
              {title}
            </div>
          ) : (
            <span />
          )}
          {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: padded ? 14 : 0 }}>{children}</div>
    </div>
  );
}
