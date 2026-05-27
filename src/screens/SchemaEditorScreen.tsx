import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Alert, Platform, SafeAreaView, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { s } from "../styles";
import { QuoteSchema, SchemaVersion } from "../types";
import { deriveSections } from "../utils/buildSchemaFromVerified";
import { executeKitCommand } from "../utils/executeKitCommand";
import { ON_PRIMARY } from "../utils/colorUtils";
import { addCalculatedField, addMeasurementField, addSelectField, addToggleField, reorderFields, setSectionDefault } from "../utils/schemaEditorOps";

type AddType = "measure" | "yesno" | "pickone" | "calculated";
const UNITS = ["sq ft", "lf", "hour", "each", "flat"];

// Common fields offered as one-tap template pills (sensible default rates the contractor can tweak).
const FIELD_TEMPLATES: { label: string; type: AddType; rate: number; unit: string }[] = [
  { label: "Permit Fee", type: "yesno", rate: 200, unit: "flat" },
  { label: "Demo/Tearout", type: "yesno", rate: 500, unit: "flat" },
  { label: "Delivery", type: "yesno", rate: 150, unit: "flat" },
  { label: "Labor Hours", type: "measure", rate: 75, unit: "hour" },
  { label: "Stair Install", type: "yesno", rate: 800, unit: "flat" },
  { label: "Lighting Package", type: "yesno", rate: 1200, unit: "flat" },
  { label: "Haul Away", type: "yesno", rate: 250, unit: "flat" },
];

// Manual quote-tool editor (Settings only — never in onboarding). Edits a working copy and commits
// via onSave, which persists + records a version. All mutations go through the tested pure ops.
export function SchemaEditorScreen({ schema, primaryColor, versions, onSave, onBack, onRestore, onAskKit }: {
  schema: QuoteSchema;
  primaryColor: string;
  versions?: SchemaVersion[];
  onSave: (schema: QuoteSchema) => void;
  onBack: () => void;
  onRestore?: (schema: QuoteSchema) => void;
  onAskKit?: () => void;
}) {
  const [draft, setDraft] = useState<QuoteSchema>(schema);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);          // add-field flow open
  const [addType, setAddType] = useState<AddType | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Quick-setup inputs.
  const [fName, setFName] = useState("");
  const [fRate, setFRate] = useState("");
  const [fUnit, setFUnit] = useState("sq ft");
  const [fLinked, setFLinked] = useState("");
  const [fOptions, setFOptions] = useState("");

  const apply = (next: QuoteSchema) => { setDraft(next); setDirty(true); };
  const sections = useMemo(() => deriveSections(draft.fields || [], draft.pricing || {}, undefined, draft.defaultSectionIds), [draft]);

  // The fields[] index of a section's primary field (used for reordering).
  const primaryFieldIndex = (sec: any): number => {
    const id = sec.materialFieldId || sec.quantityFieldId || (sec.options?.[0]?.id);
    return (draft.fields || []).findIndex(f => f.id === id);
  };
  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = sections[idx + dir];
    if (!target) return;
    const from = primaryFieldIndex(sections[idx]);
    const to = primaryFieldIndex(target);
    if (from < 0 || to < 0) return;
    apply(reorderFields(draft, from, to));
  };

  const renameField = (id: string, label: string) => { const { schema: n, result } = executeKitCommand(draft, { type: "RENAME_FIELD", fieldIdentifier: id, newLabel: label }); if (result.success) apply(n); };
  const setRate = (id: string, rate: number) => { const { schema: n, result } = executeKitCommand(draft, { type: "UPDATE_RATE", fieldIdentifier: id, newRate: rate }); if (result.success) apply(n); };
  const deleteField = (id: string, label: string) => Alert.alert("Remove field?", `Remove "${label}" from your quote tool?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => { const { schema: n, result } = executeKitCommand(draft, { type: "REMOVE_FIELD", fieldIdentifier: id }); if (result.success) apply(n); } },
  ]);

  const resetAddForm = () => { setAddType(null); setFName(""); setFRate(""); setFUnit("sq ft"); setFLinked(""); setFOptions(""); };
  const commitAdd = () => {
    const name = fName.trim();
    if (!name) return;
    const rate = Number(fRate) || 0;
    let next = draft;
    if (addType === "measure") next = addMeasurementField(draft, name, rate, fUnit);
    else if (addType === "yesno") next = addToggleField(draft, name, rate);
    else if (addType === "calculated") next = addCalculatedField(draft, name, fLinked.trim(), rate);
    else if (addType === "pickone") {
      const opts = fOptions.split(",").map(o => o.trim()).filter(Boolean).map(o => { const m = o.match(/^(.*?)[\s:$]*([\d.]+)?$/); return { label: (m?.[1] || o).trim(), rate: Number(m?.[2]) || 0, unit: fUnit }; });
      next = addSelectField(draft, name, opts.length ? opts : [{ label: "Option 1", rate, unit: fUnit }]);
    }
    apply(next); setAdding(false); resetAddForm();
  };
  const applyTemplate = (t: { label: string; type: AddType; rate: number; unit: string }) => {
    setAdding(true); setAddType(t.type); setFName(t.label); setFRate(String(t.rate)); setFUnit(t.unit);
  };

  const save = () => { onSave(draft); setDirty(false); };

  // ── Add-field flow ──
  if (adding) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: B.midnight }]}>
        <View style={[s.navBar, { borderBottomColor: B.border }]}>
          <TouchableOpacity onPress={() => { setAdding(false); resetAddForm(); }} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Feather name="chevron-left" size={18} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>Back</Text>
          </TouchableOpacity>
          <Text style={[s.navTitle, { color: B.white }]}>Add a field</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          {!addType ? (
            <>
              <Text style={{ color: B.white, fontSize: 18, fontWeight: "800", fontFamily: "Syne_700Bold" }}>What are you adding?</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {([
                  { t: "measure", icon: "📐", title: "Something you measure", hint: "sq footage, linear feet" },
                  { t: "yesno", icon: "☑️", title: "Something you include or not", hint: "permit fee, demo, delivery" },
                  { t: "pickone", icon: "🔘", title: "Pick one from a list", hint: "material type, railing system" },
                  { t: "calculated", icon: "🔗", title: "Calculates from another field", hint: "protection × sq footage" },
                ] as const).map(c => (
                  <TouchableOpacity key={c.t} onPress={() => setAddType(c.t)} style={{ width: "47%", flexGrow: 1, minWidth: 150, minHeight: 120, backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 }}>
                    <Text style={{ fontSize: 30 }}>{c.icon}</Text>
                    <Text style={{ color: B.white, fontSize: 15, fontWeight: "800", fontFamily: "DMSans_700Bold" }}>{c.title}</Text>
                    <Text style={{ color: B.muted, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{c.hint}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ color: B.muted, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold", marginTop: 6 }}>OR ADD A COMMON FIELD</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {FIELD_TEMPLATES.map(t => (
                  <TouchableOpacity key={t.label} onPress={() => applyTemplate(t)} style={{ borderWidth: 1, borderColor: primaryColor, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 }}>
                    <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <View style={{ gap: 14 }}>
              <Text style={{ color: B.white, fontSize: 18, fontWeight: "800", fontFamily: "Syne_700Bold" }}>Quick setup</Text>
              <View style={{ gap: 6 }}>
                <Text style={s.formLabel}>Name</Text>
                <TextInput style={s.input} value={fName} onChangeText={setFName} placeholder="e.g. Stairs" placeholderTextColor={B.gray3} autoFocus />
              </View>
              {addType === "pickone" ? (
                <View style={{ gap: 6 }}>
                  <Text style={s.formLabel}>Options (comma-separated, e.g. &quot;Cedar 28, Composite 35&quot;)</Text>
                  <TextInput style={s.input} value={fOptions} onChangeText={setFOptions} placeholder="Pressure Treated 20, Composite 35" placeholderTextColor={B.gray3} />
                </View>
              ) : addType === "calculated" ? (
                <>
                  <View style={{ gap: 6 }}>
                    <Text style={s.formLabel}>Calculates from (source field name)</Text>
                    <TextInput style={s.input} value={fLinked} onChangeText={setFLinked} placeholder="e.g. Deck Square Footage" placeholderTextColor={B.gray3} />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={s.formLabel}>Price per unit of that field</Text>
                    <TextInput style={s.input} value={fRate} onChangeText={t => setFRate(t.replace(/[^0-9.]/g, ""))} placeholder="0.50" placeholderTextColor={B.gray3} keyboardType="numeric" />
                  </View>
                  {!!fRate && !!fLinked && <Text style={{ color: primaryColor, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>Preview: 300 {fUnit} × ${fRate} = ${(300 * (Number(fRate) || 0)).toLocaleString()}</Text>}
                </>
              ) : (
                <View style={{ gap: 6 }}>
                  <Text style={s.formLabel}>{addType === "yesno" ? "Price" : "Rate"}</Text>
                  <TextInput style={s.input} value={fRate} onChangeText={t => setFRate(t.replace(/[^0-9.]/g, ""))} placeholder="0" placeholderTextColor={B.gray3} keyboardType="numeric" />
                </View>
              )}
              {(addType === "measure" || addType === "pickone") && (
                <View style={{ gap: 6 }}>
                  <Text style={s.formLabel}>Unit</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {UNITS.map(u => (
                      <TouchableOpacity key={u} onPress={() => setFUnit(u)} style={{ borderWidth: 1, borderColor: fUnit === u ? primaryColor : B.border, backgroundColor: fUnit === u ? primaryColor : "transparent", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 }}>
                        <Text style={{ color: fUnit === u ? ON_PRIMARY : B.gray2, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, opacity: fName.trim() ? 1 : 0.4 }]} disabled={!fName.trim()} onPress={commitAdd}>
                <Text style={[s.btnText, { color: ON_PRIMARY }]}>Add to quote tool</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Version history ──
  if (showHistory) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: B.midnight }]}>
        <View style={[s.navBar, { borderBottomColor: B.border }]}>
          <TouchableOpacity onPress={() => setShowHistory(false)} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Feather name="chevron-left" size={18} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>Back</Text>
          </TouchableOpacity>
          <Text style={[s.navTitle, { color: B.white }]}>Version History</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
          {(versions || []).length === 0 && <Text style={{ color: B.muted, fontSize: 14, fontFamily: "DMSans_400Regular", textAlign: "center", marginTop: 40 }}>No saved versions yet.</Text>}
          {(versions || []).map((v, i) => (
            <View key={i} style={{ backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: B.white, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{v.source}</Text>
                <Text style={{ color: B.muted, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{new Date(v.timestamp).toLocaleString()} · {v.schema?.fields?.length ?? 0} fields</Text>
              </View>
              {onRestore && (
                <TouchableOpacity onPress={() => Alert.alert("Restore this version?", "This replaces your current quote tool. You can still undo by restoring a newer version.", [{ text: "Cancel", style: "cancel" }, { text: "Restore", onPress: () => { setDraft(v.schema); setDirty(true); setShowHistory(false); onRestore(v.schema); } }])} style={{ borderWidth: 1, borderColor: primaryColor, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 }}>
                  <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Restore</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main editor ──
  return (
    <SafeAreaView style={[s.container, { backgroundColor: B.midnight }]}>
      <View style={[s.navBar, { borderBottomColor: B.border }]}>
        <TouchableOpacity onPress={() => dirty ? Alert.alert("Discard changes?", "You have unsaved edits.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: onBack }]) : onBack()} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Feather name="chevron-left" size={18} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>Back</Text>
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: B.white }]}>Your Quote Tool</Text>
        <TouchableOpacity onPress={save} disabled={!dirty}><Text style={{ color: dirty ? primaryColor : B.gray3, fontSize: 16, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Save</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
        <Text style={{ color: B.muted, fontSize: 13, fontFamily: "DMSans_400Regular" }}>Tap a price or name to edit. Reorder with the arrows. Changes save when you tap Save.</Text>

        {sections.map((sec: any, idx: number) => (
          <View key={sec.id} style={{ backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ gap: 2 }}>
                <TouchableOpacity onPress={() => moveSection(idx, -1)} disabled={idx === 0} hitSlop={6}><Feather name="chevron-up" size={18} color={idx === 0 ? B.gray3 : B.gray2} /></TouchableOpacity>
                <TouchableOpacity onPress={() => moveSection(idx, 1)} disabled={idx === sections.length - 1} hitSlop={6}><Feather name="chevron-down" size={18} color={idx === sections.length - 1 ? B.gray3 : B.gray2} /></TouchableOpacity>
              </View>
              <Text style={{ color: B.white, fontSize: 16, fontWeight: "800", fontFamily: "Syne_700Bold", flex: 1 }}>{sec.name}</Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: B.border, paddingTop: 8 }}>
              <Text style={{ color: B.gray2, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>Include by default on new quotes</Text>
              <Switch value={!!sec.defaultOn} onValueChange={(v) => apply(setSectionDefault(draft, sec.id, v))} trackColor={{ true: primaryColor, false: B.border }} thumbColor={B.white} />
            </View>

            {(sec.options || []).map((opt: any) => (
              <EditableFieldRow key={opt.id} label={opt.label} rate={opt.rate} unit={opt.unit} primaryColor={primaryColor}
                onRename={(v) => renameField(opt.id, v)} onRate={(v) => setRate(opt.id, v)} onDelete={() => deleteField(opt.id, opt.label)} />
            ))}
          </View>
        ))}

        {/* Add-ons */}
        {(draft.addOns || []).length > 0 && (
          <View style={{ backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 }}>
            <Text style={{ color: B.white, fontSize: 16, fontWeight: "800", fontFamily: "Syne_700Bold" }}>Add-ons</Text>
            {(draft.addOns || []).map(a => (
              <EditableFieldRow key={a.id} label={a.label} rate={a.price} unit="flat" primaryColor={primaryColor}
                onRename={(v) => { const { schema: n, result } = executeKitCommand(draft, { type: "UPDATE_ADDON", addonIdentifier: a.id, newLabel: v }); if (result.success) apply(n); }}
                onRate={(v) => { const { schema: n, result } = executeKitCommand(draft, { type: "UPDATE_ADDON", addonIdentifier: a.id, newPrice: v }); if (result.success) apply(n); }}
                onDelete={() => Alert.alert("Remove add-on?", `Remove "${a.label}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => { const { schema: n, result } = executeKitCommand(draft, { type: "REMOVE_ADDON", addonIdentifier: a.id }); if (result.success) apply(n); } }])} />
            ))}
          </View>
        )}

        <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, flexDirection: "row", justifyContent: "center", gap: 8 }]} onPress={() => { resetAddForm(); setAdding(true); }}>
          <Feather name="plus" size={18} color={ON_PRIMARY} /><Text style={[s.btnText, { color: ON_PRIMARY }]}>Add field</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", gap: 12 }}>
          {onAskKit && (
            <TouchableOpacity style={[s.btnSecondary, { flex: 1, borderColor: primaryColor, flexDirection: "row", justifyContent: "center", gap: 6 }]} onPress={onAskKit}>
              <Feather name="message-circle" size={15} color={primaryColor} /><Text style={[s.btnSecondaryText, { color: primaryColor }]}>Ask Kit instead</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.btnSecondary, { flex: 1, borderColor: B.border, flexDirection: "row", justifyContent: "center", gap: 6 }]} onPress={() => setShowHistory(true)}>
            <Feather name="clock" size={15} color={B.gray2} /><Text style={[s.btnSecondaryText, { color: B.gray2 }]}>Version History</Text>
          </TouchableOpacity>
        </View>
        {Platform.OS === "web" && <Text style={{ color: B.gray3, fontSize: 11, textAlign: "center", fontFamily: "DMSans_400Regular" }}>Use the up/down arrows to reorder sections.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

// One editable field row: tap name or rate to edit inline; × to delete.
function EditableFieldRow({ label, rate, unit, primaryColor, onRename, onRate, onDelete }: {
  label: string; rate: number; unit: string; primaryColor: string;
  onRename: (v: string) => void; onRate: (v: number) => void; onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [nameDraft, setNameDraft] = useState(label);
  const [rateDraft, setRateDraft] = useState(String(rate));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {editingName ? (
        <TextInput style={[s.input, { flex: 1 }]} value={nameDraft} onChangeText={setNameDraft} autoFocus onBlur={() => { setEditingName(false); if (nameDraft.trim() && nameDraft !== label) onRename(nameDraft.trim()); }} />
      ) : (
        <TouchableOpacity style={{ flex: 1 }} onPress={() => { setNameDraft(label); setEditingName(true); }}>
          <Text style={{ color: B.white, fontSize: 15, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{label}</Text>
        </TouchableOpacity>
      )}
      {editingRate ? (
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: B.border, borderRadius: 8, paddingHorizontal: 6 }}>
          <Text style={{ color: B.gray3, fontSize: 14 }}>$</Text>
          <TextInput style={{ width: 56, color: B.white, fontSize: 14, paddingVertical: 8, fontFamily: "DMSans_400Regular" }} value={rateDraft} onChangeText={t => setRateDraft(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" autoFocus onBlur={() => { setEditingRate(false); const n = Number(rateDraft); if (!Number.isNaN(n) && n !== rate) onRate(n); }} />
        </View>
      ) : (
        <TouchableOpacity onPress={() => { setRateDraft(String(rate)); setEditingRate(true); }}>
          <Text style={{ color: primaryColor, fontSize: 14, fontWeight: "800", fontFamily: "Syne_700Bold" }}>${rate.toLocaleString()}<Text style={{ color: B.muted, fontWeight: "400" }}> /{unit}</Text></Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onDelete} hitSlop={8}><Feather name="x" size={18} color={B.gray3} /></TouchableOpacity>
    </View>
  );
}
