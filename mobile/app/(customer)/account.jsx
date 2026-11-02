import { View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../../core/auth/authStore';

export default function Account() {
  const { user, logout } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF7F0' }}>
      <Text style={{ fontSize: 18, color: '#4A2C2A' }}>{user?.name || 'Guest'}</Text>
      <Text style={{ color: '#666', marginTop: 4 }}>{user?.email}</Text>
      <TouchableOpacity onPress={logout} style={{ marginTop: 24, padding: 12, backgroundColor: '#B85C5C', borderRadius: 8 }}>
        <Text style={{ color: '#fff' }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}