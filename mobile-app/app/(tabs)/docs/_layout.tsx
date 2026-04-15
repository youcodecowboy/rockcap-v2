import { Stack } from 'expo-router';
import { DocTabProvider } from '@/contexts/TabContext';

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
