import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";

const DISMISS_KEY = "pricrInstallDismissed";

// Web-only "Add to Home Screen" nudge. Renders nothing on native iOS/Android. Appears 30s in,
// once per browser (dismissal persisted to localStorage), and never when already installed.
// Android/Chrome fires the native install dialog via beforeinstallprompt; iOS Safari can't, so
// it shows the manual Share → Add to Home Screen instructions.
export function InstallPrompt({ primaryColor = B.blue }: { primaryColor?: string }) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"ios" | "android" | null>(null);
  const deferred = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
      const standalone =
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        (navigator as any).standalone === true;
      if (standalone) return; // already installed

      const ua = navigator.userAgent || "";
      const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
      const isIOSSafari = isIOS && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

      const onBIP = (e: any) => { e.preventDefault(); deferred.current = e; setMode("android"); };
      window.addEventListener("beforeinstallprompt", onBIP);

      const timer = setTimeout(() => {
        if (isIOSSafari) { setMode("ios"); setVisible(true); }
        else if (deferred.current) { setVisible(true); } // installable Android/Chrome
      }, 30000);

      return () => { window.removeEventListener("beforeinstallprompt", onBIP); clearTimeout(timer); };
    } catch { /* no-op */ }
  }, []);

  if (Platform.OS !== "web" || !visible || !mode) return null;

  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } setVisible(false); };
  const install = async () => {
    const d = deferred.current;
    if (d) { try { d.prompt(); await d.userChoice; } catch { /* dismissed */ } }
    dismiss();
  };

  return (
    <View style={{ position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 9999, maxWidth: 460, alignSelf: "center", backgroundColor: B.card, borderRadius: 14, borderWidth: 1, borderColor: primaryColor + "66", padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: primaryColor, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: B.white, fontWeight: "800", fontFamily: "Syne_800ExtraBold", fontSize: 18 }}>P</Text>
      </View>
      <View style={{ flex: 1 }}>
        {mode === "ios" ? (
          <Text style={{ color: B.gray1, fontSize: 13, lineHeight: 19, fontFamily: "DMSans_400Regular" }}>
            Install Pricr: tap <Feather name="share" size={13} color={B.gray1} /> Share, then “Add to Home Screen.”
          </Text>
        ) : (
          <Text style={{ color: B.gray1, fontSize: 13, lineHeight: 19, fontFamily: "DMSans_400Regular" }}>
            Install Pricr for a faster, full-screen experience.
          </Text>
        )}
      </View>
      {mode === "android" && (
        <TouchableOpacity onPress={install} style={{ backgroundColor: primaryColor, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ color: B.white, fontWeight: "700", fontSize: 13, fontFamily: "DMSans_700Bold" }}>Install</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={dismiss} hitSlop={10}><Feather name="x" size={18} color={B.gray3} /></TouchableOpacity>
    </View>
  );
}
