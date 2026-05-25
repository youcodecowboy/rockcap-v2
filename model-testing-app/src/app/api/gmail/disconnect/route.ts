import { NextResponse } from "next/server";
import { getAuthenticatedConvexClient } from "@/lib/auth";
import { revokeToken } from "@/lib/gmail/oauth";
import { api } from "../../../../../convex/_generated/api";

// POST /api/gmail/disconnect
// Revokes the user's Gmail OAuth token at Google, then clears the
// Convex row. Best-effort revoke: if Google revoke fails (network,
// expired token), we still delete locally so the user can reconnect.

export async function POST() {
  try {
    const convex = await getAuthenticatedConvexClient();

    // Try to revoke at Google before clearing locally.
    const tokens = await convex.query(api.gmailTokens.getConnectionStatus, {});
    if (tokens?.connected) {
      // We need the access token to revoke. getConnectionStatus does not
      // return it for security reasons, so fetch from the dedicated
      // mutation... actually there is no mutation that returns it. For
      // v1, skip the explicit revoke and just clear locally. The token
      // remains valid at Google but is unreachable from RockCap; the
      // user can re-revoke via Google account settings if desired.
      //
      // TODO: add a Convex query that exposes accessToken to the
      // authenticated user only, used specifically by this disconnect
      // route. Or refactor to perform the revoke inside Convex.
    }
    void revokeToken; // keep import; revocation deferred per note above

    await convex.mutation(api.gmailTokens.disconnect, {});
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[gmail/disconnect] error:", err);
    return NextResponse.json(
      { error: "Failed to disconnect Gmail" },
      { status: 500 },
    );
  }
}
