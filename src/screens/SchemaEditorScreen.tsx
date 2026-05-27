import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { DragHandle } from "../components/DragHandle";
import { useTheme } from "../contexts/ThemeContext";
import { useIsAdmin } from "../hooks/useIsAdmin";
import { s } from "../styles";
import { QuoteSchema, SchemaVersion } from "../types";
import { deriveSections } from "../utils/buildSchemaFromVerified";
import { executeKitCommand } from "../utils/executeKitCommand";
import { ON_PRIMARY } from "../utils/colorUtils";
import { addCalculatedField, addMeasurementField, addSelectField, addToggleField, reorderFields, setSectionDefault } from "../utils/schemaEditorOps";

type AddType = "measure" | "yesno" | "pickone" | "calculated";
const UNITS = ["sq ft", "lf", "hour", "each", "flat"];

const FIELD_TEMPLATES: { label: string; type: AddType; rate: number; unit: string }[] = [
  { label: "Permit", type: "yesno", rate: 200, unit: "flat" },
  { label: "Demo", type: "yesno", rate: 500, unit: "flat" },
  { label: "Delivery", type: "yesno", rate: 150, unit: "flat" },
  { label: "Labor", type: "measure", rate: 75, unit: "hour" },
  { label: "Stairs", type: "yesno", rate: 800, unit: "flat" },
];

// Manual quote-tool editor — admin only, lives in Settings (never onboarding). Auto-saves every change
// (no Save button) via onChange. All mutations go through the tested pure ops.
export function SchemaEditorScreen({ schema, primaryColor, versions, onChange, onBack, onAskKit }: {
  schema: QuoteSchema;
  primaryColor: string;
  versions?: SchemaVersion[];
  onChange: (schema: QuoteSchema) => void;   // persists immediately (auto-save)
  onBack: () => void;
  onAskKit?: () => void;
}) {
  const th = useTheme();
  const isAdmin = useIsAdmin();
  const [draft, setDraft] = useState<QuoteSchema>(schema);
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<AddType | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [undo, setUndo] = useState<{ label: string; before: QuoteSchema } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fName, setFName] = useState("");
  const [fRate, setFRate] = useState("");
  const [fUnit, setFUnit] = useState("sq ft");
  const [fLinked, setFLinked] = useState("");
  const [fOptions, setFOptions] = useState("");

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  // Non-admins can't edit the tool — show the message briefly, then bounce back automatically.
  useEffect(() => {
    if (isAdmin) return;
    const t = setTimeout(onBack, 2000);
    return () => clearTimeout(t);
  }, [isAdmin, onBack]);

  // Single mutation point: update local draft, persist immediately, flash "Saved ✓".
  const apply = (next: QuoteSchema) => {
    setDraft(next);
    onChange(next);
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1500);
  };

  const sections = useMemo(() => deriveSections(draft.fields || [], draft.pricing || {}, undefined, draft.defaultSectionIds), [draft]);

  const primaryFieldIndex = (sec: any): number => {
    const id = sec.materialFieldId || sec.quantityFieldId || sec.options?.[0]?.id;
    return (draft.fields || []).findIndex(f => f.id === id);
  };
  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = sections[idx + dir];
    if (!target) return;
    const from = primaryFieldIndex(sections[idx]); const to = primaryFieldIndex(target);
    if (from < 0 || to < 0) return;
    apply(reorderFields(draft, from, to));
  };
  // Reorder a field WITHIN its section: selector options are reordered on the field; flat toggles are
  // reordered among the underlying fields.
  const moveOption = (sec: any, optIndex: number, dir: -1 | 1) => {
    const target = optIndex + dir;
    if (target < 0 || target >= (sec.options?.length || 0)) return;
    if (sec.materialFieldId) {
      apply({ ...draft, fields: (draft.fields || []).map(f => {
        if (f.id !== sec.materialFieldId || !f.options) return f;
        const opts = f.options.slice(); const tmp = opts[optIndex]; opts[optIndex] = opts[target]; opts[target] = tmp;
        return { ...f, options: opts };
      }) });
    } else {
      const fromId = sec.options[optIndex]?.id, toId = sec.options[target]?.id;
      const fromIdx = (draft.fields || []).findIndex(f => f.id === fromId);
      const toIdx = (draft.fields || []).findIndex(f => f.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      apply(reorderFields(draft, fromIdx, toIdx));
    }
  };

  const renameOption = (id: string, label: string) => { const { schema: n, result } = executeKitCommand(draft, { type: "RENAME_FIELD", fieldIdentifier: id, newLabel: label }); if (result.success) apply(n); };
  const setRate = (id: string, rate: number) => { const { schema: n, result } = executeKitCommand(draft, { type: "UPDATE_RATE", fieldIdentifier: id, newRate: rate }); if (result.success) apply(n); };
  // Cycle the unit through the common options (tap to advance).
  const cycleUnit = (id: string, current: string) => {
    const i = UNITS.indexOf(current); const nextU = UNITS[(i + 1) % UNITS.length];
    const { schema: n, result } = executeKitCommand(draft, { type: "UPDATE_RATE", fieldIdentifier: id, newRate: draft.pricing?.[`${id}Rate`] ?? 0, unit: nextU }); if (result.success) apply(n);
  };

  // Delete a field instantly + offer a 4s undo (no confirm dialog).
  const deleteField = (id: string, label: string) => {
    const before = draft;
    const { schema: n, result } = executeKitCommand(draft, { type: "REMOVE_FIELD", fieldIdentifier: id });
    if (!result.success) return;
    apply(n);
    setUndo({ label, before });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 4000);
  };
  const doUndo = () => { if (undo) { apply(undo.before); setUndo(null); } if (undoTimer.current) clearTimeout(undoTimer.current); };

  // Delete a whole section (and its fields) — requires confirmation, no undo.
  const deleteSection = (sec: any) => {
    const count = sec.options?.length || 0;
    Alert.alert(`Delete ${sec.name}?`, `Removes all ${count} field${count !== 1 ? "s" : ""} inside it.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        let n = draft;
        for (const opt of sec.options || []) { const r = executeKitCommand(n, { type: "REMOVE_FIELD", fieldIdentifier: opt.id }); if (r.result.success) n = r.schema; }
        apply(n);
      } },
    ]);
  };

  const resetAddForm = () => { setAddType(null); setFName(""); setFRate(""); setFUnit("sq ft"); setFLinked(""); setFOptions(""); };
  const closeAdd = () => { setAdding(false); resetAddForm(); };
  const commitAdd = () => {
    const name = fName.trim(); if (!name) return;
    const rate = Number(fRate) || 0;
    let next = draft;
    if (addType === "measure") next = addMeasurementField(draft, name, rate, fUnit);
    else if (addType === "yesno") next = addToggleField(draft, name, rate);
    else if (addType === "calculated") next = addCalculatedField(draft, name, fLinked.trim(), rate);
    else if (addType === "pickone") {
      const opts = fOptions.split(",").map(o => o.trim()).filter(Boolean).map(o => { const m = o.match(/^(.*?)[\s:$]*([\d.]+)?$/); return { label: (m?.[1] || o).trim(), rate: Number(m?.[2]) || 0, unit: fUnit }; });
      next = addSelectField(draft, name, opts.length ? opts : [{ label: "Option 1", rate, unit: fUnit }]);
    }
    apply(next); closeAdd();
  };
  const applyTemplate = (t: { label: string; type: AddType; rate: number; unit: string }) => { setAddType(t.type); setFName(t.label); setFRate(String(t.rate)); setFUnit(t.unit); };

  // ── Admin guard ──
  if (!isAdmin) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: th.background }]}>
        <View style={[s.navBar, { borderBottomColor: th.border }]}>
          <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Feather name="chevron-left" size={18} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>Back</Text>
          </TouchableOpacity>
          <Text style={[s.navTitle, { color: th.text }]}>Quote Tool</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 14 }}>
          <Feather name="lock" size={40} color={th.textMuted} />
          <Text style={{ color: th.text, fontSize: 18, fontWeight: "800", fontFamily: "Syne_700Bold", textAlign: "center" }}>Only admins can edit the quote tool</Text>
          <Text style={{ color: th.textMuted, fontSize: 14, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 21 }}>Contact your account owner to make changes to the setup.</Text>
          <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, marginTop: 8, paddingHorizontal: 28 }]} onPress={onBack}><Text style={[s.btnText, { color: ON_PRIMARY }]}>Go back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Version history ──
  if (showHistory) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: th.background }]}>
        <View style={[s.navBar, { borderBottomColor: th.border }]}>
          <TouchableOpacity onPress={() => setShowHistory(false)} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Feather name="chevron-left" size={18} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>Back</Text>
          </TouchableOpacity>
          <Text style={[s.navTitle, { color: th.text }]}>Version History</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
          {(versions || []).length === 0 && <Text style={{ color: th.textMuted, fontSize: 14, fontFamily: "DMSans_400Regular", textAlign: "center", marginTop: 40 }}>No saved versions yet.</Text>}
          {(versions || []).map((v, i) => (
            <View key={i} style={{ backgroundColor: th.surface, borderColor: th.border, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: th.text, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{v.source}</Text>
                <Text style={{ color: th.textMuted, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{new Date(v.timestamp).toLocaleString()} · {v.schema?.fields?.length ?? 0} fields</Text>
              </View>
              <TouchableOpacity onPress={() => Alert.alert("Restore this version?", "This replaces your current quote tool.", [{ text: "Cancel", style: "cancel" }, { text: "Restore", onPress: () => { apply(v.schema); setShowHistory(false); } }])} style={{ borderWidth: 1, borderColor: primaryColor, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Restore</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main editor ──
  return (
    <SafeAreaView style={[s.container, { backgroundColor: th.background }]}>
      <View style={[s.navBar, { borderBottomColor: th.border }]}>
        <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Feather name="chevron-left" size={18} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>Done</Text>
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: th.text }]}>Your Quote Tool</Text>
        <View style={{ width: 60, alignItems: "flex-end" }}>
          {savedFlash && <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Feather name="check" size={14} color={th.success} /><Text style={{ color: th.success, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Saved</Text></View>}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}>
        <Text style={{ color: th.textMuted, fontSize: 13, fontFamily: "DMSans_400Regular" }}>Tap a name or price to edit. Reorder with the arrows. Everything saves automatically.</Text>

        {sections.length === 0 ? (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 }}>
            <Feather name="plus-circle" size={44} color={primaryColor} />
            <Text style={{ color: th.text, fontSize: 18, fontWeight: "800", fontFamily: "Syne_700Bold" }}>Your quote tool is empty</Text>
            <Text style={{ color: th.textMuted, fontSize: 14, fontFamily: "DMSans_400Regular", textAlign: "center" }}>Start by adding your first field.</Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, flexDirection: "row", gap: 8, paddingHorizontal: 24 }]} onPress={() => { resetAddForm(); setAdding(true); }}>
              <Feather name="plus" size={18} color={ON_PRIMARY} /><Text style={[s.btnText, { color: ON_PRIMARY }]}>Add your first field</Text>
            </TouchableOpacity>
          </View>
        ) : sections.map((sec: any, idx: number) => (
          <View key={sec.id} style={{ backgroundColor: th.surface, borderColor: th.border, borderWidth: 1, borderRadius: 16, overflow: "hidden" }}>
            {/* Section header: ▲▼ · name · +Add Field · 🗑 */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderBottomWidth: 1, borderBottomColor: th.border }}>
              <DragHandle onUp={() => moveSection(idx, -1)} onDown={() => moveSection(idx, 1)} canUp={idx > 0} canDown={idx < sections.length - 1} color={th.textMuted} accent={primaryColor} />
              <Text style={{ color: th.text, fontSize: 15, fontWeight: "800", fontFamily: "Syne_700Bold", flex: 1 }} numberOfLines={1}>{sec.name}</Text>
              <TouchableOpacity onPress={() => { resetAddForm(); setAdding(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 4 }} hitSlop={6}>
                <Feather name="plus" size={15} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteSection(sec)} hitSlop={8} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}><Feather name="trash-2" size={17} color={th.error} /></TouchableOpacity>
            </View>

            {/* Default-on toggle */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: th.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>Include by default on new quotes</Text>
              <Switch value={!!sec.defaultOn} onValueChange={(v) => apply(setSectionDefault(draft, sec.id, v))} trackColor={{ true: primaryColor, false: th.border }} thumbColor="#FFFFFF" />
            </View>

            {/* Fields */}
            {(sec.options || []).length === 0 ? (
              <View style={{ margin: 12, borderWidth: 1, borderStyle: "dashed", borderColor: th.border, borderRadius: 10, padding: 16, alignItems: "center" }}>
                <Text style={{ color: th.textMuted, fontSize: 13, fontFamily: "DMSans_400Regular" }}>No fields yet — tap + Add above.</Text>
              </View>
            ) : (sec.options || []).map((opt: any, oi: number) => (
              <View key={opt.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: th.background }}>
                <DragHandle onUp={() => moveOption(sec, oi, -1)} onDown={() => moveOption(sec, oi, 1)} canUp={oi > 0} canDown={oi < sec.options.length - 1} color={th.textMuted} accent={primaryColor} />
                <EditableFieldRow th={th} label={opt.label} rate={opt.rate} unit={opt.unit} primaryColor={primaryColor}
                  onRename={(v) => renameOption(opt.id, v)} onRate={(v) => setRate(opt.id, v)} onCycleUnit={() => cycleUnit(opt.id, opt.unit)} onDelete={() => deleteField(opt.id, opt.label)} />
              </View>
            ))}
          </View>
        ))}

        {/* Add-ons */}
        {(draft.addOns || []).length > 0 && (
          <View style={{ backgroundColor: th.surface, borderColor: th.border, borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 }}>
            <Text style={{ color: th.text, fontSize: 15, fontWeight: "800", fontFamily: "Syne_700Bold", marginBottom: 2 }}>Add-ons</Text>
            {(draft.addOns || []).map(a => (
              <View key={a.id} style={{ paddingVertical: 2 }}>
                <EditableFieldRow th={th} label={a.label} rate={a.price} unit="flat" primaryColor={primaryColor}
                  onRename={(v) => { const { schema: n, result } = executeKitCommand(draft, { type: "UPDATE_ADDON", addonIdentifier: a.id, newLabel: v }); if (result.success) apply(n); }}
                  onRate={(v) => { const { schema: n, result } = executeKitCommand(draft, { type: "UPDATE_ADDON", addonIdentifier: a.id, newPrice: v }); if (result.success) apply(n); }}
                  onDelete={() => deleteField(a.id, a.label)} />
              </View>
            ))}
          </View>
        )}

        {sections.length > 0 && (
          <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, flexDirection: "row", justifyContent: "center", gap: 8 }]} onPress={() => { resetAddForm(); setAdding(true); }}>
            <Feather name="plus" size={18} color={ON_PRIMARY} /><Text style={[s.btnText, { color: ON_PRIMARY }]}>Add Field</Text>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection: "row", gap: 12 }}>
          {onAskKit && (
            <TouchableOpacity style={[s.btnSecondary, { flex: 1, borderColor: primaryColor, flexDirection: "row", justifyContent: "center", gap: 6 }]} onPress={onAskKit}>
              <Feather name="message-circle" size={15} color={primaryColor} /><Text style={[s.btnSecondaryText, { color: primaryColor }]}>Ask Kit instead</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.btnSecondary, { flex: 1, borderColor: th.border, flexDirection: "row", justifyContent: "center", gap: 6 }]} onPress={() => setShowHistory(true)}>
            <Feather name="clock" size={15} color={th.textMuted} /><Text style={[s.btnSecondaryText, { color: th.textMuted }]}>Version History</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Undo toast for field delete */}
      {undo && (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: 24, backgroundColor: "#0A0E1A", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "DMSans_600SemiBold", flex: 1 }} numberOfLines={1}>{undo.label} removed</Text>
          <TouchableOpacity onPress={doUndo} hitSlop={8}><Text style={{ color: primaryColor, fontSize: 14, fontWeight: "800", fontFamily: "DMSans_700Bold" }}>Undo</Text></TouchableOpacity>
        </View>
      )}

      {/* Add-field bottom sheet */}
      <Modal visible={adding} transparent animationType="slide" onRequestClose={closeAdd}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={closeAdd}>
          <Pressable style={{ backgroundColor: th.surfaceHigh, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" }} onPress={() => {}}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: th.text, fontSize: 18, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{addType ? "Quick setup" : "What kind of field?"}</Text>
                <TouchableOpacity onPress={closeAdd} hitSlop={8}><Feather name="x" size={24} color={th.textMuted} /></TouchableOpacity>
              </View>
              {!addType ? (
                <>
                  {([
                    { t: "measure", icon: "📐", title: "I measure something", hint: "sq feet, linear feet" },
                    { t: "yesno", icon: "☑️", title: "Include it or not", hint: "permit, delivery" },
                    { t: "pickone", icon: "🔘", title: "Pick from a list", hint: "material type" },
                    { t: "calculated", icon: "🔗", title: "Calculates from another", hint: "protection × sq footage" },
                  ] as const).map(c => (
                    <TouchableOpacity key={c.t} onPress={() => setAddType(c.t)} style={{ minHeight: 64, backgroundColor: th.surface, borderColor: th.border, borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
                      <Text style={{ fontSize: 26 }}>{c.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: th.text, fontSize: 15, fontWeight: "800", fontFamily: "DMSans_700Bold" }}>{c.title}</Text>
                        <Text style={{ color: th.textMuted, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{c.hint}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
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
                    <TouchableOpacity style={[s.btn, { flex: 2, backgroundColor: primaryColor, opacity: fName.trim() ? 1 : 0.4 }]} disabled={!fName.trim()} onPress={commitAdd}>
                      <Text style={[s.btnText, { color: ON_PRIMARY }]}>Add Field →</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// One editable field row: tap name/rate to edit inline (auto-saves on blur); tap unit to cycle; 🗑 deletes.
function EditableFieldRow({ th, label, rate, unit, primaryColor, onRename, onRate, onCycleUnit, onDelete }: {
  th: ReturnType<typeof useTheme>; label: string; rate: number; unit: string; primaryColor: string;
  onRename: (v: string) => void; onRate: (v: number) => void; onCycleUnit?: () => void; onDelete: () => void;
}) {
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
