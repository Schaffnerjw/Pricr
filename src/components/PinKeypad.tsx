import { Feather } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";

// Phone-style numeric keypad for PIN entry (4–6 digits). Works on web + native (tap/click only,
// no system keyboard). The parent owns the value + the submit button (enabled when len >= 4).
export function PinKeypad({ value, onChange, accent = B.blue, maxLength = 6 }: {
  value: string;
  onChange: (v: string) => void;
  accent?: string;
  maxLength?: number;
}) {
  const press = (d: string) => { if (value.length < maxLength) onChange(value + d); };
  const back = () => onChange(value.slice(0, -1));
  const rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["", "0", "del"]];
  const slots = Math.max(4, value.length);

  return (
    <View style={{ gap: 22, alignItems: "center" }}>
      <View style={{ flexDirection: "row", gap: 14, height: 16, alignItems: "center" }}>
        {Array.from({ length: slots }).map((_, i) => (
          <View key={i} style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: accent, backgroundColor: i < value.length ? accent : "transparent" }} />
        ))}
      </View>
      <View style={{ gap: 14 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", gap: 18 }}>
            {row.map((k, ki) => k === "" ? (
              <View key={ki} style={{ width: 70, height: 70 }} />
            ) : (
              <TouchableOpacity
                key={ki}
                onPress={() => (k === "del" ? back() : press(k))}
                activeOpacity={0.6}
                style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: B.card, borderWidth: 1, borderColor: B.border, alignItems: "center", justifyContent: "center" }}
              >
                {k === "del"
                  ? <Feather name="delete" size={22} color={B.gray1} />
                  : <Text style={{ color: B.white, fontSize: 26, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{k}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
