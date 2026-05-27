// In-memory AsyncStorage for jest (the real native module can't load in node). Enough surface for
// the offline-signature + queue tests.
const store: Record<string, string> = {};
export default {
  getItem: (k: string) => Promise.resolve(k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = String(v); return Promise.resolve(); },
  removeItem: (k: string) => { delete store[k]; return Promise.resolve(); },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); },
  getAllKeys: () => Promise.resolve(Object.keys(store)),
};
