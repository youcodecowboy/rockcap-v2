"use client";

import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";

export function TopAccent({ type }: { type: EntityType }) {
  const colors = useColors();
  return <div style={{ height: 2, background: colors.entityTypes[type] }} />;
}
