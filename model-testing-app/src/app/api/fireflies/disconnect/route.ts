import { NextResponse } from "next/server";
import { getAuthenticatedConvexClient } from "@/lib/auth";
import { api } from "../../../../../convex/_generated/api";

// POST /api/fireflies/disconnect
// Deletes the user's Fireflies token row. Idempotent: returns 200 even
// if there was nothing connected.

export async function POST() {
  try {
    const convex = await getAuthenticatedConvexClient();
    await convex.mutation(api.fireflies.disconnect, {});
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[fireflies/disconnect] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to disconnect Fireflies" },
      { status: 500 },
    );
  }
}
