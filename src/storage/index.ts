import AsyncStorage from "@react-native-async-storage/async-storage";
import supabase, { isSupabaseConfigured } from "../lib/supabase";
import { Business, SavedQuote, User } from "../types";
import { logger } from "../utils/logger";
import { enqueue, flushQueue } from "../utils/offlineQueue";

export const KEYS = { currentUser:"pricr_current_user", business:(c:string)=>`pricr_business_${c}`, users:(c:string)=>`pricr_users_${c}`, quotes:(c:string)=>`pricr_quotes_${c}` };

// ── code → deterministic business UUID ────────────────────────────────────────
// cyrb128 128-bit hash of the (uppercased) business code, formatted as a UUID.
// The same code always maps to the same business_id, so a business resolves across
// devices and RLS can key on it directly without a lookup round-trip.
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}
const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
export function codeToUuid(code: string): string {
  const [a, b, c, d] = cyrb128("pricr:" + code.toUpperCase());
  const h = hex8(a) + hex8(b) + hex8(c) + hex8(d);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// DEMO data and the unconfigured case stay entirely local — demo mode must work with
// no backend, and the deterministic "DEMO" id would otherwise be shared/clobbered by
// every demo user. Everything else persists to Supabase when it's configured.
const isCloudEnabled = (code: string) => isSupabaseConfigured && !!supabase && code !== "DEMO";

// ── transparent anonymous auth ────────────────────────────────────────────────
// The contractor never sees a login screen. We create an anonymous Supabase session
// behind the scenes so auth.uid() exists for RLS, then upsert a membership row tying
// this session to the business (business_id derived from the code). The membership
// FK requires the business to already exist — during signup it doesn't yet, so the
// upsert fails harmlessly and saveBusiness() provisions business-first (see 0003).
let sessionPromise: Promise<string | null> | null = null;
async function getOrCreateUid(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user.id;
  if (!sessionPromise) {
    sessionPromise = supabase.auth.signInAnonymously().then(({ data, error }) => {
      sessionPromise = null;
      return error || !data.session ? null : data.session.user.id;
    });
  }
  return sessionPromise;
}

let activeCode: string | null = null;
async function ensureSession(code: string, role: "admin" | "rep" = "rep"): Promise<string | null> {
  if (!supabase) return null;
  const uid = await getOrCreateUid();
  if (!uid) return null;
  const norm = code.toUpperCase();
  if (activeCode === norm) return uid;
  // Best-effort: become a member of this business. Fails (FK) if the business doesn't
  // exist yet — that's the signup path, where getBusiness returns null → caller provisions.
  const { error } = await supabase.from("users").upsert(
    { id: uid, business_id: codeToUuid(norm), role }, { onConflict: "id" });
  if (!error) activeCode = norm;
  return uid;
}

// ── current user (per-device session; always local) ───────────────────────────
export async function getCurrentUser(): Promise<User|null> { try { const r=await AsyncStorage.getItem(KEYS.currentUser); return r?JSON.parse(r):null; } catch { return null; } }
export async function saveCurrentUser(u: User): Promise<void> { await AsyncStorage.setItem(KEYS.currentUser,JSON.stringify(u)); }
export async function clearCurrentUser(): Promise<void> { await AsyncStorage.removeItem(KEYS.currentUser); }

// ── "stay signed in on this device" (FIX 8) ────────────────────────────────────
// Default ON. When OFF, checkSession() drops the persisted session on the next launch so the app
// opens to the welcome screen instead of auto-resuming. AsyncStorage only — no Supabase auth change.
const STAY_SIGNED_IN_KEY = "pricr_stay_signed_in";
export async function setStaySignedIn(v: boolean): Promise<void> { try { await AsyncStorage.setItem(STAY_SIGNED_IN_KEY, v ? "1" : "0"); } catch { } }
export async function getStaySignedIn(): Promise<boolean> { try { return (await AsyncStorage.getItem(STAY_SIGNED_IN_KEY)) !== "0"; } catch { return true; } }

// ── In-progress price-list import (resumable setup) ─────────────────────────────
// Stores the verified categories + phase so a half-finished import can be resumed from the choice
// screen. Per-device/local only. Cleared on completion or when the user starts over.
const IMPORT_PROGRESS_KEY = "pricr_import_progress";
export async function saveImportProgress(data: any): Promise<void> { try { await AsyncStorage.setItem(IMPORT_PROGRESS_KEY, JSON.stringify(data)); } catch { } }
export async function getImportProgress<T = any>(): Promise<T | null> { try { const r = await AsyncStorage.getItem(IMPORT_PROGRESS_KEY); return r ? JSON.parse(r) as T : null; } catch { return null; } }
export async function clearImportProgress(): Promise<void> { try { await AsyncStorage.removeItem(IMPORT_PROGRESS_KEY); } catch { } }

// ── Kit chat history (per business; cross-device when cloud is configured) ──────
// Cloud mode: stored in businesses.config.kitChatHistory (piggybacks on saveBusiness — no new
// endpoint), so the contractor sees the same history on any device they log into. Local/demo:
// AsyncStorage. Capped at 50 messages and the last 30 days.
export interface KitChatMessage { role: "user" | "assistant"; content: string; timestamp: number; }
const KIT_CHAT_KEY = (code: string) => `pricr_kit_chat_${code}`;
const KIT_CHAT_MAX = 50;
const KIT_CHAT_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const trimHistory = (msgs: KitChatMessage[]): KitChatMessage[] => {
  const cutoff = Date.now() - KIT_CHAT_MAX_AGE;
  return (msgs || []).filter(m => !m.timestamp || m.timestamp >= cutoff).slice(-KIT_CHAT_MAX);
};
export async function getKitChatHistory(code: string): Promise<KitChatMessage[]> {
  if (isCloudEnabled(code)) {
    try { const biz = await getBusiness(code); return trimHistory((biz?.kitChatHistory as KitChatMessage[]) || []); } catch { return []; }
  }
  try { const r = await AsyncStorage.getItem(KIT_CHAT_KEY(code)); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? trimHistory(a) : []; } catch { return []; }
}
export async function saveKitChatHistory(code: string, messages: KitChatMessage[]): Promise<void> {
  const trimmed = trimHistory(messages);
  if (isCloudEnabled(code)) {
    // Read the freshest business, then write back with the updated history (minimizes the
    // last-write-wins window with concurrent schema saves).
    try { const biz = await getBusiness(code); if (biz) await saveBusiness({ ...biz, kitChatHistory: trimmed }); } catch { }
    return;
  }
  try { await AsyncStorage.setItem(KIT_CHAT_KEY(code), JSON.stringify(trimmed)); } catch { }
}
export async function clearKitChatHistory(code: string): Promise<void> { try { await AsyncStorage.removeItem(KIT_CHAT_KEY(code)); } catch { } }

// ── businesses ────────────────────────────────────────────────────────────────
export async function getBusiness(code: string): Promise<Business|null> {
  if (!isCloudEnabled(code)) { try { const r=await AsyncStorage.getItem(KEYS.business(code)); return r?JSON.parse(r):null; } catch { return null; } }
  try {
    await ensureSession(code);
    const { data, error } = await supabase!.from("businesses").select("config").eq("id", codeToUuid(code)).maybeSingle();
    if (error || !data?.config) return null;
    return data.config as Business;
  } catch { return null; }
}

export async function saveBusiness(b: Business): Promise<void> {
  if (!isCloudEnabled(b.code)) { await AsyncStorage.setItem(KEYS.business(b.code),JSON.stringify(b)); return; }
  const uid = await ensureSession(b.code, "admin");
  const id = codeToUuid(b.code);
  // Provision business-FIRST (the bootstrap INSERT policy allows it — see 0003), then the
  // membership row, by which point the FK is satisfied and members-only access opens up.
  //
  // We can't use upsert here: ON CONFLICT DO UPDATE makes Postgres evaluate the members-only
  // UPDATE policy, which a not-yet-member fails on the initial create. So: UPDATE if the row
  // exists and we're a member (config edits / kit updates), else plain INSERT (first create).
  // T&C is mirrored to its own column so the proxy / remote signing page can read it
  // directly, while the full Business (incl. termsAndConditions) also lives in config.
  const row = { id, code: b.code, name: b.name, config: b, terms_and_conditions: b.termsAndConditions ?? null };
  const { data: updated, error: updErr } = await supabase!.from("businesses")
    .update({ code: b.code, name: b.name, config: b, terms_and_conditions: b.termsAndConditions ?? null }).eq("id", id).select("id");
  if (updErr) throw updErr;
  if (!updated || updated.length === 0) {
    const { error } = await supabase!.from("businesses").insert(row);
    // 23505 = duplicate key (409): the row already exists but the members-only UPDATE matched 0 rows
    // because this anonymous session isn't a recognized member yet. That's fine — the row is there;
    // the membership upsert below makes us a member. Only genuine errors should throw.
    if (error && error.code !== "23505") throw error;
  }
  if (uid) {
    const { error: memErr } = await supabase!.from("users").upsert({ id: uid, business_id: id, role: "admin", name: b.ownerName }, { onConflict: "id" });
    if (memErr) throw memErr;
  }
  activeCode = b.code.toUpperCase();
}

export async function deleteBusiness(code: string): Promise<void> {
  if (!isCloudEnabled(code)) { await Promise.all([AsyncStorage.removeItem(KEYS.business(code)),AsyncStorage.removeItem(KEYS.users(code)),AsyncStorage.removeItem(KEYS.quotes(code))]); return; }
  await ensureSession(code);
  const id = codeToUuid(code);
  const { error: qErr } = await supabase!.from("quotes").delete().eq("business_id", id);
  if (qErr) throw qErr;
  const { error: bErr } = await supabase!.from("businesses").delete().eq("id", id);
  if (bErr) throw bErr;
}

// ── users roster (stored in businesses.config.members) ─────────────────────────
export async function getUsers(code: string): Promise<User[]> {
  if (!isCloudEnabled(code)) { try { const r=await AsyncStorage.getItem(KEYS.users(code)); return r?JSON.parse(r):[]; } catch { return []; } }
  const biz = await getBusiness(code);
  return ((biz as any)?.members as User[]) ?? [];
}

export async function saveUsers(code: string, users: User[]): Promise<void> {
  if (!isCloudEnabled(code)) { await AsyncStorage.setItem(KEYS.users(code),JSON.stringify(users)); return; }
  await ensureSession(code);
  const id = codeToUuid(code);
  // Merge into the existing config jsonb so we don't clobber the business fields.
  const { data, error: selErr } = await supabase!.from("businesses").select("config").eq("id", id).maybeSingle();
  if (selErr) throw selErr;
  const config = { ...((data?.config as any) ?? {}), members: users };
  const { error } = await supabase!.from("businesses").update({ config }).eq("id", id);
  if (error) throw error;
}

// ── quotes ─────────────────────────────────────────────────────────────────────
// The full app SavedQuote (incl. its open/won/lost status) lives in quote_data jsonb.
// The relational `status` column carries the separate draft/sent/accepted/declined
// pipeline used by QuotesHistoryScreen; we map the two at this boundary.
type ColStatus = "draft" | "sent" | "accepted" | "declined";
const appToColStatus = (s?: SavedQuote["status"]): ColStatus => s === "won" ? "accepted" : s === "lost" ? "declined" : "draft";

export async function getQuotes(code: string): Promise<SavedQuote[]> {
  if (!isCloudEnabled(code)) { try { const r=await AsyncStorage.getItem(KEYS.quotes(code)); return r?JSON.parse(r):[]; } catch { return []; } }
  try {
    await ensureSession(code);
    const { data, error } = await supabase!.from("quotes").select("quote_data,created_at").eq("business_id", codeToUuid(code)).order("created_at", { ascending: true });
    if (error || !data) return [];
    return data.map(r => r.quote_data as SavedQuote).filter(Boolean);
  } catch { return []; }
}

// Raw cloud insert — throws on failure (used by addQuote + the offline-queue flush). No queueing here.
async function cloudInsertQuote(code: string, q: SavedQuote): Promise<void> {
  const uid = await ensureSession(code);
  const { error } = await supabase!.from("quotes").insert({
    business_id: codeToUuid(code), created_by: uid,
    customer_name: q.customerName || null, total: q.total ?? null,
    status: appToColStatus(q.status), quote_data: q,
  });
  if (error) throw error;
}

export async function addQuote(code: string, q: SavedQuote): Promise<void> {
  if (!isCloudEnabled(code)) { const e=await getQuotes(code); e.push(q); await AsyncStorage.setItem(KEYS.quotes(code),JSON.stringify(e)); return; }
  // Offline-safe: never lose a quote. If the cloud write fails (no connection), queue it durably and
  // replay on reconnect (flushOfflineQueue). The quote id is already generated, so no duplication.
  try {
    await cloudInsertQuote(code, q);
  } catch (e) {
    logger.warn("[offline] addQuote queued for sync", e instanceof Error ? e.message : String(e));
    await enqueue("addQuote", { code, quote: q });
  }
}

// Replay queued offline writes. Called on reconnect. Items that fail again stay queued.
export async function flushOfflineQueue(): Promise<void> {
  await flushQueue(async (item) => {
    if (item.type === "addQuote" && item.payload?.code && item.payload?.quote) {
      if (!isCloudEnabled(item.payload.code)) return; // local/demo never queues
      await cloudInsertQuote(item.payload.code, item.payload.quote);
    }
  });
}

export async function deleteQuote(code: string, id: string): Promise<void> {
  if (!isCloudEnabled(code)) { const e=await getQuotes(code); await AsyncStorage.setItem(KEYS.quotes(code),JSON.stringify(e.filter(q=>q.id!==id))); return; }
  await ensureSession(code);
  const { error } = await supabase!.from("quotes").delete().eq("business_id", codeToUuid(code)).eq("quote_data->>id", id);
  if (error) throw error;
}

export async function updateQuote(code: string, id: string, patch: Partial<SavedQuote>): Promise<void> {
  if (!isCloudEnabled(code)) { const e=await getQuotes(code); await AsyncStorage.setItem(KEYS.quotes(code),JSON.stringify(e.map(q=>q.id===id?{...q,...patch}:q))); return; }
  await ensureSession(code);
  const bizId = codeToUuid(code);
  const { data, error: selErr } = await supabase!.from("quotes").select("id,quote_data").eq("business_id", bizId).eq("quote_data->>id", id).maybeSingle();
  if (selErr) throw selErr;
  if (!data) return; // row not found is a no-op for presentation/status enrichment
  const merged = { ...(data.quote_data as SavedQuote), ...patch };
  const { error } = await supabase!.from("quotes").update({
    quote_data: merged, customer_name: merged.customerName || null,
    total: merged.total ?? null, status: appToColStatus(merged.status),
    updated_at: new Date().toISOString(),
  }).eq("id", data.id);
  if (error) throw error;
}

// Mark a saved quote "sent" (the column-level pipeline) when the rep taps Share Quote.
// The app-side SavedQuote.status (open/won/lost) is untouched — "sent" lives only on the
// relational column for QuotesHistoryScreen. No-op locally/in demo (no "sent" concept there).
export async function markQuoteSent(code: string, id: string): Promise<void> {
  if (!isCloudEnabled(code)) return;
  await ensureSession(code);
  const { error } = await supabase!.from("quotes").update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("business_id", codeToUuid(code)).eq("quote_data->>id", id);
  if (error) throw error;
}

// The unique signing token for a saved quote, used to build the remote signing link.
// Null locally / in demo (no remote signing without a backend).
export async function getQuoteSigningToken(code: string, appId: string): Promise<string | null> {
  if (!isCloudEnabled(code)) return null;
  try {
    await ensureSession(code);
    const { data } = await supabase!.from("quotes").select("signing_token")
      .eq("business_id", codeToUuid(code)).eq("quote_data->>id", appId).maybeSingle();
    return (data?.signing_token as string) ?? null;
  } catch { return null; }
}

// Persist the rendered presentation snapshot (line items + totals + branding) onto a quote,
// so the remote signing page and the signed PDF can render it without the schema/formula engine.
export async function attachQuotePresentation(code: string, appId: string, presentation: import("../types").QuotePresentation): Promise<void> {
  await updateQuote(code, appId, { presentation });
}

// Record a customer signature against a quote. Cloud: writes the signature_data/signed_at
// columns + status→accepted (and mirrors into quote_data). Local/demo: stored in quote_data
// (status→won) so in-person signing still works with no backend.
export async function saveSignature(code: string, appId: string, signatureData: string, customerName?: string): Promise<void> {
  const signedAt = Date.now();
  if (!isCloudEnabled(code)) {
    await updateQuote(code, appId, { signatureData, signedAt, status: "won", outcome: "won", ...(customerName ? { customerName } : {}) });
    return;
  }
  await ensureSession(code);
  const bizId = codeToUuid(code);
  const { data, error: selErr } = await supabase!.from("quotes").select("id,quote_data")
    .eq("business_id", bizId).eq("quote_data->>id", appId).maybeSingle();
  if (selErr) throw selErr;
  if (!data) throw new Error("Quote not found — signature not saved."); // never report a signed quote that didn't persist
  const merged: SavedQuote = { ...(data.quote_data as SavedQuote), signatureData, signedAt, status: "won", outcome: "won", ...(customerName ? { customerName } : {}) };
  const { error } = await supabase!.from("quotes").update({
    signature_data: signatureData,
    signed_at: new Date(signedAt).toISOString(),
    status: "accepted",
    customer_name: customerName ?? merged.customerName ?? null,
    quote_data: merged,
    updated_at: new Date().toISOString(),
  }).eq("id", data.id);
  if (error) throw error;
}

// Resolve which business a username belongs to (admin OR rep), so username+PIN login can find
// the business before the user is a member. Cloud: a SECURITY DEFINER RPC (migration 0005) that
// bypasses RLS and matches config->>'username' or any member username. Local/demo: scan storage.
export async function resolveBusinessCodeByUsername(username: string): Promise<string | null> {
  const uname = username.trim().toLowerCase();
  if (!uname) return null;
  // Cloud mode: the RPC is the only way to map username → code before membership exists. Don't fall
  // through to the local scan on an RPC ERROR (a new device has no local data → false "not found").
  // Surface a connection error instead, after one retry. A clean null (no error) means "not found".
  if (isSupabaseConfigured && supabase) {
    const callRpc = async (): Promise<string | null> => {
      const { data, error } = await supabase!.rpc("resolve_business_code", { p_username: uname });
      if (error) { logger.error("[Login] RPC error:", error.message || String(error)); throw error; }
      return typeof data === "string" && data ? data : null;
    };
    try {
      return await callRpc();
    } catch {
      await new Promise(r => setTimeout(r, 1000)); // brief backoff, then one retry
      try { return await callRpc(); }
      catch { throw new Error("LOGIN_RPC_FAILED"); }
    }
  }
  // Local/demo only (no cloud configured): scan AsyncStorage.
  try {
    const { businesses } = await scanAllData();
    const b = businesses.find(biz =>
      (biz.username || "").trim().toLowerCase() === uname ||
      (biz.members || []).some(m => (m.username || "").trim().toLowerCase() === uname));
    return b?.code ?? null;
  } catch { return null; }
}

// Scan every stored business/quote/user for the master analytics dashboard.
// NOTE: this reads local AsyncStorage only. Under RLS an anonymous session can read
// just the businesses it belongs to, so a true cross-tenant aggregate would need the
// service-role key via an Edge Function — out of scope for the DB-only model.
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
