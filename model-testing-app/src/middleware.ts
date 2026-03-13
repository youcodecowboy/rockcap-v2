import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
  '/signup(.*)',
  '/api/test-feedback-loop(.*)', // Test endpoint for feedback loop verification
  '/api/process-meeting-queue(.*)', // Meeting extraction queue processor
  '/api/process-intelligence-queue(.*)', // Intelligence extraction queue processor
  '/api/v4-analyze(.*)', // V4 document classification pipeline (called client-side)
  '/api/bulk-analyze(.*)', // Legacy bulk analysis endpoint
  '/api/chat-assistant(.*)', // Chat assistant endpoint
  '/api/analyze-file(.*)', // Single file analysis
  '/api/convex-file(.*)', // Convex file proxy
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}

