import Constants from 'expo-constants';

// Resolves the base URL of the Next.js server for all mobile → server calls
// (daily-brief generation, bulk-upload processing, task AI, etc).
//
// URL resolution rules:
// - In dev, `localhost` is only reachable from the iOS simulator. On a real
//   device, `localhost` is the phone itself, so we derive the Mac's LAN IP
//   from Expo's bundler hostUri (e.g. "192.168.1.42:8081"). That host just
//   served the JS bundle, so by definition it's reachable from the device.
// - In prod, EXPO_PUBLIC_API_URL must be set to the deployed web origin.
// - EXPO_PUBLIC_API_URL takes precedence when it's explicitly set and NOT
//   pointing at localhost — CI runners, tunnelled dev, and prod builds all
//   keep working.
//
// This used to live duplicated in upload/index.tsx. Daily-brief and
// task-creation had the same localhost fallback and silently broke on
// physical devices until each one was reported.
export function resolveApiBase(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost')) return envUrl;
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(':')[0];
    return `http://${host}:3000`;
  }
  return envUrl || 'http://localhost:3000';
}
