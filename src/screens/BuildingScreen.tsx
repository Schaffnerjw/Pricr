import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, SafeAreaView, Text, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { s } from "../styles";
import { useReduceMotion } from "../hooks/useReduceMotion";

// Tips that rotate while Kit builds the custom quote tool (FIX 10).
const TIPS = [
  "Kit can update your pricing anytime — just ask",
  "Customize your brand colors and logo in Settings",
  "Send signed quotes directly from the app",
  "Quotes are saved automatically to the cloud",
  "Your clients sign on their phone — no printing needed",
  "Add a discount to any quote for referrals or promos",
  "Kit learns your business the more you use it",
  "Share your quote as a PDF with one tap",
];

export function BuildingScreen({ primaryColor }: { primaryColor: string }) {
  const reduceMotion = useReduceMotion();
  const [tip, setTip] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = setInterval(() => {
      if (reduceMotion) { setTip(t => (t + 1) % TIPS.length); return; }
      // Fade out, swap the tip, fade back in.
      Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setTip(t => (t + 1) % TIPS.length);
        Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 3000);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.centered}>
        <PricrLogo />
        <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 40 }} />
        <Text style={[s.h2, { marginTop: 24 }]}>Give us just a second.</Text>
        <Text style={[s.body, { textAlign: "center", marginTop: 8 }]}>Kit is building your custom tool right now.</Text>
        <Animated.Text style={{ opacity: fade, color: primaryColor, fontSize: 14, textAlign: "center", marginTop: 28, lineHeight: 20, fontFamily: "DMSans_600SemiBold", minHeight: 40 }}>
          {TIPS[tip]}
        </Animated.Text>
      </View>
    </SafeAreaView>
  );
}
