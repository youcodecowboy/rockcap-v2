import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

// Ensures the in-app browser closes cleanly after OAuth redirect
WebBrowser.maybeCompleteAuthSession();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function useGoogleCalendarAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    scopes: SCOPES,
    // `expo-auth-session/providers/google` uses the authorization code flow
    // with PKCE by default when responseType is not 'id_token'.
  });

  // Dev-time sanity log: confirm client IDs are present.
  useEffect(() => {
    if (__DEV__) {
      if (!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) {
        console.warn('[googleCalendarAuth] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID not set');
      }
      if (!process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) {
        console.warn('[googleCalendarAuth] EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID not set');
      }
    }
  }, []);

  return { request, response, promptAsync };
}
