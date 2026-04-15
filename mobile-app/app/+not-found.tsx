import { Link, Stack } from 'expo-router';
import { View, Text } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center p-5 bg-m-bg">
        <Text className="text-xl font-bold text-m-text-primary">
          This screen doesn't exist.
        </Text>
        <Link href="/" className="mt-4 py-4">
          <Text className="text-sm text-m-accent underline">Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}
