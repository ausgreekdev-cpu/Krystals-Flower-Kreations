import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export default function Workshops() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${BASE}/api/workshops`).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : d.workshops || [])).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);
  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <FlatList style={{ flex: 1, backgroundColor: '#FFF7F0' }} data={items} keyExtractor={w => w.id} renderItem={({ item }) => (
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
        <Text style={{ color: '#4A2C2A', fontWeight: '600' }}>{item.title}</Text>
        <Text style={{ color: '#666' }}>{item.status} • capacity {item.capacity}</Text>
      </View>
    )} />
  );
}