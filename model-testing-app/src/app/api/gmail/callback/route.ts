import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getGmailEmail } from "@/lib/gmail/oauth";
import { getAuthenticatedConvexClient } from "@/lib/auth";
import { api } from "../../../../../convex/_generated/api";

// GET /api/gmail/callback
// Handles the Google OAuth callback for Gmail. Exchanges the code for
// tokens, resolves the connected email, and saves to Convex.
//
// On success redirects to /settings/gmail?gmail=success.
// On error redirects to /settings/gmail?gmail=error|denied with the
// specific failure mode in the query string for the UI to surface.

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings/gmail?gmail=denied", request.url));
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/settings/gmail?gmail=error", request.url));
  }

  try {
    const state = JSON.parse(Buffer.from(stateParam, "base64").toString());
    if (!state.userId) {
      console.error("[gmail/callback] No userId in state");
      return NextResponse.redirect(new URL("/settings/gmail?gmail=error", request.url));
    }
    if (state.integration !== "gmail") {
      // Defensive: prevent state-confusion between Gmail and Calendar OAuth.
      console.error("[gmail/callback] Wrong integration in state:", state.integration);
      return NextResponse.redirect(new URL("/settings/gmail?gmail=error", request.url));
    }

    const tokens = await exchangeCodeForTokens(code);
    const email = await getGmailEmail(tokens.access_token);

    const convex = await getAuthenticatedConvexClient();
    await convex.mutation(api.gmailTokens.saveTokens, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      connectedEmail: email,
    });

    return NextResponse.redirect(new URL("/settings/gmail?gmail=success", request.url));
  } catch (err) {
    console.error("[gmail/callback] ERROR:", err);
    return NextResponse.redirect(new URL("/settings/gmail?gmail=error", request.url));
  }
}
