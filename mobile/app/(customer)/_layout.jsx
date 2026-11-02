import { Tabs } from 'expo-router';

export default function CustomerLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#B85C5C', tabBarStyle: { backgroundColor: '#FFF7F0' } }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
      <Tabs.Screen name="workshops" options={{ title: 'Workshops' }} />
      <Tabs.Screen name="blog" options={{ title: 'Journal' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}