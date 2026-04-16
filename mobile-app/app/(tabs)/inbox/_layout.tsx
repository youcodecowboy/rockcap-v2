import { Stack } from 'expo-router';

export default function InboxLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[flagId]" />
      <Stack.Screen name="conversation/[id]" />
      <Stack.Screen name="conversation/new" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
