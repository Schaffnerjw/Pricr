// Offline-signed quotes captured with zero connectivity. AsyncStorage is the source of truth — a
// signature is NEVER lost. Pure list helpers are split out so they're unit-testable; the async
// functions wrap them with storage I/O.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "./logger";
import { LineItem } from "../types/lineItems";

const KEY = "pricr_offline_signatures";

export interface OfflineSignedQuote {
  quoteId: string;
  clientName: string;
  signatureDataUrl: string;   // base64 PNG
  signedAt: number;
  totalAmount: number;
  lineItems: LineItem[];
  businessCode: string;
  consentGiven: boolean;
  syncStatus: "pending" | "synced" | "failed";
  attempts?: number;
}

// ── Pure list helpers (testable) ──
export function upsertSignature(list: OfflineSignedQuote[], sig: OfflineSignedQuote): OfflineSignedQuote[] {
  const without = (list || []).filter(s => s.quoteId !== sig.quoteId);
  return [...without, sig];
}
export function setSyncStatus(list: OfflineSignedQuote[], quoteId: string, status: OfflineSignedQuote["syncStatus"]): OfflineSignedQuote[] {
  return (list || []).map(s => s.quoteId === quoteId ? { ...s, syncStatus: status, attempts: (s.attempts || 0) + (status === "failed" ? 1 : 0) } : s);
}
export const countPending = (list: OfflineSignedQuote[]): number => (list || []).filter(s => s.syncStatus === "pending" || s.syncStatus === "failed").length;
export const pendingSignatures = (list: OfflineSignedQuote[]): OfflineSignedQuote[] => (list || []).filter(s => s.syncStatus !== "synced");

// ── AsyncStorage I/O ──
export async function getOfflineSignatures(): Promise<OfflineSignedQuote[]> {
  try { const r = await AsyncStorage.getItem(KEY); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function writeAll(list: OfflineSignedQuote[]): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { logger.error("[offlineSig] write failed", e instanceof Error ? e.message : String(e)); }
}
// Store (or replace) an offline signature. Never throws.
export async function saveOfflineSignature(sig: OfflineSignedQuote): Promise<void> {
  const list = await getOfflineSignatures();
  await writeAll(upsertSignature(list, sig));
}
export async function markOfflineSignature(quoteId: string, status: OfflineSignedQuote["syncStatus"]): Promise<void> {
  const list = await getOfflineSignatures();
  if (status === "synced") { await writeAll((list).filter(s => s.quoteId !== quoteId)); return; }
  await writeAll(setSyncStatus(list, quoteId, status));
}
export async function getPendingCount(): Promise<number> {
  return countPending(await getOfflineSignatures());
}
