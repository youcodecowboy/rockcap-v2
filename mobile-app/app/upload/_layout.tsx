import { Stack } from 'expo-router';

// Stack layout for the Upload flow.
//
// Routes:
//   index             — setup form (scope, client, project, folder, files)
//   [batchId]         — batch detail / processing status + review entry (Phase 2)
export default function UploadLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[batchId]" />
    </Stack>
  );
}
