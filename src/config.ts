// Proxy server base URL. Set EXPO_PUBLIC_PROXY_URL (e.g. to the Railway URL) at build time;
// falls back to the local proxy (proxy.js listens on port 3001) for development.
export const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL || "http://localhost:3001";
