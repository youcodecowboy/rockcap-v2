"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";
import { EmptyState } from "./EmptyState";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export interface Column<T> {
  /** Stable key — also used as the React key for cells. */
  key: string;
  /** Header label (rendered 9px mono-uppercase). */
  header: string;
  /** Cell renderer. */
  render: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  /** Render the cell in monospace (numbers, IDs, dates). */
  mono?: boolean;
  /** Fixed column width (e.g. 120 or "20%"). */
  width?: number | string;
}

// Tokenized table — the canon replacement for shadcn <Table> and ad-hoc card
// grids of rows. Hairline row dividers, mono-uppercase headers, hover row tint.
// For very long books prefer the virtualized list scaffold; this suits tabs.
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  stickyHeader = false,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  stickyHeader?: boolean;
  /** Shown when rows is empty. Pass an <EmptyState> or a string. */
  empty?: ReactNode;
}) {
  const colors = useColors();

  if (rows.length === 0) {
    return typeof empty === "string" || empty == null ? (
      <EmptyState title={(empty as string) ?? "No records"} />
    ) : (
      <>{empty}</>
    );
  }

  return (
    <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr style={{ background: colors.bg.light }}>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? "left",
                  width: c.width,
                  padding: "8px 12px",
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: colors.text.muted,
                  fontWeight: 500,
                  borderBottom: `1px solid ${colors.border.default}`,
                  position: stickyHeader ? "sticky" : undefined,
                  top: stickyHeader ? 0 : undefined,
                  background: colors.bg.light,
                  zIndex: stickyHeader ? 1 : undefined,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <Tr key={getRowKey(row, i)} clickable={!!onRowClick} onClick={() => onRowClick?.(row, i)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    textAlign: c.align ?? "left",
                    padding: "10px 12px",
                    fontSize: c.mono ? 10 : 12,
                    fontFamily: c.mono ? MONO : undefined,
                    color: colors.text.primary,
                    borderBottom: i === rows.length - 1 ? "none" : `1px solid ${colors.border.light}`,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.render(row, i)}
                </td>
              ))}
            </Tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tr({ children, clickable, onClick }: { children: ReactNode; clickable: boolean; onClick: () => void }) {
  const colors = useColors();
  return (
    <tr
      onClick={clickable ? onClick : undefined}
      style={{ cursor: clickable ? "pointer" : "default", transition: "background 100ms linear" }}
      onMouseEnter={(e) => clickable && (e.currentTarget.style.background = colors.bg.cardAlt)}
      onMouseLeave={(e) => clickable && (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </tr>
  );
}
