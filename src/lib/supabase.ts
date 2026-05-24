import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// True only when both env vars are present. When false, the app runs fully on the existing
// local flows (demo mode / no backend) and every Supabase hook no-ops gracefully.
export const isSupabaseConfigured = Boolean(url && anonKey);

// During Expo's web static prerender there's no `window`, so AsyncStorage's web impl
// (window.localStorage) blows up when auth-js tries to recover a session at init.
// On that server pass we skip persisted storage entirely — the static HTML has no
// session anyway. Native and the browser runtime (both have `window`) get full persistence.
const isServerRender = typeof window === "undefined";

// Default export is the client, or null when unconfigured. Callers MUST guard on
// `isSupabaseConfigured` (or a null check) before using it.
const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: isServerRender
        ? { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        : { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

export default supabase;
