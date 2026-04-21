import { Stack } from 'expo-router';

// DocTabProvider moved up to the root _layout.tsx so doc tabs persist
// across the entire app (home, clients, inbox, etc.), not just within
// the docs stack. TabManager is rendered by MobileHeader so it shows
// wherever the header shows.
export default function DocsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="viewer" />
    </Stack>
  );
}
