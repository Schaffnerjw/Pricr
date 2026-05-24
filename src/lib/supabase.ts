import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// True only when both env vars are present. When false, the app runs fully on the existing
// local flows (demo mode / no backend) and every Supabase hook no-ops gracefully.
export const isSupabaseConfigured = Boolean(url && anonKey);

// Default export is the client, or null when unconfigured. Callers MUST guard on
// `isSupabaseConfigured` (or a null check) before using it.
const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export default supabase;
