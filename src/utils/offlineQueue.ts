// Durable queue of Supabase writes that failed while offline, replayed on reconnect so a quote (or
// business edit) is NEVER lost. Stored in AsyncStorage; survives app restarts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "./logger";

const KEY = "pricr_offline_queue";
export interface QueueItem { type: "addQuote" | "saveBusiness"; payload: any; timestamp: number; }

export async function getQueue(): Promise<QueueItem[]> {
  try { const r = await AsyncStorage.getItem(KEY); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function setQueue(items: QueueItem[]): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { logger.error("[offline] queue write failed", e instanceof Error ? e.message : String(e)); }
}
export async function enqueue(type: QueueItem["type"], payload: any): Promise<void> {
  const q = await getQueue();
  q.push({ type, payload, timestamp: Date.now() });
  await setQueue(q);
}
// Replay queued writes via the provided handler; keep any that fail again (so nothing is dropped).
export async function flushQueue(replay: (item: QueueItem) => Promise<void>): Promise<void> {
  const q = await getQueue();
  if (!q.length) return;
  const remaining: QueueItem[] = [];
  for (const item of q) {
    try { await replay(item); } catch { remaining.push(item); }
  }
  await setQueue(remaining);
}
