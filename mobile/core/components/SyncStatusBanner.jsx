import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { getQueue, flushQueue } from '../services/offlineSync';
import { useAuth } from '../auth/authStore';

export default function SyncStatusBanner() {
  const { token } = useAuth();
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function refresh() { setCount((await getQueue()).length); }
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, []);

  if (!count) return null;
  return (
    <View style={{ backgroundColor: '#B85C5C', padding: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: '#fff' }}>{count} queued action(s)</Text>
      <TouchableOpacity onPress={async () => { setSyncing(true); await flushQueue(token); setSyncing(false); refresh(); }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>{syncing ? 'Syncing…' : 'Retry'}</Text>
      </TouchableOpacity>
    </View>
  );
}