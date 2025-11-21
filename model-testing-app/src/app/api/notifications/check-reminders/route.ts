import { NextRequest, NextResponse } from 'next/server';
import { fetchQuery, fetchMutation } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Check for due reminders and create notifications
 * This endpoint should be called via cron job (e.g., every minute)
 * POST /api/notifications/check-reminders
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const convexClient = await getAuthenticatedConvexClient();
    try {
      await requireAuth(convexClient);
    } catch (authError) {
      return ErrorResponses.unauthenticated();
    }
    // Get reminders due now (within 1 minute window)
    const dueReminders = await fetchQuery(api.reminders.getDue, {
      bufferMinutes: 1, // Check reminders due within 1 minute
    }) as any;

    if (!dueReminders || dueReminders.length === 0) {
      return NextResponse.json({
        message: 'No reminders due',
        notificationsCreated: 0,
      });
    }

    const notificationsCreated: string[] = [];
    const errors: Array<{ reminderId: string; error: string }> = [];

    // Create notifications for each due reminder
    for (const reminder of dueReminders) {
      try {
        // Check if notification already exists for this reminder
        // (We'll skip this check for now and let the system handle duplicates)

        // Create notification
        const notificationId = await fetchMutation(api.notifications.create, {
          userId: reminder.userId,
          type: 'reminder',
          title: `Reminder: ${reminder.title}`,
          message: reminder.description || `Reminder scheduled for ${new Date(reminder.scheduledFor).toLocaleString()}`,
          relatedId: reminder._id,
        }) as any;

        notificationsCreated.push(notificationId);

        // Mark reminder notification as sent (update isRead flag)
        await fetchMutation(api.reminders.markAsRead, {
          id: reminder._id,
        }) as any;
      } catch (error) {
        console.error(`Failed to create notification for reminder ${reminder._id}:`, error);
        errors.push({
          reminderId: reminder._id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      message: 'Reminder check completed',
      remindersChecked: dueReminders.length,
      notificationsCreated: notificationsCreated.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    console.error('Error checking reminders:', error);
    return ErrorResponses.internalError(
      error instanceof Error ? error : 'Failed to check reminders'
    );
  }
}

// Also support GET for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}

