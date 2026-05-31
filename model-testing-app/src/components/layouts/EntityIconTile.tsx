"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";

export function EntityIconTile({ type, children }: { type: EntityType; children: ReactNode }) {
  const colors = useColors();
  const c = colors.entityTypes[type];
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        background: `${c}15`,
        border: `1px solid ${c}40`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: c,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}
