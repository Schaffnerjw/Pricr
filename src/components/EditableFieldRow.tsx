import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { s } from "../styles";

// One editable field row: tap name/rate to edit inline (commits on blur); tap unit to cycle; 🗑 deletes.
// Reused by the Settings schema editor and the in-quote editor.
export function EditableFieldRow({ label, rate, unit, primaryColor, onRename, onRate, onCycleUnit, onDelete }: {
  label: string; rate: number; unit: string; primaryColor: string;
  onRename: (v: string) => void; onRate: (v: number) => void; onCycleUnit?: () => void; onDelete: () => void;
}) {
  const th = useTheme();
  const [editingName, setEditingName] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [nameDraft, setNameDraft] = useState(label);
  const [rateDraft, setRateDraft] = useState(String(rate));
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}>
      {editingName ? (
        <TextInput style={[s.input, { flex: 1, backgroundColor: th.surface, color: th.text, borderColor: th.border, paddingVertical: 8 }]} value={nameDraft} onChangeText={setNameDraft} autoFocus onBlur={() => { setEditingName(false); if (nameDraft.trim() && nameDraft !== label) onRename(nameDraft.trim()); }} />
      ) : (
        <TouchableOpacity style={{ flex: 1 }} onPress={() => { setNameDraft(label); setEditingName(true); }}>
          <Text style={{ color: th.text, fontSize: 15, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{label}</Text>
        </TouchableOpacity>
      )}
      {editingRate ? (
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: th.border, borderRadius: 8, paddingHorizontal: 6 }}>
          <Text style={{ color: th.textMuted, fontSize: 14 }}>$</Text>
          <TextInput style={{ width: 52, color: th.text, fontSize: 14, paddingVertical: 8, fontFamily: "DMSans_400Regular" }} value={rateDraft} onChangeText={t => setRateDraft(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" autoFocus onBlur={() => { setEditingRate(false); const n = Number(rateDraft); if (!Number.isNaN(n) && n !== rate) onRate(n); }} />
        </View>
      ) : (
        <TouchableOpacity onPress={() => { setRateDraft(String(rate)); setEditingRate(true); }}>
          <Text style={{ color: primaryColor, fontSize: 14, fontWeight: "800", fontFamily: "Syne_700Bold" }}>${rate.toLocaleString()}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onCycleUnit} disabled={!onCycleUnit} hitSlop={4}>
        <Text style={{ color: th.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>/{unit}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><Feather name="trash-2" size={15} color={th.error} /></TouchableOpacity>
    </View>
  );
}
