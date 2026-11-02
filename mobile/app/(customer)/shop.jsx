import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { catalogApi } from '../../core/api/customClient';

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    catalogApi.list().then(d => setProducts(d.products || d || [])).catch(() => setProducts([])).finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: '#FFF7F0' }}
      data={products}
      keyExtractor={p => p.id}
      renderItem={({ item }) => (
        <TouchableOpacity style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
          <Text style={{ color: '#4A2C2A', fontWeight: '600' }}>{item.title}</Text>
          <Text style={{ color: '#B85C5C' }}>${Number(item.price).toFixed(2)}</Text>
        </TouchableOpacity>
      )}
    />
  );
}