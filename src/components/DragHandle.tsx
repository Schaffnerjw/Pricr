import { Feather } from "@expo/vector-icons";
import { Platform, TouchableOpacity, View } from "react-native";

// Reorder control for an editor row. ≡ grip with ▲/▼ buttons (each a 44×44 touch target). On web it
// shows a grab cursor + "Drag to reorder" tooltip; the buttons work identically with mouse or finger.
export function DragHandle({ onUp, onDown, canUp, canDown, color, accent }: {
  onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean; color: string; accent: string;
}) {
  const webGrab = Platform.OS === "web" ? ({ cursor: "grab" } as any) : null;
  return (
    <View style={[{ width: 44, alignItems: "center", justifyContent: "center" }, webGrab]} {...(Platform.OS === "web" ? { title: "Use the arrows to reorder" } as any : {})}>
      <TouchableOpacity onPress={onUp} disabled={!canUp} hitSlop={6} accessibilityLabel="Move up" style={{ width: 44, height: 22, alignItems: "center", justifyContent: "center" }}>
        <Feather name="chevron-up" size={18} color={canUp ? accent : color + "55"} />
      </TouchableOpacity>
      <Feather name="menu" size={15} color={color} />
      <TouchableOpacity onPress={onDown} disabled={!canDown} hitSlop={6} accessibilityLabel="Move down" style={{ width: 44, height: 22, alignItems: "center", justifyContent: "center" }}>
        <Feather name="chevron-down" size={18} color={canDown ? accent : color + "55"} />
      </TouchableOpacity>
    </View>
  );
}
