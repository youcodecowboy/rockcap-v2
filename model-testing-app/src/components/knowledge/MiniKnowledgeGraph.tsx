"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Loader2, Maximize2, Waypoints } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import GraphCanvas from "./GraphCanvas";
import type { GraphEntityType } from "./graphVocab";
import { deriveGraphViewModels, truncatedMoreFrom } from "./deriveGraphViewModels";

const EMPTY_SET = new Set<string>();

interface MiniKnowledgeGraphProps {
  entityType: GraphEntityType;
  entityId: string;
  /** Panel height in px (the canvas fills it). */
  height?: number;
  /** Open the full-screen drawer — fired by the expand button or any click on the preview. */
  onExpand: () => void;
}

/** Inline, ambient preview of an entity's one-hop knowledge graph.
 *
 * Renders the REAL GraphCanvas (same force sim, same view-models via
 * deriveGraphViewModels) at panel size, but non-interactive: pointer events
 * are swallowed by a click-catcher that expands into the full
 * KnowledgeGraphDrawer. That keeps wheel-zoom from hijacking page scroll and
 * makes the whole preview one big "open the graph" affordance. */
export default function MiniKnowledgeGraph({
  entityType,
  entityId,
  height = 280,
  onExpand,
}: MiniKnowledgeGraphProps) {
  const colors = useColors();
  const [hover, setHover] = useState(false);

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const data = useQuery(api.knowledge.graphQueries.expandEntity, {
    entityType,
    entityId,
    includeRingAttributes: true,
    // Preview payload: a smaller ring than the drawer's default — the panel
    // is ~260px tall, and every ring member costs server read budget.
    limit: 24,
  });

  const { nodes, edges, satellites, satelliteTruncation } = useMemo(
    () => deriveGraphViewModels(data),
    [data],
  );
  const truncatedMore = useMemo(() => truncatedMoreFrom(data), [data]);

  const isEmpty = data !== undefined && nodes.length <= 1 && satellites.length === 0;

  return (
    <div
      style={{ position: "relative", height, borderRadius: 3, overflow: "hidden" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {data === undefined ? (
        <div
          className="flex items-center justify-center"
          style={{ position: "absolute", inset: 0, background: colors.bg.light }}
        >
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: colors.text.dim }} />
        </div>
      ) : isEmpty ? (
        <div
          className="flex flex-col items-center justify-center gap-2"
          style={{ position: "absolute", inset: 0, background: colors.bg.light }}
        >
          <Waypoints className="w-6 h-6" style={{ color: colors.text.dim }} />
          <span style={{ fontSize: 11, color: colors.text.muted }}>
            No knowledge connections yet
          </span>
        </div>
      ) : (
        <>
          {/* Live canvas, inert: the click-catcher above it owns all input. */}
          <div
            className="flex"
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            aria-hidden
          >
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              satellites={satellites}
              satelliteTruncation={satelliteTruncation}
              satelliteMatchIds={EMPTY_SET}
              centerId={entityId}
              selectedId={null}
              selectedAtomId={null}
              searchMatchIds={EMPTY_SET}
              activeFamily="all"
              reducedMotion={reducedMotion}
              truncatedMore={truncatedMore}
              onSelect={() => {}}
              onSatelliteSelect={() => {}}
              hideControls
            />
          </div>

          {/* Click-catcher + expand affordance */}
          <button
            onClick={onExpand}
            aria-label="Expand knowledge graph"
            style={{
              position: "absolute",
              inset: 0,
              background: hover ? `${colors.bg.base}30` : "transparent",
              border: "none",
              cursor: "pointer",
              transition: "background 120ms linear",
            }}
          />
          <div
            className="flex items-center gap-1.5"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              padding: "4px 8px",
              borderRadius: 3,
              background: colors.bg.card,
              border: `1px solid ${colors.border.default}`,
              color: colors.text.secondary,
              fontSize: 10,
              fontWeight: 500,
              opacity: hover ? 1 : 0.75,
              transition: "opacity 120ms linear",
              pointerEvents: "none",
            }}
          >
            <Maximize2 className="w-3 h-3" />
            Expand
          </div>

          {/* Footer count line */}
          <div
            style={{
              position: "absolute",
              left: 8,
              bottom: 6,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 9,
              letterSpacing: "0.05em",
              color: colors.text.muted,
              pointerEvents: "none",
            }}
          >
            {satellites.length} atoms
          </div>
        </>
      )}
    </div>
  );
}
