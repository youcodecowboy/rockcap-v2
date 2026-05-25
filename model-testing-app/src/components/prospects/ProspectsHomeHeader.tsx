"use client";

import { useColors } from "@/lib/useColors";
import { Search } from "lucide-react";

interface ProspectsHomeHeaderProps {
  totalCount: number;
  draftedCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function ProspectsHomeHeader({ totalCount, draftedCount, searchQuery, onSearchChange }: ProspectsHomeHeaderProps) {
  const colors = useColors();
  return (
    <div>
      {/* Breadcrumbs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 0 4px",
          fontSize: 11,
          color: colors.text.muted,
        }}
      >
        <span>Dashboard</span>
        <span style={{ color: colors.text.dim }}>›</span>
        <span style={{ color: colors.text.primary, fontWeight: 500 }}>Prospects</span>
      </div>
      {/* Page head */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "6px 0 24px",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: `${colors.entityTypes.prospect}15`,
              border: `1px solid ${colors.entityTypes.prospect}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: colors.entityTypes.prospect,
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            ◆
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 300, margin: 0, color: colors.text.primary }}>Prospects</h1>
            <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
              {totalCount} tracked · {draftedCount} awaiting review
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={12}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: colors.text.dim }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by company, CH number, contact..."
              style={{
                background: colors.bg.card,
                border: `1px solid ${colors.border.default}`,
                padding: "6px 10px 6px 28px",
                fontSize: 11,
                color: colors.text.primary,
                borderRadius: 4,
                width: 280,
              }}
            />
          </div>
          <button
            style={{
              background: colors.bg.card,
              border: `1px solid ${colors.border.default}`,
              padding: "6px 12px",
              fontSize: 11,
              color: colors.text.primary,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Import XLSX
          </button>
        </div>
      </div>
    </div>
  );
}
