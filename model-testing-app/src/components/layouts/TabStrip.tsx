"use client";

import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

export function TabStrip({
  tabs,
  activeTab,
  onChange,
  entityType,
}: {
  tabs: TabDef[];
  activeTab: string;
  onChange: (id: string) => void;
  entityType: EntityType;
}) {
  const colors = useColors();
  return (
    <div style={{ display: "flex", padding: "0 24px", gap: 0, borderBottom: `1px solid ${colors.border.default}`, overflowX: "auto" }}>
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <div
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              padding: "12px 16px",
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
              color: active ? colors.text.primary : colors.text.muted,
              borderBottom: `2px solid ${active ? colors.entityTypes[entityType] : "transparent"}`,
              fontWeight: active ? 500 : 400,
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{ color: colors.text.dim, marginLeft: 4 }}>{tab.count}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
