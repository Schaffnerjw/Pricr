// Gated logger. debug/info are silenced in production builds; warn/error always fire.
// Never pass PII (usernames, business codes, prices, customer data) to any level — see the
// security audit. Use neutral messages and non-identifying context only.
declare const __DEV__: boolean | undefined;
const isDev =
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development");

export const logger = {
  debug: (...args: unknown[]) => { if (isDev) console.log(...args); },
  info: (...args: unknown[]) => { if (isDev) console.info(...args); },
  warn: (...args: unknown[]) => { console.warn(...args); },
  error: (...args: unknown[]) => { console.error(...args); },
};
