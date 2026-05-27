import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Text, TouchableOpacity, View } from "react-native";

// Web-only "a new version is available" banner. Listens for the 'pricr-update-available' event the
// service-worker registration fires (see app/+html.tsx) when a new SW has installed while the app is
// open. Slides down from the top; Refresh reloads, × dismisses. Mounted globally in app/_layout.tsx
// so it overlays whatever screen is showing (the body doesn't scroll on web, so absolute-top is fixed).
export function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const handler = () => setVisible(true);
    window.addEventListener("pricr-update-available", handler);
    return () => window.removeEventListener("pricr-update-available", handler);
  }, []);

  useEffect(() => {
    if (visible) Animated.timing(slide, { toValue: 1, duration: 260, useNativeDriver: false }).start();
  }, [visible, slide]);

  if (Platform.OS !== "web" || !visible) return null;

  const reload = () => { try { window.location.reload(); } catch { /* ignore */ } };

  return (
    <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 9999, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#2979FF", paddingVertical: 12, paddingHorizontal: 16, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
        <Text style={{ flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Pricr was just updated ✨</Text>
        <TouchableOpacity onPress={reload} style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Refresh →</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setVisible(false)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "700" }}>×</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
