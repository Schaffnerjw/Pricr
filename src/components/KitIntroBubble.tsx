import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { Business } from "../types";
import { ON_PRIMARY } from "../utils/colorUtils";
import { KitChatModal } from "./KitChatModal";

const SEEN_KEY = "kitIntroSeen";

// Admin-only Kit presence on the dashboard: a one-time slide-up intro card, plus a persistent
// floating bubble that opens a business-aware Kit chat. Reps never see this.
export function KitIntroBubble({ business, onSetupTerms }: {
  business: Business;
  onSetupTerms: () => void;
}) {
  const accent = business.brand.primaryColor || B.blue;
  const onAccent = ON_PRIMARY; // brand look: always white on the accent/primary color
  const [showIntro, setShowIntro] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  // Gentle breathing pulse to draw attention when Kit has been idle. Starts 30s after first load,
  // stops the moment the bubble is tapped, and restarts after 5 min of no interaction.
  const pulse = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPulse = () => {
    loopRef.current?.stop();
    pulse.setValue(0);
    loopRef.current = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loopRef.current.start();
  };
  const stopPulse = () => { loopRef.current?.stop(); loopRef.current = null; pulse.setValue(0); };
  const schedulePulse = (delayMs: number) => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(startPulse, delayMs);
  };

  useEffect(() => {
    schedulePulse(30000); // first load: pulse after 30s to draw attention
    return () => { if (pulseTimer.current) clearTimeout(pulseTimer.current); stopPulse(); };
  }, []);

  const openBubble = () => {
    stopPulse();                       // stop immediately on tap
    schedulePulse(5 * 60 * 1000);      // restart after 5 min of no interaction
    setChatOpen(true);
  };

  const trade = business.schema?.trade || "contracting";
  const KIT_SYSTEM = `You are Kit, a business assistant for "${business.name}", a ${trade} company. You help the owner with terms and conditions, client follow-ups, pricing questions, objection handling, and general business advice. Keep responses concise and actionable. You know the business uses Pricr for quoting.`;

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
      {/* Persistent floating "Kit" pill */}
      <Animated.View
        style={{
          position: "absolute", right: 16, bottom: 24, zIndex: 9999,
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] }),
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={openBubble}
          style={{ height: 44, borderRadius: 22, paddingHorizontal: 22, backgroundColor: accent, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}
        >
          <Text style={{ color: onAccent, fontSize: 15, fontWeight: "800", fontFamily: "Syne_700Bold" }}>Kit</Text>
        </TouchableOpacity>
      </Animated.View>

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
        opener={`Hey! I'm Kit — here to help with ${business.name}. Ask me to write a client follow-up, update your terms, talk through pricing, or handle an objection.`}
        suggestions={["Update my terms & conditions", "Write a follow-up for a client who went quiet", "Help me handle a price objection"]}
      />
    </>
  );
}
