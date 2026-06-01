import { useSSO } from '@clerk/clerk-expo';
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/lib/useColors';

// Required for OAuth redirect handling
WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const c = useColors();
  const { startSSOFlow } = useSSO();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onGoogleSignIn = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow]);

  return (
    <View className="flex-1 bg-m-bg justify-center px-8">
      <Text className="text-3xl font-bold text-m-text-primary text-center mb-2">
        RockCap
      </Text>
      <Text className="text-sm text-m-text-tertiary text-center mb-10">
        Property Finance Platform
      </Text>

      <View
        className="rounded-xl p-6 gap-4"
        style={{
          backgroundColor: c.bg.card,
          borderWidth: 1,
          borderColor: c.border.default,
        }}
      >
        <TouchableOpacity
          onPress={onGoogleSignIn}
          disabled={loading}
          className="rounded-lg py-3.5 flex-row items-center justify-center gap-3"
          style={{
            opacity: loading ? 0.5 : 1,
            backgroundColor: c.bg.cardAlt,
            borderWidth: 1,
            borderColor: c.border.default,
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={c.text.primary} />
          ) : (
            <>
              <Text className="text-lg" style={{ color: c.text.primary }}>G</Text>
              <Text className="text-m-text-primary font-semibold text-base">
                Continue with Google
              </Text>
            </>
          )}
        </TouchableOpacity>

        {error ? (
          <Text className="text-m-error text-sm text-center">{error}</Text>
        ) : null}
      </View>
    </View>
  );
}
