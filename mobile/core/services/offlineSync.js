import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'kfk_offline_queue';

export async function enqueue(item) {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue = raw ? JSON.parse(raw) : [];
  queue.push({ ...item, id: item.id || (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)), status: 'pending', createdAt: Date.now() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return queue.length;
}

export async function getQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function flushQueue(token) {
  const queue = await getQueue();
  const remaining = [];
  for (const item of queue) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method || 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': item.id },
        body: JSON.stringify(item.payload || {}),
      });
      if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      remaining.push({ ...item, status: 'failed', errorReason: e.message });
    }
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return { flushed: queue.length - remaining.length, remaining: remaining.length };
}

export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}