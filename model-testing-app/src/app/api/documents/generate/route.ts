// src/app/api/documents/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
// Use runtime require to avoid deep type-instantiation errors (same pattern as quick-export).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require("../../../../../convex/_generated/api");
import { renderDocument, type DocFormat, type DocLayout } from "@/lib/docgen";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_FORMATS: DocFormat[] = ["pdf", "docx"];
// Branded layouts assembled from structured briefData (not freeform contentHtml).
const BRIEF_LAYOUTS: DocLayout[] = ["lender-brief", "client-brief"];

function convex(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
  return new ConvexHttpClient(url);
}

async function uploadToStorage(client: ConvexHttpClient, buffer: Buffer, mime: string): Promise<string> {
  const uploadUrl = await client.mutation(api.files.generateUploadUrl, {});
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mime },
    body: new Blob([buffer], { type: mime }),
  });
  if (!res.ok) throw new Error(`storage upload failed: ${res.status}`);
  const { storageId } = await res.json();
  return storageId as string;
}

export async function POST(request: NextRequest) {
  // Internal-secret guard (same secret cadenceDispatcher sends).
  const secret = request.headers.get("x-convex-internal-secret");
  if (!secret || secret !== process.env.CONVEX_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { contentHtml, title, layout, briefData } = body;
    const formats: DocFormat[] = Array.isArray(body.formats) && body.formats.length
      ? body.formats.filter((f: string) => VALID_FORMATS.includes(f as DocFormat))
      : ["pdf"];

    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Two input modes: a branded brief (structured briefData + a brief layout) or a
    // freeform house document (contentHtml). The brief layouts share one render path.
    let rendered;
    if (typeof layout === "string" && BRIEF_LAYOUTS.includes(layout as DocLayout)) {
      if (!briefData || typeof briefData !== "object" || !Array.isArray(briefData.sections) || !briefData.sections.length) {
        return NextResponse.json({ error: `${layout} requires briefData with at least one section` }, { status: 400 });
      }
      rendered = await renderDocument({ layout: layout as DocLayout, briefData, title, formats } as Parameters<typeof renderDocument>[0]);
    } else {
      if (typeof contentHtml !== "string" || !contentHtml.trim()) {
        return NextResponse.json({ error: "contentHtml is required" }, { status: 400 });
      }
      rendered = await renderDocument({ contentHtml, title, formats });
    }

    const client = convex();
    const safeStem = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "document";
    const files = [];
    for (const r of rendered) {
      const storageId = await uploadToStorage(client, r.buffer, r.mime);
      files.push({
        format: r.format,
        storageId,
        fileName: `${safeStem}.${r.ext}`,
        fileSize: r.buffer.length,
        mime: r.mime,
      });
    }

    return NextResponse.json({ ok: true, files });
  } catch (err) {
    console.error("[documents/generate] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "documents/generate", formats: VALID_FORMATS });
}
