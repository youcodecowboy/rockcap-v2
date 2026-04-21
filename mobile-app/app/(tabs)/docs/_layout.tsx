import { Stack } from 'expo-router';
import { DocTabProvider } from '@/contexts/TabContext';

// TabManager used to live here above the Stack, but each docs screen
// renders its own <MobileHeader /> at the top — putting TabManager above
// the Stack put it ABOVE the black RockCap header, where the iPhone
// dynamic island cropped it. TabManager now renders inside each screen
// directly below MobileHeader so it's always visible and inside the
// screen's safe area.
export default function DocsLayout() {
  return (
    <DocTabProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="viewer" />
      </Stack>
    </DocTabProvider>
  );
}
