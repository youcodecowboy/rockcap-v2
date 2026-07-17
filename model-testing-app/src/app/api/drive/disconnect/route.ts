import { NextResponse } from "next/server";
import { getAuthenticatedConvexClient } from "@/lib/auth";
import { revokeToken } from "@/lib/drive/oauth";
import { api } from "../../../../../convex/_generated/api";

// POST /api/drive/disconnect
// Clears the org-wide Drive connection row in Convex. Best-effort: for v1
// the explicit Google-side revoke is deferred (getConnectionStatus does not
// expose the access token), so we clear locally. The token remains valid at
// Google but is unreachable from RockCap; access can be revoked via the
// Google account settings if desired.

export async function POST() {
  try {
    const convex = await getAuthenticatedConvexClient();
    void revokeToken; // keep import; revocation deferred per note above
    await convex.mutation(api.driveTokens.disconnect, {});
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[drive/disconnect] error:", err);
    return NextResponse.json(
      { error: "Failed to disconnect Drive" },
      { status: 500 },
    );
  }
}
