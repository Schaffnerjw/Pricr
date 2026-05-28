import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { s } from "../styles";
import { QuoteSchema } from "../types";
import { ON_PRIMARY } from "../utils/colorUtils";
import { addCalculatedField, addMeasurementField, addSelectField, addToggleField } from "../utils/schemaEditorOps";
import { CommonField, commonFieldsForTrade, AddType } from "../data/commonFields";

const UNITS = ["sq ft", "lf", "hour", "each", "flat"];
const FIELD_TEMPLATES: { label: string; type: AddType; rate: number; unit: string }[] = [
  { label: "Permit", type: "yesno", rate: 200, unit: "flat" },
  { label: "Demo", type: "yesno", rate: 500, unit: "flat" },
  { label: "Delivery", type: "yesno", rate: 150, unit: "flat" },
  { label: "Labor", type: "measure", rate: 75, unit: "hour" },
  { label: "Stairs", type: "yesno", rate: 800, unit: "flat" },
];

// Reusable "add a field" bottom sheet — used by the Settings schema editor AND the in-quote editor.
// Self-contained: it owns the type-card + quick-setup flow, computes the new schema via the tested
// pure ops, and hands it back via onApply (the caller persists / auto-saves).
export function AddFieldSheet({ visible, onClose, primaryColor, schema, onApply, trade }: {
  visible: boolean;
  onClose: () => void;
  primaryColor: string;
  schema: QuoteSchema;
  onApply: (next: QuoteSchema) => void;
  trade?: string;          // resolves trade-specific Common Fields; falls back to schema.trade
}) {
  const tradeKey = trade ?? schema.trade;
  const commonFields = commonFieldsForTrade(tradeKey);
  const th = useTheme();
  const [addType, setAddType] = useState<AddType | null>(null);
  const [fName, setFName] = useState("");
  const [fRate, setFRate] = useState("");
  const [fUnit, setFUnit] = useState("sq ft");
  const [fLinked, setFLinked] = useState("");
  const [fOptions, setFOptions] = useState("");

  const reset = () => { setAddType(null); setFName(""); setFRate(""); setFUnit("sq ft"); setFLinked(""); setFOptions(""); };
  const close = () => { reset(); onClose(); };
  const applyTemplate = (t: typeof FIELD_TEMPLATES[number]) => { setAddType(t.type); setFName(t.label); setFRate(String(t.rate)); setFUnit(t.unit); };
  // Drop a trade-specific Common Field straight into the schema (blank price + placeholder hint).
  // Goes through the same schemaEditorOps the Quick Setup flow uses → fully first-class.
  const dropCommon = (c: CommonField) => {
    let next = schema;
    if (c.type === "measure") next = addMeasurementField(schema, c.label, c.rate, c.unit);
    else if (c.type === "yesno") next = addToggleField(schema, c.label, c.rate);
    else if (c.type === "calculated") next = addCalculatedField(schema, c.label, "", c.rate);
    else if (c.type === "pickone") next = addSelectField(schema, c.label, c.options || [{ label: "Option 1", rate: c.rate, unit: c.unit }]);
    // Attach the placeholder hint ("e.g. $75") to the just-added field so the rep sees it in the quote.
    if (c.placeholder) next = { ...next, fields: (next.fields || []).map(f => f.label === c.label ? { ...f, placeholder: c.placeholder } : f) };
    onApply(next); close();
  };
  const commit = () => {
    const name = fName.trim(); if (!name) return;
    const rate = Number(fRate) || 0;
    let next = schema;
    if (addType === "measure") next = addMeasurementField(schema, name, rate, fUnit);
    else if (addType === "yesno") next = addToggleField(schema, name, rate);
    else if (addType === "calculated") next = addCalculatedField(schema, name, fLinked.trim(), rate);
    else if (addType === "pickone") {
      const opts = fOptions.split(",").map(o => o.trim()).filter(Boolean).map(o => { const m = o.match(/^(.*?)[\s:$]*([\d.]+)?$/); return { label: (m?.[1] || o).trim(), rate: Number(m?.[2]) || 0, unit: fUnit }; });
      next = addSelectField(schema, name, opts.length ? opts : [{ label: "Option 1", rate, unit: fUnit }]);
    }
    onApply(next); close();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={close}>
        <Pressable style={{ backgroundColor: th.surfaceHigh, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" }} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: th.text, fontSize: 18, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{addType ? "Quick setup" : "What kind of field?"}</Text>
              <TouchableOpacity onPress={close} hitSlop={8}><Feather name="x" size={24} color={th.textMuted} /></TouchableOpacity>
            </View>
            {!addType ? (
              <>
                {/* Canonical icon set (Feather) — no emoji in UI chrome. */}
                {([
                  { t: "measure", icon: "maximize-2", title: "I measure something", hint: "sq feet, linear feet" },
                  { t: "yesno", icon: "check-square", title: "Include it or not", hint: "permit, delivery" },
                  { t: "pickone", icon: "list", title: "Pick from a list", hint: "material type" },
                  { t: "calculated", icon: "link", title: "Calculates from another", hint: "protection × sq footage" },
                ] as const).map(c => (
                  <TouchableOpacity key={c.t} onPress={() => setAddType(c.t)} style={{ minHeight: 64, backgroundColor: th.surface, borderColor: th.border, borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <Feather name={c.icon} size={22} color={primaryColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: th.text, fontSize: 15, fontWeight: "800", fontFamily: "DMSans_700Bold" }}>{c.title}</Text>
                      <Text style={{ color: th.textMuted, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{c.hint}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {commonFields.length > 0 && (
                  <>
                    <Text style={{ color: th.textMuted, fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold", marginTop: 4 }}>COMMON FOR YOUR TRADE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {commonFields.map(c => (
                        <TouchableOpacity key={c.label} onPress={() => dropCommon(c)} style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: primaryColor, backgroundColor: primaryColor + "15", borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 }}>
                          <Feather name="plus" size={13} color={primaryColor} />
                          <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{c.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}
                <Text style={{ color: th.textMuted, fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold", marginTop: 4 }}>OR A COMMON FIELD</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {FIELD_TEMPLATES.map(t => (
                    <TouchableOpacity key={t.label} onPress={() => applyTemplate(t)} style={{ borderWidth: 1, borderColor: primaryColor, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 }}>
                      <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={{ gap: 6 }}>
                  <Text style={[s.formLabel, { color: th.textMuted }]}>What&apos;s it called?</Text>
                  <TextInput style={[s.input, { backgroundColor: th.surface, color: th.text, borderColor: th.border }]} value={fName} onChangeText={setFName} placeholder="e.g. Stairs" placeholderTextColor={th.textMuted} autoFocus />
                </View>
                {addType === "pickone" ? (
                  <View style={{ gap: 6 }}>
                    <Text style={[s.formLabel, { color: th.textMuted }]}>Options (comma-separated, e.g. &quot;Cedar 28, Composite 35&quot;)</Text>
                    <TextInput style={[s.input, { backgroundColor: th.surface, color: th.text, borderColor: th.border }]} value={fOptions} onChangeText={setFOptions} placeholder="Pressure Treated 20, Composite 35" placeholderTextColor={th.textMuted} />
                  </View>
                ) : addType === "calculated" ? (
                  <>
                    <View style={{ gap: 6 }}>
                      <Text style={[s.formLabel, { color: th.textMuted }]}>Based on (source field name)</Text>
                      <TextInput style={[s.input, { backgroundColor: th.surface, color: th.text, borderColor: th.border }]} value={fLinked} onChangeText={setFLinked} placeholder="e.g. Deck Square Footage" placeholderTextColor={th.textMuted} />
                    </View>
                    <View style={{ gap: 6 }}>
                      <Text style={[s.formLabel, { color: th.textMuted }]}>Price per unit of that field</Text>
                      <TextInput style={[s.input, { backgroundColor: th.surface, color: th.text, borderColor: th.border }]} value={fRate} onChangeText={t => setFRate(t.replace(/[^0-9.]/g, ""))} placeholder="0.50" placeholderTextColor={th.textMuted} keyboardType="numeric" />
                    </View>
                    {!!fRate && !!fLinked && <Text style={{ color: primaryColor, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>Preview: 300 {fUnit} × ${fRate} = ${(300 * (Number(fRate) || 0)).toLocaleString()}</Text>}
                  </>
                ) : (
                  <View style={{ gap: 6 }}>
                    <Text style={[s.formLabel, { color: th.textMuted }]}>{addType === "yesno" ? "Price when included" : "Rate"}</Text>
                    <TextInput style={[s.input, { backgroundColor: th.surface, color: th.text, borderColor: th.border }]} value={fRate} onChangeText={t => setFRate(t.replace(/[^0-9.]/g, ""))} placeholder="0" placeholderTextColor={th.textMuted} keyboardType="numeric" />
                  </View>
                )}
                {(addType === "measure" || addType === "pickone") && (
                  <View style={{ gap: 6 }}>
                    <Text style={[s.formLabel, { color: th.textMuted }]}>Unit</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {UNITS.map(u => (
                        <TouchableOpacity key={u} onPress={() => setFUnit(u)} style={{ borderWidth: 1, borderColor: fUnit === u ? primaryColor : th.border, backgroundColor: fUnit === u ? primaryColor : "transparent", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 }}>
                          <Text style={{ color: fUnit === u ? ON_PRIMARY : th.textMuted, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity style={[s.btnSecondary, { flex: 1, borderColor: th.border }]} onPress={() => setAddType(null)}><Text style={[s.btnSecondaryText, { color: th.textMuted }]}>Back</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.btn, { flex: 2, backgroundColor: primaryColor, opacity: fName.trim() ? 1 : 0.4 }]} disabled={!fName.trim()} onPress={commit}>
                    <Text style={[s.btnText, { color: ON_PRIMARY }]}>Add Field →</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
