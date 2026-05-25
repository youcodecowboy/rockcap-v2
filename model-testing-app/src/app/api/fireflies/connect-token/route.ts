import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedConvexClient } from "@/lib/auth";
import { validateToken, FirefliesAuthError, FirefliesApiError } from "@/lib/fireflies/client";
import { api } from "../../../../../convex/_generated/api";

// POST /api/fireflies/connect-token
// Body: { apiToken: string }
// Validates the token against Fireflies, then stores it in Convex.
// On success returns { ok: true, connectedEmail }.
// On auth failure returns 401. On other failures returns 502.

export async function POST(request: NextRequest) {
  let body: { apiToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiToken = typeof body.apiToken === "string" ? body.apiToken.trim() : "";
  if (!apiToken) {
    return NextResponse.json({ error: "apiToken is required" }, { status: 400 });
  }

  try {
    const userInfo = await validateToken(apiToken);

    const convex = await getAuthenticatedConvexClient();
    await convex.mutation(api.fireflies.connectToken, {
      apiToken,
      connectedEmail: userInfo.email,
    });

    return NextResponse.json({
      ok: true,
      connectedEmail: userInfo.email ?? null,
      connectedName: userInfo.name ?? null,
    });
  } catch (err: any) {
    if (err instanceof FirefliesAuthError) {
      return NextResponse.json(
        { error: "Fireflies rejected the API token. Check the value and try again." },
        { status: 401 },
      );
    }
    if (err instanceof FirefliesApiError) {
      console.error("[fireflies/connect-token] Fireflies API error:", err.message);
      return NextResponse.json(
        { error: "Fireflies API error. Try again in a moment." },
        { status: 502 },
      );
    }
    console.error("[fireflies/connect-token] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error connecting Fireflies" },
      { status: 500 },
    );
  }
}
