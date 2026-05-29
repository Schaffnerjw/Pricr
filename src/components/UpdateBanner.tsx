import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Text, TouchableOpacity, View, ViewStyle } from "react-native";

// React Native's ViewStyle type expects numeric padding, but react-native-web's RUNTIME accepts CSS
// strings — including env() and max() — and applies them as inline CSS. The cast through `unknown`
// keeps strict TS happy without an `any`. The env(safe-area-inset-top) expression resolves to the
// iOS status-bar height (44px on notched devices, 20px on older, 0 on Android Chrome / desktop);
// max() then ensures we still get a 12px breathing room on platforms that report 0. viewport-fit=cover
// is already set in app/+html.tsx — without it, env() always reports 0 on iOS Safari.
const WEB_SAFE_AREA_TOP: ViewStyle = { paddingTop: "max(env(safe-area-inset-top), 12px)" } as unknown as ViewStyle;

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
    // Slide-in offset bumped from -80 to -120 so the banner clears taller iOS status bars during
    // the entrance animation (otherwise the Refresh button is briefly visible UNDER the status
    // bar before settling).
    <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 9999, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) }] }}>
      <View style={[{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#2979FF", paddingBottom: 12, paddingHorizontal: 16, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, WEB_SAFE_AREA_TOP]}>
        <Text style={{ flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Pricr was just updated ✨</Text>
        {/* iOS HIG minimum tap target is 44pt. Previous paddingVertical:6 + 13pt font yielded ~28pt
            — below the threshold and a real complaint vector even when the banner WAS reachable.
            minHeight:44 + minWidth:88 + justifyContent guarantees both buttons clear the floor. */}
        <TouchableOpacity onPress={reload} hitSlop={8} style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 14, minHeight: 44, minWidth: 88, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Refresh →</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setVisible(false)} hitSlop={12} style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "700" }}>×</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
