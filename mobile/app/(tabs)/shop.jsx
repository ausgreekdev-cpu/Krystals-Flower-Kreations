import { useEffect, useState } from 'react';
import { FlatList, Text, View, Pressable, Image, TextInput } from 'react-native';
import { Link } from 'expo-router';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export default function Shop() {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/products?q=${encodeURIComponent(q)}`).then(r=>r.json()).then(d=> setProducts(d.products || d)).catch(()=>{});
  }, [q]);
  return (
    <View style={{ flex: 1, backgroundColor: '#FFF7F0', padding: 12 }}>
      <TextInput value={q} onChangeText={setQ} placeholder="Search — rose, banksia, cricut..." style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E8CFCF' }} />
      <FlatList data={products} keyExtractor={p=>p.id} numColumns={2} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ paddingVertical: 12, gap: 12 }}
        renderItem={({item})=> (
          <Link href={`/product/${item.slug}`} asChild>
            <Pressable style={{ flex: 1, backgroundColor: 'white', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E8CFCF' }}>
              <Image source={{ uri: item.images?.[0]?.url || `https://picsum.photos/seed/${item.slug}/400/400` }} style={{ height: 140 }} />
              <View style={{ padding: 10 }}>
                <Text style={{ fontWeight: '700', color: '#4A2C2A' }} numberOfLines={2}>{item.title}</Text>
                <Text style={{ color: '#B85C5C', marginTop: 4, fontWeight: '700' }}>${Number(item.price).toFixed(2)} AUD</Text>
                <Text style={{ color: '#6B4A4A', fontSize: 11 }}>{item.stockMode === 'made_to_order' ? 'Made to order' : item.type === 'digital_template' ? 'Digital SVG' : 'In stock • Perth'}</Text>
              </View>
            </Pressable>
          </Link>
        )} ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24, color: '#6B4A4A' }}>No blooms yet — seed the API then pull to refresh.</Text>}
      />
    </View>
  );
}
