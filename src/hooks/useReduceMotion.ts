import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Tracks the iOS "Reduce Motion" accessibility setting so animations can be skipped.
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { mounted = false; sub.remove(); };
  }, []);
  return reduceMotion;
}
