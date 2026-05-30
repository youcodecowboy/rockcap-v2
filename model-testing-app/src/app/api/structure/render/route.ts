// src/app/api/structure/render/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildStructureChartSvg, svgToMarkdownImage } from "@/lib/docgen/structureChart";
import { gradeStructure } from "@/lib/structure/stressTest";
import type { StructureGraph } from "@/lib/structure/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-convex-internal-secret");
  if (!secret || secret !== process.env.CONVEX_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const graph = body?.graph as StructureGraph | undefined;
    if (!graph?.nodes || !graph?.edges) {
      return NextResponse.json({ error: "missing graph { nodes, edges }" }, { status: 400 });
    }
    const verdict = gradeStructure(graph);
    const graded: StructureGraph = { ...graph, verdict };
    const svg = buildStructureChartSvg(graded);
    return NextResponse.json({ svg, dataUri: svgToMarkdownImage(svg).replace(/^!\[[^\]]*\]\(|\)$/g, ""), verdict });
  } catch (err) {
    console.error("[structure/render] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
