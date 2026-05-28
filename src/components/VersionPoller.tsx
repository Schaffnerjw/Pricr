import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { parseVersionResponse, shouldFireUpdate, VERSION_POLL_INTERVAL_MS } from "../utils/versionPoll";

// Web-only invisible component. Mounted globally next to <UpdateBanner /> in app/_layout.tsx so
// it polls for the lifetime of the tab. Captures the build SHA at boot, polls /version.json
// every ~5 min, and dispatches the existing 'pricr-update-available' event when the SHA changes
// — reusing the banner the service worker's updatefound listener already drives. No new UI, no
// forced reload (the banner prompts the user to refresh on their own terms).
export function VersionPoller() {
  const bootSha = useRef<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json: unknown = await res.json().catch(() => null);
        const parsed = parseVersionResponse(json);
        if (!parsed || cancelled) return;
        if (bootSha.current === null) { bootSha.current = parsed.sha; return; } // first tick: just capture
        if (fired.current) return; // banner already showing — don't double-fire on every poll
        if (shouldFireUpdate(bootSha.current, parsed.sha)) {
          fired.current = true;
          window.dispatchEvent(new CustomEvent("pricr-update-available"));
        }
      } catch { /* silent — offline / DNS blip / CDN hiccup must not surface as a false prompt */ }
    };

    tick();
    const id = setInterval(tick, VERSION_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return null;
}
