"use client";

import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";

export interface Crumb {
  label: string;
  type?: EntityType;
  onClick?: () => void;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const colors = useColors();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: colors.text.muted }}>
      {items.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {i > 0 && <span style={{ color: colors.text.dim }}>›</span>}
          {c.type && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.entityTypes[c.type] }} />
          )}
          <span
            onClick={c.onClick}
            style={{
              cursor: c.onClick ? "pointer" : "default",
              color: c.onClick ? colors.text.muted : colors.text.primary,
              fontWeight: c.onClick ? 400 : 500,
            }}
          >
            {c.label}
          </span>
        </span>
      ))}
    </div>
  );
}
