import { Stack, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useAuth } from '../core/auth/authStore';
import { registerPushToken } from '../core/services/pushNotifications';

export default function RootLayout() {
  const { ready, hydrate, user, token } = useAuth();
  useEffect(() => { hydrate(); }, []);
  useEffect(() => {
    if (user && token) {
      const base = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
      registerPushToken(base, token).catch(() => {});
    }
  }, [user, token]);
  if (!ready) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#FFF7F0' }, headerTintColor: '#4A2C2A' }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[slug]" options={{ title: 'Bloom' }} />
        <Stack.Screen name="configurator" options={{ title: 'Custom Bouquet — Perth' }} />
        <Stack.Screen name="checkout" options={{ title: 'Checkout • Perth WA', presentation: 'modal' }} />
      </Stack>
      {!user ? <Redirect href="/(auth)/login" /> : null}
    </>
  );
}
