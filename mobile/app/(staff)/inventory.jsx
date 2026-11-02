import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${BASE}/api/inventory/low-stock`).then(r => r.json()).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);
  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <FlatList style={{ flex: 1, backgroundColor: '#FFF7F0' }} data={Array.isArray(items) ? items : items?.items || []} keyExtractor={(i, idx) => i.id || String(idx)} renderItem={({ item }) => (
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
        <Text style={{ color: '#4A2C2A' }}>{item.product?.title || item.title || item.sku}</Text>
        <Text style={{ color: '#B85C5C' }}>On hand: {item.onHand ?? item.quantity ?? 0}</Text>
      </View>
    )} />
  );
}