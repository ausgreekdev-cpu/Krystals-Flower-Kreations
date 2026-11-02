import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, ActivityIndicator } from 'react-native';
import { catalogApi } from '../../core/api/customClient';

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/mobile/home-summary`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ featured: [], announcement: null, workshops: [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF7F0', padding: 16 }}>
      {data?.announcement ? <Text style={{ backgroundColor: '#B85C5C', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 16 }}>{data.announcement}</Text> : null}
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#4A2C2A', marginBottom: 12 }}>Featured blooms</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {(data?.featured || []).map(p => (
          <View key={p.id} style={{ width: 160, marginRight: 12 }}>
            {p.images?.[0]?.url ? <Image source={{ uri: p.images[0].url }} style={{ width: 160, height: 160, borderRadius: 12 }} /> : null}
            <Text style={{ marginTop: 6, color: '#4A2C2A' }}>{p.title}</Text>
            <Text style={{ color: '#B85C5C' }}>${Number(p.price).toFixed(2)}</Text>
          </View>
        ))}
      </ScrollView>
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#4A2C2A', marginTop: 24, marginBottom: 12 }}>Upcoming workshops</Text>
      {(data?.workshops || []).map(s => (
        <View key={s.id} style={{ backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8 }}>
          <Text style={{ fontWeight: '600', color: '#4A2C2A' }}>{s.workshop?.title}</Text>
          <Text style={{ color: '#666' }}>{new Date(s.startsAt).toLocaleString()} • {s.bookedCount}/{s.capacity} seats</Text>
        </View>
      ))}
    </ScrollView>
  );
}