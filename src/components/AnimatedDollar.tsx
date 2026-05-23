import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleProp, Text, TextStyle } from "react-native";
import { useReduceMotion } from "../hooks/useReduceMotion";

// Counts smoothly up/down to `value` over 400ms (or jumps instantly under Reduce Motion).
export function AnimatedDollar({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  const reduceMotion = useReduceMotion();
  const anim = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduceMotion) { anim.setValue(value); setDisplay(value); return; }
    const id = anim.addListener(({ value: v }) => setDisplay(v));
    Animated.timing(anim, { toValue: value, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [value, reduceMotion]);

  return <Text style={style}>${Math.round(display).toLocaleString()}</Text>;
}
