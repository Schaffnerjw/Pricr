import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

// Online/offline status. Web uses navigator.onLine + window events; native uses NetInfo.
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined") setIsOnline(navigator.onLine);
      if (typeof window === "undefined") return;
      const on = () => setIsOnline(true);
      const off = () => setIsOnline(false);
      window.addEventListener("online", on);
      window.addEventListener("offline", off);
      return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    }
    const unsub = NetInfo.addEventListener(state => setIsOnline(state.isConnected !== false));
    return () => unsub();
  }, []);
  return { isOnline };
}

// One-shot online check (used to fail Kit calls fast instead of letting them hang).
export async function checkOnline(): Promise<boolean> {
  if (Platform.OS === "web") return typeof navigator === "undefined" ? true : navigator.onLine;
  try { const s = await NetInfo.fetch(); return s.isConnected !== false; } catch { return true; }
}
