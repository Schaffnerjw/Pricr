import AsyncStorage from "@react-native-async-storage/async-storage";
import { Business, User, SavedQuote } from "../types";
export const KEYS = { currentUser:"pricr_current_user", business:(c:string)=>`pricr_business_${c}`, users:(c:string)=>`pricr_users_${c}`, quotes:(c:string)=>`pricr_quotes_${c}` };
export async function getCurrentUser(): Promise<User|null> { try { const r=await AsyncStorage.getItem(KEYS.currentUser); return r?JSON.parse(r):null; } catch { return null; } }
export async function saveCurrentUser(u: User): Promise<void> { await AsyncStorage.setItem(KEYS.currentUser,JSON.stringify(u)); }
export async function clearCurrentUser(): Promise<void> { await AsyncStorage.removeItem(KEYS.currentUser); }
export async function getBusiness(code: string): Promise<Business|null> { try { const r=await AsyncStorage.getItem(KEYS.business(code)); return r?JSON.parse(r):null; } catch { return null; } }
export async function saveBusiness(b: Business): Promise<void> { await AsyncStorage.setItem(KEYS.business(b.code),JSON.stringify(b)); }
export async function deleteBusiness(code: string): Promise<void> { await Promise.all([AsyncStorage.removeItem(KEYS.business(code)),AsyncStorage.removeItem(KEYS.users(code)),AsyncStorage.removeItem(KEYS.quotes(code))]); }
export async function getUsers(code: string): Promise<User[]> { try { const r=await AsyncStorage.getItem(KEYS.users(code)); return r?JSON.parse(r):[]; } catch { return []; } }
export async function saveUsers(code: string, users: User[]): Promise<void> { await AsyncStorage.setItem(KEYS.users(code),JSON.stringify(users)); }
export async function getQuotes(code: string): Promise<SavedQuote[]> { try { const r=await AsyncStorage.getItem(KEYS.quotes(code)); return r?JSON.parse(r):[]; } catch { return []; } }
export async function addQuote(code: string, q: SavedQuote): Promise<void> { const e=await getQuotes(code); e.push(q); await AsyncStorage.setItem(KEYS.quotes(code),JSON.stringify(e)); }
export async function deleteQuote(code: string, id: string): Promise<void> { const e=await getQuotes(code); await AsyncStorage.setItem(KEYS.quotes(code),JSON.stringify(e.filter(q=>q.id!==id))); }
export async function updateQuote(code: string, id: string, patch: Partial<SavedQuote>): Promise<void> { const e=await getQuotes(code); await AsyncStorage.setItem(KEYS.quotes(code),JSON.stringify(e.map(q=>q.id===id?{...q,...patch}:q))); }

// Scan every stored business/quote/user for the master analytics dashboard.
// NOTE: this reads all of local AsyncStorage — fine at demo scale; moves to Supabase later.
export async function scanAllData(): Promise<{ businesses: Business[]; quotes: SavedQuote[]; quotesByCode: Record<string, SavedQuote[]>; usersByCode: Record<string, User[]> }> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const bizKeys = keys.filter(k => k.startsWith("pricr_business_"));
    const quoteKeys = keys.filter(k => k.startsWith("pricr_quotes_"));
    const userKeys = keys.filter(k => k.startsWith("pricr_users_"));
    const parse = <T>(raw: string | null, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
    const bizEntries = await AsyncStorage.multiGet(bizKeys);
    const quoteEntries = await AsyncStorage.multiGet(quoteKeys);
    const userEntries = await AsyncStorage.multiGet(userKeys);
    const businesses = bizEntries.map(([, v]) => parse<Business | null>(v, null)).filter((b): b is Business => !!b);
    const quotesByCode: Record<string, SavedQuote[]> = {};
    quoteEntries.forEach(([k, v]) => { quotesByCode[k.replace("pricr_quotes_", "")] = parse<SavedQuote[]>(v, []); });
    const quotes = Object.values(quotesByCode).flat();
    const usersByCode: Record<string, User[]> = {};
    userEntries.forEach(([k, v]) => { usersByCode[k.replace("pricr_users_", "")] = parse<User[]>(v, []); });
    return { businesses, quotes, quotesByCode, usersByCode };
  } catch { return { businesses: [], quotes: [], quotesByCode: {}, usersByCode: {} }; }
}

// One-time cleanup: wipe any legacy persisted superadmin session so it can't auto-resume. Runs once, gated by a flag.
const MIGRATION_CLEAR_SUPERADMIN = "pricr_migration_clear_superadmin_v1";
export async function runStartupMigrations(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(MIGRATION_CLEAR_SUPERADMIN)) return;
    const u = await getCurrentUser();
    if (u?.role === "superadmin") await clearCurrentUser();
    await AsyncStorage.setItem(MIGRATION_CLEAR_SUPERADMIN, "1");
  } catch { }
}
