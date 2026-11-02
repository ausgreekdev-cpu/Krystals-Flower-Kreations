import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../core/auth/authStore';
import { flushQueue } from '../../core/services/offlineSync';
import SyncStatusBanner from '../../core/components/SyncStatusBanner';

export default function StaffLayout() {
  const { token } = useAuth();
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      if (state.isConnected) flushQueue(token).catch(() => {});
    });
    return () => unsub && unsub();
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