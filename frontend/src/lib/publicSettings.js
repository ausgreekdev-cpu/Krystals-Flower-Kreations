// Cached public settings (/api/settings) shared by the whole storefront.
// One fetch per page load; theme.js and every component read from the same
// snapshot. After an admin save, call invalidatePublicSettings() to refetch.
import { useSyncExternalStore, useCallback } from 'react';

let snapshot = null; // last payload, or null before the first load
let promise = null;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    if (!res.ok) return snapshot;
    const data = await res.json();
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      snapshot = data;
      emit();
    }
    return snapshot;
  } catch {
    return snapshot; // offline/API down — keep whatever we have
  }
}

// Load once (memoised). force=true refetches (call after saving settings).
export function loadPublicSettings({ force = false } = {}) {
  if (force) {
    promise = fetchSettings();
    return promise;
  }
  if (!promise) promise = fetchSettings();
  return promise;
}

export function getPublicSettings() {
  return snapshot || {};
}

export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Refetch after an admin settings save so theme + storefront copy update live.
export function invalidatePublicSettings() {
  return loadPublicSettings({ force: true });
}

// React hook — re-renders whenever the settings snapshot changes.
export function usePublicSettings() {
  const getSnap = useCallback(() => snapshot, []);
  const s = useSyncExternalStore(subscribeSettings, getSnap, getSnap);
  return s || {};
}

// Convenience: one key with a fallback.
export function useSetting(key, fallback = '') {
  const s = usePublicSettings();
  const v = s[key];
  return v === undefined || v === null || v === '' ? fallback : v;
}

export function isTruthy(v) {
  return v === true || v === '1' || v === 'true';
}
