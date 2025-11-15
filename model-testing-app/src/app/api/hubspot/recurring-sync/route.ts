import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

export async function GET() {
  try {
    const config = await fetchQuery(api.hubspotSync.getSyncConfig);
    
    return NextResponse.json({
      success: true,
      config: config || {
        isRecurringSyncEnabled: false,
        syncIntervalHours: 24,
      },
    });
  } catch (error: any) {
    console.error('Error fetching sync config:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch sync config',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { isRecurringSyncEnabled, syncIntervalHours } = await request.json();
    
    if (typeof isRecurringSyncEnabled !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: 'isRecurringSyncEnabled must be a boolean',
      }, { status: 400 });
    }
    
    await fetchMutation(api.hubspotSync.updateSyncConfig, {
      isRecurringSyncEnabled,
      syncIntervalHours: syncIntervalHours || 24,
    });
    
    return NextResponse.json({
      success: true,
      message: `Recurring sync ${isRecurringSyncEnabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error: any) {
    console.error('Error updating sync config:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update sync config',
    }, { status: 500 });
  }
}

