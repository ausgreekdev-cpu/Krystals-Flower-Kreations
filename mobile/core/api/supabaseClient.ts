// Supabase Realtime client — custom BOM/Kanban/workshop live subscriptions
// For headless custom build, Express remains source of truth; Supabase Realtime mirrors low-stock + Kanban
// Configure in .env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY

import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = url && anon ? createClient(url, anon) : null;

export function isSupabaseConfigured(): boolean {
  return !!supabase;
}

// Channels
export function subscribeKanban(onUpdate: (payload: any) => void) {
  if (!supabase) return () => {};
  const ch = supabase
    .channel('kanban')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_art_orders' }, onUpdate)
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export function subscribeWorkshopSeats(workshopId: string, onUpdate: (payload: any) => void) {
  if (!supabase) return () => {};
  const ch = supabase
    .channel(`workshop-${workshopId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workshop_sessions', filter: `workshop_id=eq.${workshopId}` }, onUpdate)
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export function subscribeLowStock(onUpdate: (payload: any) => void) {
  if (!supabase) return () => {};
  const ch = supabase
    .channel('low-stock')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_materials' }, onUpdate)
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
