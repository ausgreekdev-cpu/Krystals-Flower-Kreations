import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useAuth } from '../../core/auth/authStore';
const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export default function Orders() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${BASE}/api/orders`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setOrders(Array.isArray(d) ? d : d.orders || []))
      .catch(() => setOrders([])).finally(() => setLoading(false));
  }, [token]);
  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <FlatList style={{ flex: 1, backgroundColor: '#FFF7F0' }} data={orders} keyExtractor={o => o.id} renderItem={({ item }) => (
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
        <Text style={{ color: '#4A2C2A', fontWeight: '600' }}>{item.orderNumber}</Text>
        <Text style={{ color: '#666' }}>{item.status} • ${Number(item.total).toFixed(2)}</Text>
      </View>
    )} />
  );
}