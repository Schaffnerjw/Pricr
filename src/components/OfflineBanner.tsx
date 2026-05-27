import { Feather } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { flushOfflineQueue } from "../storage";

// Global offline indicator (mounted in app/_layout.tsx). Amber bar slides down while offline; on
// reconnect it slides away and the queued Supabase writes are flushed. Auto-dismiss (no close button).
export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const slide = useRef(new Animated.Value(-60)).current;
  const wasOffline = useRef(false);

  useEffect(() => {
    Animated.timing(slide, { toValue: isOnline ? -60 : 0, duration: isOnline ? 200 : 240, useNativeDriver: false }).start();
    if (isOnline && wasOffline.current) flushOfflineQueue().catch(() => { });
    wasOffline.current = !isOnline;
  }, [isOnline, slide]);

  if (isOnline) return null;
  return (
    <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 9998, transform: [{ translateY: slide }] }}>
      <View style={{ backgroundColor: "#F59E0B", paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name="wifi-off" size={16} color="#0A0E1A" />
        <Text style={{ flex: 1, color: "#0A0E1A", fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>You&apos;re offline — quotes are saved locally and will sync when reconnected</Text>
      </View>
    </Animated.View>
  );
}
