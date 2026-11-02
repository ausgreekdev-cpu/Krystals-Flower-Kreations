import { View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../../core/auth/authStore';
import { useRouter } from 'expo-router';
export default function More() {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: '#FFF7F0' }}>
      <Text style={{ fontSize: 18, color: '#4A2C2A' }}>{user?.name}</Text>
      <Text style={{ color: '#666' }}>{user?.role}</Text>
      <TouchableOpacity onPress={() => router.push('/(customer)/home')} style={{ marginTop: 24, padding: 12, backgroundColor: '#fff', borderRadius: 8 }}>
        <Text>Switch to Customer View</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={logout} style={{ marginTop: 12, padding: 12, backgroundColor: '#B85C5C', borderRadius: 8 }}>
        <Text style={{ color: '#fff' }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}