"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";
import { SHELL } from "./constants";
import type { EntityType } from "./constants";
import { TopAccent } from "./TopAccent";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";
import { EntityIconTile } from "./EntityIconTile";
import { KpiRow, type Kpi } from "./KpiRow";
import { TabStrip, type TabDef } from "./TabStrip";

export function EntityDetailScaffold({
  entityType,
  breadcrumbs,
  icon,
  title,
  subtitle,
  status,
  actions,
  kpis,
  tabs,
  activeTab,
  onTabChange,
  banner,
  aside,
  children,
}: {
  entityType: EntityType;
  breadcrumbs: Crumb[];
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  kpis?: Kpi[];
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
  banner?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <>
      <TopAccent type={entityType} />
      <div style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}`, position: "sticky", top: SHELL.navHeight, zIndex: 5 }}>
        <div style={{ padding: "14px 24px 4px" }}>
          <Breadcrumbs items={breadcrumbs} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 24px 18px" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <EntityIconTile type={entityType}>{icon}</EntityIconTile>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 300, margin: 0, color: colors.text.primary }}>{title}</h1>
              {subtitle && <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{subtitle}</div>}
            </div>
            {status}
          </div>
          {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
        </div>
        {kpis && kpis.length > 0 && (
          <div style={{ padding: "0 24px 12px" }}>
            <KpiRow items={kpis} />
          </div>
        )}
        <TabStrip tabs={tabs} activeTab={activeTab} onChange={onTabChange} entityType={entityType} />
      </div>
      {banner}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: aside ? `1fr ${SHELL.asideWidth}px` : "1fr",
          gap: 1,
          background: colors.border.default,
          paddingBottom: 40,
        }}
      >
        <div style={{ background: colors.bg.card, padding: 24, minWidth: 0 }}>{children}</div>
        {aside && (
          <aside style={{ background: colors.bg.light, padding: 20, borderLeft: `1px solid ${colors.border.default}` }}>{aside}</aside>
        )}
      </div>
    </>
  );
}
