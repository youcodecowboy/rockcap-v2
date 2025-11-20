import { auth } from '@clerk/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || '';

if (!convexUrl) {
  throw new Error('Missing NEXT_PUBLIC_CONVEX_URL environment variable');
}

/**
 * Get an authenticated Convex client for use in API routes
 * This fetches the Clerk JWT token and sets it on the Convex client
 */
export async function getAuthenticatedConvexClient(): Promise<ConvexHttpClient> {
  const { getToken } = await auth();
  const token = await getToken({ template: 'convex' });
  
  const client = new ConvexHttpClient(convexUrl);
  if (token) {
    client.setAuth(token);
  }
  
  return client;
}

/**
 * Check if a request is authenticated by trying to get current user
 * This now uses Clerk's auth() to get the token
 */
export async function requireAuth(convexClient?: ConvexHttpClient) {
  try {
    // If no client provided, create an authenticated one
    const client = convexClient || await getAuthenticatedConvexClient();
    
    // Try to get current user - this will fail if not authenticated
    const user = await client.query(api.users.getCurrent, {});
    
    if (!user) {
      throw new Error('Unauthenticated');
    }

    return user;
  } catch (error) {
    console.error('Auth check failed:', error);
    throw new Error('Unauthenticated');
  }
}

/**
 * @deprecated Use getAuthenticatedConvexClient() instead
 * Extract auth token from Next.js request headers or body
 * Convex auth tokens can be passed in various ways
 */
export function getAuthTokenFromRequest(request: Request): string | undefined {
  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check custom header
  const convexAuth = request.headers.get('x-convex-auth');
  return convexAuth || undefined;
}

