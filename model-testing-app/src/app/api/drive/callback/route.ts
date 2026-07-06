import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getDriveEmail } from "@/lib/drive/oauth";
import { getAuthenticatedConvexClient } from "@/lib/auth";
import { api } from "../../../../../convex/_generated/api";

// GET /api/drive/callback
// Handles the Google OAuth callback for Drive. Exchanges the code for
// tokens, resolves the connected email, and saves to Convex.
//
// On success redirects to /settings/drive?drive=success.
// On error redirects to /settings/drive?drive=error|denied with the
// specific failure mode in the query string for the UI to surface.

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Decode returnTo up front so error redirects honor it too. Re-validate the
  // relative-path constraint here since state is attacker-influenceable.
  let returnTo = "/settings/drive";
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, "base64").toString());
      if (typeof decoded.returnTo === "string" && decoded.returnTo.startsWith("/") && !decoded.returnTo.startsWith("//")) {
        returnTo = decoded.returnTo;
      }
    } catch {
      // fall back to /settings/drive
    }
  }
  const sep = returnTo.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(new URL(`${returnTo}${sep}drive=denied`, request.url));
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(new URL(`${returnTo}${sep}drive=error`, request.url));
  }

  try {
    const state = JSON.parse(Buffer.from(stateParam, "base64").toString());
    if (!state.userId) {
      console.error("[drive/callback] No userId in state");
      return NextResponse.redirect(new URL(`${returnTo}${sep}drive=error`, request.url));
    }
    if (state.integration !== "drive") {
      // Defensive: prevent state-confusion between Drive, Gmail, and Calendar OAuth.
      console.error("[drive/callback] Wrong integration in state:", state.integration);
      return NextResponse.redirect(new URL(`${returnTo}${sep}drive=error`, request.url));
    }

    const tokens = await exchangeCodeForTokens(code);
    const email = await getDriveEmail(tokens.access_token);

    const convex = await getAuthenticatedConvexClient();
    await convex.mutation(api.driveTokens.saveTokens, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      connectedEmail: email,
    });

    return NextResponse.redirect(new URL(`${returnTo}${sep}drive=success`, request.url));
  } catch (err) {
    console.error("[drive/callback] ERROR:", err);
    return NextResponse.redirect(new URL(`${returnTo}${sep}drive=error`, request.url));
  }
}
