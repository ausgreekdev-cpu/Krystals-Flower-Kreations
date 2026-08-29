// Offline queue for POS sales + ticket check-ins (mirrors LUX fieldStore.js IndexedDB pattern)
// Queues POST /api/pos/sale and /api/tickets/check-in when offline, flushes on reconnect

const DB_NAME = 'krystal-offline';
const STORE = 'queue';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

export async function queueRequest(path, body, headers = {}) {
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const entry = { id, path, body, headers, createdAt: new Date().toISOString() };
  await tx('readwrite', (store) => store.add(entry));
  return id;
}

export async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromQueue(id) {
  await tx('readwrite', (store) => store.delete(id));
}

export async function flushQueue(token) {
  const queue = await getQueue();
  const results = [];
  for (const item of queue) {
    try {
      const headers = { 'Content-Type': 'application/json', ...item.headers };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(item.path, { method: 'POST', headers, body: JSON.stringify(item.body) });
      if (!res.ok) throw new Error(await res.text());
      await removeFromQueue(item.id);
      results.push({ id: item.id, ok: true });
    } catch (err) {
      results.push({ id: item.id, ok: false, error: err.message });
      // keep in queue for retry if offline (TypeError Failed to fetch)
      if (err.message.includes('Failed to fetch')) break;
    }
  }
  return results;
}

export function onOnline(callback) {
  window.addEventListener('online', callback);
  return () => window.removeEventListener('online', callback);
}

export function isOnline() {
  return navigator.onLine;
}
