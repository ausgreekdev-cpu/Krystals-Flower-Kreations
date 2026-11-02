import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const KEY = 'kfk_auth';

export const useAuth = create((set, get) => ({
  user: null,
  token: null,
  ready: false,
  async hydrate() {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({ user: parsed.user, token: parsed.token, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },
  async login(user, token) {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ user, token }));
    set({ user, token });
  },
  async logout() {
    await SecureStore.deleteItemAsync(KEY);
    set({ user: null, token: null });
  },
  isStaff() {
    const r = get().user?.role;
    return r === 'staff' || r === 'maker' || r === 'admin' || r === 'developer';
  },
}));