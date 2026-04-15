'use client';

import { useQuery } from 'convex/react';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { api } from '../../../../../convex/_generated/api';

export default function GoogleCalendarCard() {
  const syncStatus = useQuery(api.googleCalendar.getSyncStatus, {});
  const searchParams = useSearchParams();
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const google = searchParams.get('google');
    if (google === 'success') {
      setStatusMessage('Google Calendar connected successfully');
      // Trigger initial sync
      fetch('/api/google/setup-sync', { method: 'POST' }).catch(console.error);
    } else if (google === 'denied') setStatusMessage('Google Calendar access was denied');
    else if (google === 'error') setStatusMessage('Failed to connect Google Calendar');

    if (google) {
      const timer = setTimeout(() => setStatusMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const handleConnect = () => {
    window.open('/api/google/auth', '_blank');
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Google Calendar? Your synced events will remain but no longer update.')) return;
    setDisconnecting(true);
    try {
      await fetch('/api/google/disconnect', { method: 'POST' });
    } catch (err) {
      console.error('Disconnect failed:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  if (syncStatus === undefined) {
    return (
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] px-4 py-4 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--m-text-tertiary)]" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-[var(--m-text-tertiary)] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-[var(--m-text-primary)]">
              Google Calendar
            </div>
            {syncStatus.isConnected ? (
              <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
                Connected as {syncStatus.connectedEmail}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
                Sync your calendar events and add tasks to your schedule
              </div>
            )}
          </div>
        </div>

        {statusMessage && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-[12px] font-medium ${
            searchParams.get('google') === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}>
            {statusMessage}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {syncStatus.isConnected ? (
            <>
              <button
                onClick={async () => {
                  setSyncing(true);
                  setStatusMessage(null);
                  try {
                    const res = await fetch('/api/google/setup-sync', { method: 'POST' });
                    const data = await res.json();
                    setStatusMessage(`Synced ${data.eventsSynced} events from Google Calendar`);
                    setTimeout(() => setStatusMessage(null), 5000);
                  } catch {
                    setStatusMessage('Sync failed');
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                className="w-full py-2 px-3 text-[13px] font-medium text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg active:bg-[var(--m-bg-subtle)] disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full py-2 px-3 text-[13px] font-medium text-[var(--m-error)] bg-red-50 rounded-lg active:bg-red-100 disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              className="w-full py-2 px-3 text-[13px] font-medium text-[var(--m-text-on-brand)] bg-[var(--m-bg-brand)] rounded-lg active:opacity-80"
            >
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
