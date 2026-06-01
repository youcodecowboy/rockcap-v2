import { Stack } from 'expo-router';
import { useColors } from '@/lib/useColors';

export default function SettingsLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg.base },
      }}
    />
  );
}
