// fetch() with an abort timeout. Kit/Claude calls use this so the chat never hangs forever — on
// timeout it throws TimeoutError, which callers catch to show a "try again" message instead of a
// spinner that never resolves.
export class TimeoutError extends Error {
  constructor() { super("Request timed out"); this.name = "TimeoutError"; }
}

export const KIT_TIMEOUT_MS = 30000;

export async function fetchWithTimeout(url: string, options: RequestInit = {}, ms: number = KIT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "AbortError") throw new TimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const isTimeout = (e: unknown): boolean => e instanceof TimeoutError || (e as { name?: string })?.name === "AbortError";
