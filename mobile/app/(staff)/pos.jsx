import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { catalogApi, posApi } from '../../core/api/customClient';
import { useAuth } from '../../core/auth/authStore';

export default function Pos() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    catalogApi.list().then(d => setProducts(d.products || d || [])).catch(() => setProducts([])).finally(() => setLoading(false));
  }, []);

  function add(p) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === p.id);
      if (idx >= 0) {
        const next = [...prev]; next[idx].quantity += 1; return next;
      }
      return [...prev, { productId: p.id, title: p.title, price: Number(p.price), quantity: 1 }];
    });
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const gst = subtotal * 0.1 / 1.1;
  const total = subtotal;

  async function checkout() {
    setSubmitting(true); setMessage('');
    try {
      const order = await posApi.sale({ items: cart.map(i => ({ productId: i.productId, quantity: i.quantity })), paymentMethod: 'cash' }, token);
      setMessage(`Sale ${order.orderNumber || order.id} recorded`);
      setCart([]);
    } catch (e) {
      setMessage(e.message || 'Sale failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFF7F0' }}>
      <FlatList data={products} keyExtractor={p => p.id} style={{ flex: 1 }} renderItem={({ item }) => (
        <TouchableOpacity onPress={() => add(item)} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
          <Text style={{ color: '#4A2C2A' }}>{item.title}</Text>
          <Text style={{ color: '#B85C5C' }}>${Number(item.price).toFixed(2)}</Text>
        </TouchableOpacity>
      )} />
      <View style={{ padding: 16, backgroundColor: '#fff' }}>
        <Text style={{ color: '#4A2C2A' }}>Items: {cart.length} Subtotal ${subtotal.toFixed(2)} GST ${gst.toFixed(2)} Total ${total.toFixed(2)}</Text>
        {message ? <Text style={{ color: '#B85C5C', marginTop: 8 }}>{message}</Text> : null}
        <TouchableOpacity onPress={checkout} disabled={submitting || cart.length === 0} style={{ marginTop: 12, backgroundColor: '#B85C5C', padding: 14, borderRadius: 8, alignItems: 'center' }}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Charge</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}