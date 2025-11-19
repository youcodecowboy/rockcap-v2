# Auth & Vercel Deployment Assessment

## Current State

### ✅ What's Already Set Up
- **Convex Backend**: Fully integrated with Convex React client
- **Next.js 16.0.1**: Modern Next.js setup
- **Convex Schema**: Comprehensive schema with all tables defined
- **API Routes**: Multiple API routes using Convex
- **Environment Variables**: `NEXT_PUBLIC_CONVEX_URL` configured

### ❌ What's Missing
- **Authentication**: No auth system in place
- **User Management**: No user table in schema
- **Protected Routes**: No route protection
- **Build Fixes**: One build error needs fixing
- **Vercel Configuration**: No deployment config

---

## Difficulty Assessment: **MODERATE** (3-5 days of work)

### Why Moderate?
- ✅ Convex Auth is well-documented and integrates seamlessly with existing Convex setup
- ✅ Vercel deployment is straightforward for Next.js apps
- ⚠️ Need to add auth to all existing pages/components
- ⚠️ Need to fix build issues first
- ⚠️ Need to update schema and add user management

---

## Work Breakdown

### Phase 1: Fix Build Issues (1-2 hours)
**Priority: CRITICAL** - Must fix before deployment

**Issues Found:**
1. **Build Error**: `Module not found: Can't resolve '../../../../convex/_generated/api'`
   - **Location**: `src/app/api/prospects/refresh-gauntlet/route.ts`
   - **Cause**: Incorrect relative path (should be `../../../convex/_generated/api`)
   - **Impact**: Blocks production build
   - **Fix**: Update import paths in affected files

**Files to Fix:**
- `src/app/api/prospects/refresh-gauntlet/route.ts` (line 3)
- Check other API routes for similar path issues

**Estimated Build Issues**: **1-3** (likely just path issues)

---

### Phase 2: Add Convex Auth (1-2 days)

#### 2.1 Install Dependencies
```bash
npm install @convex-dev/auth
```

#### 2.2 Update Convex Schema
Add user table to `convex/schema.ts`:
```typescript
users: defineTable({
  email: v.string(),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  emailVerified: v.optional(v.number()),
  // Add any custom user fields
})
  .index("by_email", ["email"]),
```

#### 2.3 Configure Convex Auth
Create `convex/auth.config.ts`:
- Configure authentication providers (email/password, OAuth, etc.)
- Set up auth callbacks

#### 2.4 Update Client Provider
Modify `src/components/ConvexProvider.tsx`:
- Wrap with `Authenticated` component
- Add login/logout UI
- Handle auth state

#### 2.5 Add Auth Middleware
Create middleware for protected routes:
- `src/middleware.ts` - Next.js middleware for route protection
- Protect API routes that need authentication

#### 2.6 Update Existing Pages
Add auth checks to:
- All pages in `src/app/`
- API routes that need protection
- Components that access user data

**Estimated Time**: 1-2 days

---

### Phase 3: Vercel Deployment Setup (2-4 hours)

#### 3.1 Create Vercel Configuration
Create `vercel.json` (if needed):
```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

#### 3.2 Environment Variables Setup
Required environment variables in Vercel:
- `NEXT_PUBLIC_CONVEX_URL` - Your Convex deployment URL
- `CONVEX_DEPLOY_KEY` - For deploying Convex functions (if using CI/CD)
- Auth provider secrets (if using OAuth):
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
  - etc.

#### 3.3 Build Configuration
Update `next.config.ts` if needed:
- Ensure webpack config works in production
- Verify canvas/pdfjs-dist externals work on Vercel

#### 3.4 Convex Deployment
Ensure Convex functions are deployed:
```bash
npx convex deploy --prod
```

**Estimated Time**: 2-4 hours

---

### Phase 4: Testing & Validation (1 day)

#### 4.1 Local Testing
- Test auth flows locally
- Verify protected routes work
- Test API route authentication

#### 4.2 Build Testing
- Run `npm run build` locally
- Fix any build errors
- Verify no TypeScript errors

#### 4.3 Deployment Testing
- Deploy to Vercel preview
- Test auth flows in production
- Verify environment variables
- Test Convex connection

**Estimated Time**: 1 day

---

## Potential Build Issues

### Known Issues
1. **Import Path Error** (1 file)
   - `src/app/api/prospects/refresh-gauntlet/route.ts`
   - Fix: Update relative path

### Potential Issues
2. **Canvas/PDF.js in Serverless**
   - **Risk**: LOW - Already configured in `next.config.ts`
   - **Mitigation**: Already handled with webpack externals

3. **Convex Generated Files**
   - **Risk**: LOW - Standard Convex setup
   - **Mitigation**: Ensure `npx convex dev` runs before build

4. **Environment Variables**
   - **Risk**: MEDIUM - Missing vars cause runtime errors
   - **Mitigation**: Document all required vars

5. **Next.js 16 Compatibility**
   - **Risk**: LOW - Using stable version
   - **Mitigation**: Already compatible

**Total Estimated Build Issues**: **1-3** (mostly path fixes)

---

## Step-by-Step Implementation Plan

### Day 1: Fix Build & Setup Auth
1. ✅ Fix import path errors
2. ✅ Run `npm run build` to verify fixes
3. ✅ Install `@convex-dev/auth`
4. ✅ Add user table to schema
5. ✅ Configure Convex Auth

### Day 2: Implement Auth UI
1. ✅ Create login/signup pages
2. ✅ Update ConvexProvider with auth
3. ✅ Add auth middleware
4. ✅ Protect API routes

### Day 3: Update Pages & Test
1. ✅ Add auth checks to all pages
2. ✅ Update components for user context
3. ✅ Test auth flows locally
4. ✅ Fix any issues

### Day 4: Deploy & Validate
1. ✅ Set up Vercel project
2. ✅ Configure environment variables
3. ✅ Deploy Convex functions
4. ✅ Deploy to Vercel
5. ✅ Test in production

---

## Required Environment Variables

### Development (.env.local)
```env
NEXT_PUBLIC_CONVEX_URL=https://your-dev-deployment.convex.cloud
CONVEX_DEPLOY_KEY=your-dev-key
```

### Production (Vercel)
```env
NEXT_PUBLIC_CONVEX_URL=https://your-prod-deployment.convex.cloud
CONVEX_DEPLOY_KEY=your-prod-key
# Add auth provider secrets if using OAuth
```

---

## Convex Auth Provider Options

### Recommended: Email/Password (Simplest)
- ✅ Easiest to implement
- ✅ No external dependencies
- ✅ Works immediately
- ⚠️ Requires email verification setup

### Alternative: OAuth (Google/GitHub)
- ✅ Better UX (no password)
- ✅ More secure
- ⚠️ Requires OAuth app setup
- ⚠️ Additional environment variables

**Recommendation**: Start with email/password, add OAuth later if needed.

---

## Cost Considerations

### Convex
- Free tier: 1M function calls/month
- Paid: $25/month for 10M calls
- **Auth**: Included, no extra cost

### Vercel
- Free tier: Good for development
- Hobby: $20/month for production
- **Next.js**: Fully supported

---

## Risk Assessment

### Low Risk ✅
- Convex Auth integration (well-documented)
- Vercel deployment (standard Next.js)
- Build configuration (mostly done)

### Medium Risk ⚠️
- Path fixes needed (easy but critical)
- Auth state management across pages
- Environment variable configuration

### High Risk ❌
- None identified

---

## Summary

### Overall Difficulty: **MODERATE** (3-5 days)
- **Build Issues**: 1-3 (mostly path fixes)
- **Auth Implementation**: 1-2 days
- **Deployment Setup**: 2-4 hours
- **Testing**: 1 day

### Key Advantages
- ✅ Already using Convex (auth integrates seamlessly)
- ✅ Next.js 16 is well-supported on Vercel
- ✅ Most infrastructure is in place

### Main Challenges
- ⚠️ Need to add auth to all existing pages
- ⚠️ Fix build errors first
- ⚠️ Configure environment variables correctly

### Recommendation
**Proceed with implementation** - The work is straightforward and well-documented. Convex Auth is designed to work with your existing setup, and Vercel deployment is standard for Next.js apps.

