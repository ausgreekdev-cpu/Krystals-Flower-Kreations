import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../../core/auth/authStore';
import { flushQueue } from '../../core/services/offlineSync';
import SyncStatusBanner from '../../core/components/SyncStatusBanner';

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export default function StaffLayout() {
  const { token } = useAuth();
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${BASE}/api/health`);
        if (res.ok) await flushQueue(token);
      } catch {}
    }, 15000);
    return () => clearInterval(timer);
  }, [token]);

  return (
    <>
      <SyncStatusBanner />
      <Tabs screenOptions={{ tabBarActiveTintColor: '#B85C5C', tabBarStyle: { backgroundColor: '#FFF7F0' } }}>
        <Tabs.Screen name="pos" options={{ title: 'POS' }} />
        <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
        <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
        <Tabs.Screen name="workshops" options={{ title: 'Workshops' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
      </Tabs>
    </>
  );
}