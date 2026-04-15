import { useSignIn } from '@clerk/clerk-expo';
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSignIn = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-m-bg-brand"
    >
      <View className="flex-1 justify-center px-8">
        <Text className="text-3xl font-bold text-m-text-on-brand text-center mb-2">
          RockCap
        </Text>
        <Text className="text-sm text-m-text-on-brand/50 text-center mb-10">
          Property Finance Platform
        </Text>

        <View className="bg-m-bg-card rounded-xl p-6 gap-4">
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            className="bg-m-bg-subtle rounded-lg px-4 py-3 text-m-text-primary text-base"
            placeholderTextColor="#d4d4d4"
          />

          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            className="bg-m-bg-subtle rounded-lg px-4 py-3 text-m-text-primary text-base"
            placeholderTextColor="#d4d4d4"
          />

          {error ? (
            <Text className="text-m-error text-sm text-center">{error}</Text>
          ) : null}

          <TouchableOpacity
            onPress={onSignIn}
            disabled={loading || !email || !password}
            className="bg-m-accent rounded-lg py-3.5 items-center mt-2"
            style={{ opacity: loading || !email || !password ? 0.5 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-m-text-on-brand font-semibold text-base">
                Sign In
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
