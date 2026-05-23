import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useReduceMotion } from "../hooks/useReduceMotion";

// Three dots that pulse in sequence — Kit's "typing…" indicator.
export function TypingDots({ color }: { color: string }) {
  const reduceMotion = useReduceMotion();
  const d0 = useRef(new Animated.Value(0.3)).current;
  const d1 = useRef(new Animated.Value(0.3)).current;
  const d2 = useRef(new Animated.Value(0.3)).current;
  const dots = [d0, d1, d2];

  useEffect(() => {
    if (reduceMotion) return;
    const make = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 350, useNativeDriver: true }),
        Animated.delay(360 - delay),
      ]));
    const anims = dots.map((v, i) => make(v, i * 180));
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [reduceMotion]);

  return (
    <View style={{ flexDirection: "row", gap: 5, alignItems: "center", paddingVertical: 4, paddingHorizontal: 4 }}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: reduceMotion ? 0.6 : v }} />
      ))}
    </View>
  );
}
