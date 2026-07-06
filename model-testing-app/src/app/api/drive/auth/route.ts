import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buildAuthUrl } from "@/lib/drive/oauth";
import crypto from "crypto";

// GET /api/drive/auth
// Initiates the Google Drive OAuth flow. Authenticated users only.
// Generates a CSRF token bound to the Clerk userId, base64-encodes the
// state, and redirects to Google's consent screen.
//
// Drive uses its own OAuth client, independent of Gmail and Calendar.
// Drive is NOT per-user: exactly one org-wide account connects, but the
// state still records which app user initiated the connection.

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    // Where to land after OAuth. Only accept a same-origin relative path
    // (reject protocol-relative "//host") to avoid an open redirect.
    const raw = new URL(request.url).searchParams.get("returnTo");
    const returnTo = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;
    const csrf = crypto.randomBytes(16).toString("hex");
    const state = Buffer.from(JSON.stringify({ userId, csrf, integration: "drive", returnTo })).toString("base64");
    const url = buildAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("[drive/auth] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
