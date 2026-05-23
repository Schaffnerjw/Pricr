import { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, Text, View } from "react-native";
import { B } from "../constants/brand";
import { useReduceMotion } from "../hooks/useReduceMotion";

const { width, height } = Dimensions.get("window");
const COLORS = [B.blue, B.cyan, B.green, "#F59E0B", "#EC4899", B.white];
const COUNT = 28;

// Full-screen confetti burst with a headline. Pure RN Animated, no third-party libs.
export function ConfettiOverlay({ message = "First quote saved!" }: { message?: string }) {
  const reduceMotion = useReduceMotion();
  const pieces = useRef(
    Array.from({ length: COUNT }, (_, i) => ({
      x: Math.random() * width,
      delay: Math.random() * 250,
      size: 6 + Math.random() * 8,
      color: COLORS[i % COLORS.length],
      spin: Math.random() * 360,
      fall: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    if (reduceMotion) return;
    const anims = pieces.map(p =>
      Animated.timing(p.fall, { toValue: 1, duration: 1600, delay: p.delay, easing: Easing.in(Easing.quad), useNativeDriver: true })
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [reduceMotion]);

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,14,26,0.88)" }}>
      {!reduceMotion && pieces.map((p, i) => (
        <Animated.View key={i} style={{
          position: "absolute", left: p.x, top: 0, width: p.size, height: p.size, borderRadius: 2, backgroundColor: p.color,
          opacity: p.fall.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateY: p.fall.interpolate({ inputRange: [0, 1], outputRange: [-40, height * 0.7] }) },
            { rotate: p.fall.interpolate({ inputRange: [0, 1], outputRange: [`${p.spin}deg`, `${p.spin + 360}deg`] }) },
          ],
        }} />
      ))}
      <Text style={{ fontSize: 32, fontWeight: "800", color: B.white, fontFamily: "Syne_800ExtraBold", textAlign: "center", paddingHorizontal: 40 }}>{message}</Text>
    </View>
  );
}
