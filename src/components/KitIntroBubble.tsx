import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { Business } from "../types";
import { getContrastColor } from "../utils/colorUtils";
import { KitChatModal } from "./KitChatModal";

const SEEN_KEY = "kitIntroSeen";

// Admin-only Kit presence on the dashboard: a one-time slide-up intro card, plus a persistent
// floating bubble that opens a business-aware Kit chat. Reps never see this.
export function KitIntroBubble({ business, onSetupTerms }: {
  business: Business;
  onSetupTerms: () => void;
}) {
  const accent = business.brand.primaryColor || B.blue;
  const onAccent = getContrastColor(accent); // readable text/icon on the accent color
  const [showIntro, setShowIntro] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  const trade = business.schema?.trade || "contracting";
  const KIT_SYSTEM = `You are Kit, a business assistant for "${business.name}", a ${trade} company. You help the owner with terms and conditions, customer follow-ups, pricing questions, objection handling, and general business advice. Keep responses concise and actionable. You know the business uses Pricr for quoting.`;

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then(v => {
      if (!v) {
        setShowIntro(true);
        Animated.timing(slide, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }
    });
  }, []);

  const dismissIntro = async () => {
    Animated.timing(slide, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowIntro(false));
    try { await AsyncStorage.setItem(SEEN_KEY, "1"); } catch { }
  };

  return (
    <>
      {/* Persistent floating bubble */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setChatOpen(true)}
        style={{ position: "absolute", right: 20, bottom: 28, width: 56, height: 56, borderRadius: 28, backgroundColor: accent, alignItems: "center", justifyContent: "center", shadowColor: accent, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
      >
        <Text style={{ color: onAccent, fontSize: 22, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>K</Text>
      </TouchableOpacity>

      {/* One-time intro card */}
      {showIntro && (
        <Animated.View
          style={{
            position: "absolute", right: 16, left: 16, bottom: 92, maxWidth: 360, alignSelf: "flex-end",
            opacity: slide,
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          }}
        >
          <View style={{ backgroundColor: B.card, borderRadius: 16, borderWidth: 1, borderColor: accent + "55", padding: 16, flexDirection: "row", gap: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: onAccent, fontSize: 17, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>K</Text>
            </View>
            <View style={{ flex: 1, gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={{ flex: 1, color: B.gray1, fontSize: 13.5, lineHeight: 20, fontFamily: "DMSans_400Regular" }}>
                  Hey — I&apos;m Kit, your business assistant. I can help you build quotes, write follow-ups, handle objections, and set up your terms and conditions.
                </Text>
                <TouchableOpacity onPress={dismissIntro} hitSlop={8} style={{ marginLeft: 6 }}><Feather name="x" size={18} color={B.gray3} /></TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: accent, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
                  onPress={() => { dismissIntro(); onSetupTerms(); }}
                >
                  <Text style={{ color: onAccent, fontWeight: "700", fontSize: 13, fontFamily: "DMSans_700Bold" }}>Set up T&amp;C now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ paddingVertical: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }} onPress={dismissIntro}>
                  <Text style={{ color: B.gray2, fontWeight: "600", fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>Maybe later</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.View>
      )}

      <KitChatModal
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        primaryColor={accent}
        title="Kit"
        subtitle={`Your ${business.name} assistant`}
        systemPrompt={KIT_SYSTEM}
        opener={`Hey! I'm Kit — here to help with ${business.name}. Ask me to write a customer follow-up, update your terms, talk through pricing, or handle an objection.`}
        suggestions={["Update my terms & conditions", "Write a follow-up for a customer who went quiet", "Help me handle a price objection"]}
      />
    </>
  );
}
