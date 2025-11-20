# Clerk + Convex Setup

## ✅ Setup Complete

We've integrated Clerk authentication with Convex. Here's what's been done:

### Files Updated:
1. **Schema** (`convex/schema.ts`) - Updated users table to use `clerkId`
2. **Middleware** (`src/middleware.ts`) - Added Clerk authentication
3. **Layout** (`src/app/layout.tsx`) - Wrapped with `ClerkProvider`
4. **Convex Provider** (`src/components/ConvexClientProvider.tsx`) - Using `ConvexProviderWithClerk`
5. **Auth helpers** (`src/lib/auth.ts`) - Updated to use Clerk tokens
6. **All Convex functions** - Updated to look up users by `clerkId` instead of email

### Required: Configure Clerk JWT Template

You need to create a custom JWT template in Clerk for Convex:

1. Go to https://dashboard.clerk.com
2. Select your application
3. Navigate to **JWT Templates** in the sidebar
4. Click **New template** → **Convex**
5. Name it `convex`
6. Clerk will automatically configure it correctly for Convex

That's it! Clerk provides a pre-made Convex template that works out of the box.

### How It Works:

- **Client-side**: Clerk handles sign-in/sign-up via redirects
- **Convex Queries**: `ctx.auth.getUserIdentity()` returns Clerk user info
- **User Sync**: Users are created in your `users` table on first access
- **API Routes**: Use `getAuthenticatedConvexClient()` to get an authenticated Convex client

### Testing:

1. Start dev server: `npm run dev`
2. Visit `http://localhost:3001`
3. You'll be redirected to Clerk's sign-in page
4. Sign up/sign in
5. You'll be redirected back - fully authenticated!

### User Button:

The Clerk `<UserButton />` in the nav bar provides:
- User profile
- Account settings
- Sign out

No need for custom login pages - Clerk handles everything!

