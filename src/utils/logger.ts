// Gated logger. debug/info are silenced in production builds; warn/error always fire. In production,
// error() also reports to Sentry (initialized in app/_layout.tsx) — this is how the app's swallowed/
// surfaced failures (storage saves, deriveSections, PDF, Kit) reach error monitoring without coupling
// every call site to Sentry. Never pass PII (usernames, business codes, prices, customer data).
import * as Sentry from "@sentry/react-native";

declare const __DEV__: boolean | undefined;
const isDev =
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development");

export const logger = {
  debug: (...args: unknown[]) => { if (isDev) console.log(...args); },
  info: (...args: unknown[]) => { if (isDev) console.info(...args); },
  warn: (...args: unknown[]) => { console.warn(...args); },
  error: (...args: unknown[]) => {
    console.error(...args);
    if (!isDev) {
      try {
        const err = args.find(a => a instanceof Error) as Error | undefined;
        Sentry.captureException(err ?? new Error(args.map(a => (a instanceof Error ? a.message : String(a))).join(" ")));
      } catch { /* monitoring must never throw into the app */ }
    }
  },
};
