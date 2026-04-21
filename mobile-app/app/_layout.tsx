import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { ClerkProvider, ClerkLoaded, useAuth } from '@clerk/clerk-expo';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { OfflineProvider, useOffline } from '@/contexts/OfflineContext';
import { DocTabProvider } from '@/contexts/TabContext';
import OfflineBanner from '@/components/ui/OfflineBanner';

import '../global.css';

const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL!
);

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const { isOnline } = useOffline();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === 'sign-in';

    if (!isSignedIn && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (isSignedIn && inAuthGroup) {
      router.replace('/');
    }
  }, [isSignedIn, isLoaded, segments]);

  return (
    <>
      {!isOnline && <OfflineBanner />}
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <ClerkLoaded>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <OfflineProvider>
            <DocTabProvider>
              <StatusBar style="light" />
              <AuthGate />
            </DocTabProvider>
          </OfflineProvider>
        </ConvexProviderWithClerk>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
