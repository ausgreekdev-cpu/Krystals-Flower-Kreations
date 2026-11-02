import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../core/auth/authStore';

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      await login(data.user, data.token);
      if (data.user.role === 'customer') router.replace('/(customer)/home');
      else router.replace('/(staff)/pos');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#FFF7F0' }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: '#4A2C2A', marginBottom: 24 }}>Krystal’s Flower Kreations</Text>
      <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
      <TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
      {error ? <Text style={{ color: '#B85C5C', marginBottom: 12 }}>{error}</Text> : null}
      <TouchableOpacity onPress={submit} disabled={loading} style={{ backgroundColor: '#B85C5C', padding: 14, borderRadius: 8, alignItems: 'center' }}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Sign in</Text>}
      </TouchableOpacity>
    </View>
  );
}