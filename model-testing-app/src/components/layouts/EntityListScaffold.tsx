"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";
import { TopAccent } from "./TopAccent";

export function EntityListScaffold({
  entityType,
  title,
  count,
  search,
  actions,
  filters,
  children,
}: {
  entityType: EntityType;
  title: string;
  count?: number;
  search?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <>
      <TopAccent type={entityType} />
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: colors.entityTypes[entityType] }} />
            <h1 style={{ fontSize: 20, fontWeight: 300, margin: 0, color: colors.text.primary }}>{title}</h1>
            {count !== undefined && (
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  color: colors.text.muted,
                  background: colors.bg.cardAlt,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                {count}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {search}
            {actions}
          </div>
        </div>
        {filters && <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>{filters}</div>}
      </div>
      <div style={{ padding: "0 24px 24px" }}>{children}</div>
    </>
  );
}
