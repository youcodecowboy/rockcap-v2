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
])

// Mobile route mapping: URL path → (mobile) route group path
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
