import * as Haptics from "expo-haptics";
import { ReactNode, useRef } from "react";
import { Animated, Pressable, StyleProp, ViewStyle } from "react-native";
import { useReduceMotion } from "../hooks/useReduceMotion";

// Tappable wrapper that gives a physical 1.0→0.95→1.0 scale bounce + light haptic on press.
export function PressableScale({ children, onPress, style, haptic = true }: {
  children: ReactNode; onPress: () => void; style?: StyleProp<ViewStyle>; haptic?: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const handle = () => {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!reduceMotion) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.95, duration: 75, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 75, useNativeDriver: true }),
      ]).start();
    }
    onPress();
  };

  return (
    <Pressable onPress={handle}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
