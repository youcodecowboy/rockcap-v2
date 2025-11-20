# Vercel Deployment Checklist

## Common 404 Error Fixes

If you're getting a 404 error on Vercel, check the following **in order**:

### 🔴 CRITICAL: Check Vercel Root Directory (Most Common Issue)

**This is the #1 cause of 404 errors when env vars are set correctly.**

1. Go to your Vercel project dashboard
2. Click on **Settings** → **General**
3. Scroll down to **Root Directory**
4. **IMPORTANT**: Set Root Directory to `model-testing-app` (if your Next.js app is in a subdirectory)
5. If Root Directory is empty or set to `.`, and your app is in `model-testing-app/`, this will cause 404 errors
6. Save and redeploy

**Alternative**: If you can't change root directory, move `vercel.json` to the repository root and update it with:
```json
{
  "buildCommand": "cd model-testing-app && npm run build",
  "installCommand": "cd model-testing-app && npm install",
  "framework": "nextjs",
  "rootDirectory": "model-testing-app"
}
```

### 1. Required Environment Variables

Make sure these are set in your Vercel project settings:

#### Clerk Authentication (REQUIRED)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Your Clerk publishable key
- `CLERK_SECRET_KEY` - Your Clerk secret key

#### Convex Backend (REQUIRED)
- `NEXT_PUBLIC_CONVEX_URL` - Your Convex deployment URL (e.g., `https://your-deployment.convex.cloud`)

#### Optional (if using these features)
- `HUBSPOT_ACCESS_TOKEN` - For HubSpot integration
- `COMPANIES_HOUSE_API_KEY` - For Companies House API

### 2. Verify Build Success

1. Go to Vercel dashboard → **Deployments** tab
2. Click on the latest deployment
3. Check the **Build Logs** tab
4. Look for:
   - ✅ Build completed successfully
   - ❌ Any errors (TypeScript, missing dependencies, etc.)
5. If build fails, fix errors and redeploy

### 3. Verify Clerk Configuration

1. Ensure your Clerk application is set up at https://dashboard.clerk.com
2. Create a JWT Template named `convex` (if not already done)
3. Copy the publishable key and secret key from Clerk dashboard
4. Add them to Vercel environment variables
5. **IMPORTANT**: In Clerk dashboard → **Paths**, verify:
   - Sign-in URL matches your Vercel domain
   - After sign-in URL is set correctly
   - After sign-up URL is set correctly

### 4. Test the Deployment

1. Visit your Vercel deployment URL
2. **Expected behavior**:
   - If not authenticated: Should redirect to `/sign-in` (Clerk's sign-in page)
   - If authenticated: Should show your dashboard
3. **If you get 404**:
   - Check browser console for errors
   - Check Vercel function logs
   - Try accessing `/sign-in` directly

### 5. Middleware Configuration

The middleware protects all routes except:
- `/sign-in` and `/sign-up` (Clerk default routes)
- `/login` and `/signup` (custom routes)

If you're accessing the root `/` route, you'll be redirected to sign-in if not authenticated.

### 6. Debugging Steps

**Check Deployment Logs:**
```bash
# In Vercel dashboard, check:
1. Build Logs - Look for build errors
2. Function Logs - Look for runtime errors
3. Edge Network Logs - Look for routing issues
```

**Test Locally First:**
```bash
cd model-testing-app
npm run build
npm run start
# Visit http://localhost:3000
# If this works, the issue is Vercel-specific
```

**Common Issues:**

| Issue | Solution |
|-------|----------|
| 404 on all routes | Check Root Directory setting in Vercel |
| 404 on root route only | Expected - should redirect to `/sign-in` |
| Build fails | Check build logs for specific errors |
| Redirect loop | Check Clerk redirect URLs in dashboard |
| Middleware errors | Check Clerk env vars are set correctly |

### 7. Testing Deployment

After setting environment variables:
1. Trigger a new deployment in Vercel
2. Visit your deployed URL
3. You should be redirected to Clerk sign-in page
4. After signing in, you should see the dashboard

