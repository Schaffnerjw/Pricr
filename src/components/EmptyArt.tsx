import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { s } from "../styles";

// Abstract brand-colored shape with a subtle pulse, used for empty states.
export function EmptyArt({ color }: { color: string }) {
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.12, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [reduceMotion]);
  return <Animated.View style={[s.emptyArt, { backgroundColor: color + "22", borderWidth: 2, borderColor: color, transform: [{ scale: pulse }] }]} />;
}
