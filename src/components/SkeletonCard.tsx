import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { B } from "../constants/brand";
import { useReduceMotion } from "../hooks/useReduceMotion";

// Pulsing placeholder card (border color, ~50% opacity) shown while the schema loads.
export function SkeletonCard({ height = 64 }: { height?: number }) {
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [reduceMotion]);

  return <Animated.View style={{ height, borderRadius: 14, backgroundColor: B.border, opacity: reduceMotion ? 0.5 : pulse }} />;
}
