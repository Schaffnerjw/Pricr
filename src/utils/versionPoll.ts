// Pure decisions for the /version.json poll. The browser's built-in service-worker update check
// runs at most ~every 24h on an open tab, so a contractor who lives in the PWA can miss a deploy
// for a day. This poll catches that case: every ~5 min the app fetches /version.json (a tiny
// static file written at build time by scripts/stamp-build.js), and if the SHA has changed since
// the SHA captured at boot, fires the same 'pricr-update-available' window event the SW pipeline
// already uses — so the existing UpdateBanner just appears. No new UI, no forced reload.

// Poll cadence. Long enough that the network cost is negligible (one HEAD-sized GET every 5 min),
// short enough that a deploy reaches an active user within a coffee break.
export const VERSION_POLL_INTERVAL_MS = 5 * 60 * 1000;

// Shape of /version.json (as written by scripts/stamp-build.js).
export interface VersionPayload { sha: string }

// Defensive parse — the wire is JSON written by our build, but a misconfigured CDN, an HTML
// 404-page slipping through, or a transient edge cache could send back anything. Null = "I can't
// trust this", which the caller treats as "do nothing this tick".
export function parseVersionResponse(value: unknown): VersionPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const sha = (value as Record<string, unknown>).sha;
  if (typeof sha !== "string" || sha.length === 0) return null;
  return { sha };
}

// Decide whether the current tick should fire the update event. Both null inputs mean "no
// information" (offline, parse fail, or first run without a captured boot SHA yet) — never fire
// on uncertainty, because a false-positive prompt while a contractor is mid-quote would be
// worse than waiting another 5 min to notify.
export function shouldFireUpdate(bootSha: string | null, fetchedSha: string | null): boolean {
  if (!bootSha) return false;
  if (!fetchedSha) return false;
  return fetchedSha !== bootSha;
}
