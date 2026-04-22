import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useAction, useMutation } from 'convex/react';
import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react-native';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { useGoogleCalendarAuth } from '@/lib/googleCalendarAuth';
import { colors } from '@/lib/theme';

export default function GoogleCalendarCard() {
  const syncStatus = useQuery(api.googleCalendar.getSyncStatus, {});
  const exchangeMobileCode = useAction(api.googleCalendar.exchangeMobileCode);
  const disconnect = useMutation(api.googleCalendar.disconnect);
  const { getToken } = useAuth();
  const { request, response, promptAsync } = useGoogleCalendarAuth();

  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // React to OAuth prompt outcome
  useEffect(() => {
    (async () => {
      if (!response) return;
      if (response.type === 'success') {
        const code = response.params.code;
        const codeVerifier = request?.codeVerifier;
        const redirectUri = request?.redirectUri;
        if (!code || !codeVerifier || !redirectUri) {
          setStatusMessage({ kind: 'error', text: 'OAuth response missing fields' });
          setConnecting(false);
          return;
        }
        try {
          const result = await exchangeMobileCode({ code, codeVerifier, redirectUri });
          setStatusMessage({ kind: 'success', text: `Connected as ${result.email}` });
          // Fire initial sync (non-blocking to UI once queued)
          triggerInitialSync();
        } catch (err) {
          setStatusMessage({
            kind: 'error',
            text: err instanceof Error ? err.message : 'Connection failed',
          });
        } finally {
          setConnecting(false);
        }
      } else if (response.type === 'cancel' || response.type === 'dismiss') {
        setStatusMessage({ kind: 'error', text: 'Connection cancelled' });
        setConnecting(false);
      } else if (response.type === 'error') {
        setStatusMessage({
          kind: 'error',
          text: response.error?.message || 'Google auth error',
        });
        setConnecting(false);
      }
    })();
  }, [response]);

  // Auto-clear status messages after 5s
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL;

  async function triggerInitialSync() {
    if (!apiBase) return;
    try {
      const token = await getToken({ template: 'convex' });
      await fetch(`${apiBase}/api/google/setup-sync`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch (err) {
      console.warn('Initial sync failed:', err);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setStatusMessage(null);
    try {
      await promptAsync();
      // Result is handled in the effect above
    } catch (err) {
      setStatusMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not start OAuth',
      });
      setConnecting(false);
    }
  }

  async function handleSyncNow() {
    if (!apiBase) {
      setStatusMessage({ kind: 'error', text: 'API base URL not configured' });
      return;
    }
    setSyncing(true);
    setStatusMessage(null);
    try {
      const token = await getToken({ template: 'convex' });
      const res = await fetch(`${apiBase}/api/google/setup-sync`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setStatusMessage({
        kind: 'success',
        text: `Synced ${data.eventsSynced} events from Google Calendar`,
      });
    } catch (err) {
      setStatusMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Sync failed',
      });
    } finally {
      setSyncing(false);
    }
  }

  function handleDisconnect() {
    Alert.alert(
      'Disconnect Google Calendar?',
      'Your synced events will remain but no longer update.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setDisconnecting(true);
            try {
              await disconnect({});
              setStatusMessage({ kind: 'success', text: 'Disconnected' });
            } catch (err) {
              setStatusMessage({
                kind: 'error',
                text: err instanceof Error ? err.message : 'Disconnect failed',
              });
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ],
    );
  }

  if (syncStatus === undefined) {
    return (
      <View className="bg-m-bg-card border border-m-border rounded-2xl px-4 py-6 items-center justify-center">
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <View className="bg-m-bg-card border border-m-border rounded-2xl overflow-hidden">
      <View className="px-4 py-4">
        <View className="flex-row items-center gap-3">
          <Calendar size={20} color={colors.textTertiary} />
          <View className="flex-1">
            <Text className="text-[14px] font-semibold text-m-text-primary">
              Google Calendar
            </Text>
            <Text className="text-[12px] text-m-text-tertiary mt-0.5">
              {syncStatus.isConnected
                ? `Connected as ${syncStatus.connectedEmail}`
                : 'Sync your calendar events and add tasks to your schedule'}
            </Text>
          </View>
        </View>

        {statusMessage && (
          <View
            className={`mt-3 px-3 py-2 rounded-lg ${
              statusMessage.kind === 'success' ? 'bg-emerald-50' : 'bg-red-50'
            }`}
          >
            <Text
              className={`text-[12px] font-medium ${
                statusMessage.kind === 'success' ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {statusMessage.text}
            </Text>
          </View>
        )}

        <View className="mt-3 gap-2">
          {syncStatus.isConnected ? (
            <>
              <TouchableOpacity
                onPress={handleSyncNow}
                disabled={syncing}
                className="py-2 px-3 border border-m-border rounded-lg items-center active:bg-m-bg-subtle"
                style={syncing ? { opacity: 0.5 } : undefined}
              >
                <Text className="text-[13px] font-medium text-m-text-primary">
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDisconnect}
                disabled={disconnecting}
                className="py-2 px-3 rounded-lg items-center bg-red-50 active:bg-red-100"
                style={disconnecting ? { opacity: 0.5 } : undefined}
              >
                <Text className="text-[13px] font-medium text-m-error">
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={handleConnect}
              disabled={connecting || !request}
              className="py-2 px-3 rounded-lg items-center bg-m-bg-brand active:opacity-80"
              style={connecting || !request ? { opacity: 0.5 } : undefined}
            >
              <Text className="text-[13px] font-medium text-m-text-on-brand">
                {connecting ? 'Connecting...' : 'Connect Google Calendar'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
