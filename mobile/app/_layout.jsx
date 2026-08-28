import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#FFF7F0' }, headerTintColor: '#4A2C2A' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[slug]" options={{ title: 'Bloom' }} />
        <Stack.Screen name="checkout" options={{ title: 'Checkout • Perth WA', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
