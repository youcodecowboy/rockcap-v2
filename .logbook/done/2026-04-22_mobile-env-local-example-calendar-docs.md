# mobile-app/.env.local.example — document Calendar vs pre-existing vars

Created: 2026-04-22
Status: done
Tags: #docs #mobile #calendar
Source:
  - 2026-04-22 — [docs] `mobile-app/.env.local.example` should either include the required Convex/Clerk vars (`EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`) or add a header comment noting "assumes Convex + Clerk vars already configured — these add Google Calendar OAuth"
Priority: low

## Notes

Already resolved by commit 71dd4ac (2026-04-22 12:34, "fix(mobile): use
resolveApiBase() instead of ad-hoc env var") — that commit added the
exact header comment the inbox item requested:

    # Extends the base `mobile-app/.env` — add these to enable Google Calendar OAuth.
    # Base vars (EXPO_PUBLIC_CONVEX_URL, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    # EXPO_PUBLIC_API_URL) are assumed already configured in `.env`.

Closed without new code — inbox capture and fix landed on the same day;
triage surfaced the residual task after the fix had already shipped.
