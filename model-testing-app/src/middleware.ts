import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
  '/signup(.*)',
  '/api/test-feedback-loop(.*)',
  '/api/process-meeting-queue(.*)',
  '/api/process-intelligence-queue(.*)',
  // Mobile-app endpoints — they don't use Next cookie auth.
  // The mobile app authenticates separately via Clerk Expo for any sensitive operations
  // that touch user data; these endpoints only do AI text parsing and are safe to expose.
  '/api/mobile/(.*)',
  // v4 pipeline is called server-to-server from /api/mobile/bulk-upload/process
  // (no user cookie available) and from the browser's bulkQueueProcessor
  // (works with or without auth). Protecting it with Clerk breaks the mobile
  // path with a silent HTTP 404. No user data is passed — it only runs AI
  // classification on the file URL + metadata it's given.
  '/api/v4-analyze(.*)',
  // HubSpot sync-all is hit by both the browser (Clerk cookie present) and
  // the Convex cron (no cookie, but carries an X-Cron-Secret header). The
  // route handler enforces auth itself — Clerk session OR matching secret —
  // but Clerk middleware was intercepting BEFORE the handler could check,
  // returning its default 404 to the cron. Making the route public lets
  // the request reach the handler's own auth gate.
  '/api/hubspot/sync-all(.*)',
  // HubSpot webhook receiver — signed with HMAC by HubSpot. The handler
  // self-authenticates via signature verification. Public here so Clerk
  // doesn't 404-reject the unauthenticated POST before it reaches the
  // signature check.
  '/api/hubspot/webhook(.*)',
  // Bridge endpoint Convex actions call to run the webhook process logic
  // in the Next app (HubSpot SDK + env access live here, not in Convex).
  // Self-authenticates via X-Cron-Secret, same pattern as sync-all.
  '/api/hubspot/webhook-process(.*)',
  // One-off migration bridge endpoint for the Fireflies backfill
  // action. Self-authenticates via X-Cron-Secret, same pattern as
  // webhook-process.
  '/api/hubspot/fireflies-backfill(.*)',
])

// Mobile route mapping: URL path → (mobile) route group path.
//
// Desktop routing (non-mobile UAs): when the middleware detects a non-mobile
// request, it falls through (NextResponse.next()). The `/` request then
// lands at src/app/(desktop)/page.tsx — the real desktop dashboard.
// The previous src/app/page.tsx existed and unconditionally redirected to
// /m-dashboard, which shadowed the (desktop) route group and caused desktop
// traffic to see the mobile layout. It has been removed; do not reintroduce
// a top-level page.tsx without mirroring this branching logic.
const mobileRouteMap: Record<string, string> = {
  '/': '/m-dashboard',
  '/clients': '/m-clients',
  '/docs': '/m-docs',
  '/tasks': '/m-tasks',
  '/notes': '/m-notes',
  '/contacts': '/m-contacts',
}

function isMobileRequest(request: Request): boolean {
  const url = new URL(request.url)

  // Dev override: ?mobile=true / ?mobile=false
  const mobileParam = url.searchParams.get('mobile')
  if (mobileParam === 'true') return true
  if (mobileParam === 'false') return false

  // Subdomain detection
  const hostname = request.headers.get('host') || ''
  if (hostname.startsWith('m.')) return true

  // User-agent detection for phones (not tablets)
  const ua = request.headers.get('user-agent') || ''
  if (/iPhone|Android.*Mobile|webOS|iPod|BlackBerry|Windows Phone/i.test(ua)) return true

  return false
}

export default clerkMiddleware(async (auth, request) => {
  // Auth check first — applies to both desktop and mobile
  if (!isPublicRoute(request)) {
    await auth.protect()
  }

  // Mobile routing: rewrite to (mobile) route group
  if (isMobileRequest(request)) {
    const url = new URL(request.url)
    const pathname = url.pathname

    // Don't rewrite API routes, static assets, or already-mobile paths
    if (pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname.startsWith('/m-')) {
      return NextResponse.next()
    }

    // Find matching mobile route
    const mobilePath = mobileRouteMap[pathname]
    if (mobilePath) {
      url.pathname = mobilePath
      return NextResponse.rewrite(url)
    }

    // For unmatched mobile paths, fall through to mobile dashboard
    url.pathname = '/m-dashboard'
    return NextResponse.rewrite(url)
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
