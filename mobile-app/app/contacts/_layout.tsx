import { Stack } from 'expo-router';

// Stack layout for Contacts. Only one screen today (index); future detail
// views open as Modals from within the list rather than as stack routes so
// the contact book stays the single source of truth for lookups.
export default function ContactsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
