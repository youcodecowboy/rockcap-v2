import { View } from 'react-native';
import { Stack } from 'expo-router';
import { DocTabProvider } from '@/contexts/TabContext';
import TabManager from '@/components/TabManager';

export default function DocsLayout() {
  // Render TabManager at the top of the docs Stack so tabs added via the
  // viewer's "Add to tabs" button are actually visible. Previously the
  // component existed but wasn't mounted anywhere — tapping the button
  // pushed a tab into context that had no on-screen representation.
  return (
    <DocTabProvider>
      <View style={{ flex: 1 }}>
        <TabManager />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="viewer" />
        </Stack>
      </View>
    </DocTabProvider>
  );
}
