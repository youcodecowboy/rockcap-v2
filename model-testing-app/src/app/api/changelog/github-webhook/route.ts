import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation } from 'convex/nextjs';
import crypto from 'crypto';

/**
 * GitHub Webhook API Route
 * 
 * This endpoint receives GitHub push events and automatically adds entries to the changelog.
 * 
 * Setup:
 * 1. Add GITHUB_WEBHOOK_SECRET to your environment variables
 * 2. Configure GitHub webhook:
 *    - URL: https://your-domain.com/api/changelog/github-webhook
 *    - Content type: application/json
 *    - Secret: (same as GITHUB_WEBHOOK_SECRET)
 *    - Events: Just the "push" event
 * 
 * The changelog entry will include:
 * - Commit messages from the push
 * - Branch name
 * - Author information
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    
    if (!secret) {
      console.error('GITHUB_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    // Verify webhook signature
    const signature = request.headers.get('x-hub-signature-256');
    const body = await request.text();
    
    if (signature) {
      const hmac = crypto.createHmac('sha256', secret);
      const digest = 'sha256=' + hmac.update(body).digest('hex');
      
      if (signature !== digest) {
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(body);
    
    // Only process push events
    if (payload.ref && payload.commits && Array.isArray(payload.commits)) {
      const branch = payload.ref.replace('refs/heads/', '');
      const commits = payload.commits;
      
      // Create a changelog entry for each commit (or combine them)
      if (commits.length > 0) {
        // Option 1: Create one entry per commit
        for (const commit of commits) {
          const description = `[${branch}] ${commit.message.split('\n')[0]}`;
          
          await fetchMutation(api.changelog.add as any, {
            description,
          }) as any;
        }
        
        return NextResponse.json({
          success: true,
          entriesAdded: commits.length,
        });
      }
    }
    
    // If it's not a push event or has no commits, return success but do nothing
    return NextResponse.json({
      success: true,
      message: 'Not a push event or no commits',
    });
  } catch (error: any) {
    console.error('GitHub webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Manual API endpoint to add a changelog entry
 * Useful for testing or manual entries
 * 
 * POST /api/changelog/github-webhook
 * Body: { description: string }
 * 
 * Or use the Convex mutation directly from the frontend
 */
export async function PUT(request: NextRequest) {
  try {
    const { description } = await request.json();
    
    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }
    
    await fetchMutation(api.changelog.add as any, {
      description,
    }) as any;
    
    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('Add changelog entry error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add changelog entry' },
      { status: 500 }
    );
  }
}

