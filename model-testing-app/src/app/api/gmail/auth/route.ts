import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buildAuthUrl } from "@/lib/gmail/oauth";
import crypto from "crypto";

// GET /api/gmail/auth
// Initiates the Gmail OAuth flow. Authenticated users only. Generates a
// CSRF token bound to the Clerk userId, base64-encodes the state, and
// redirects to Google's consent screen.
//
// Separate OAuth client from Google Calendar (BL-4.1 confirmed decision):
// connecting Gmail does not disconnect Calendar and vice versa.

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
    const state = Buffer.from(JSON.stringify({ userId, csrf, integration: "gmail", returnTo })).toString("base64");
    const url = buildAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("[gmail/auth] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
