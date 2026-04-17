import { Stack } from 'expo-router';

// Stack layout for the Clients tab.
//
// Routes:
//   index                              — client list
//   new                                — create new client (HubSpot-aware autocomplete)
//   [clientId]/index                   — client detail (9 tabs)
//   [clientId]/projects/[projectId]    — project detail (6 tabs)
//
// The nested project route preserves the "back → client → clients list" trail.
// Each deeper screen can simply call router.back() and land on its parent.
export default function ClientsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[clientId]/index" />
      <Stack.Screen name="[clientId]/projects/[projectId]" />
    </Stack>
  );
}
