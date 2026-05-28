"use client";

import { useColors } from "@/lib/useColors";

export function Skeleton({ width = "100%", height = 16, radius = 4 }: { width?: number | string; height?: number | string; radius?: number }) {
  const colors = useColors();
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: colors.bg.cardAlt,
        border: `1px solid ${colors.border.light}`,
      }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} height={12} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  const colors = useColors();
  return (
    <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, overflow: "hidden" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: "12px 16px", borderBottom: r === rows - 1 ? "none" : `1px solid ${colors.border.light}` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} height={12} />
          ))}
        </div>
      ))}
    </div>
  );
}
