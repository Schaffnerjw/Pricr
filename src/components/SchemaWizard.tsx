import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { s } from "../styles";
import { ON_PRIMARY } from "../utils/colorUtils";
import { WizardData, WizardVariant } from "../utils/schemaExtractor";

const TRADES = ["Deck Building", "Lawn Care", "Moving", "Junk Removal", "Pressure Washing", "Christmas Lights", "Window Cleaning", "Painting", "HVAC", "Plumbing", "Roofing", "Fencing", "Pool Service", "Handyman"];
const METHODS: { key: string; label: string }[] = [
  { key: "sqft", label: "Per sq ft" }, { key: "lf", label: "Per linear foot" }, { key: "hour", label: "Per hour" },
  { key: "flat", label: "Flat rate" }, { key: "item", label: "Per item" }, { key: "multiple", label: "Multiple methods" },
];
// Common add-on suggestions by trade keyword.
const ADDON_SUGGESTIONS: Record<string, string[]> = {
  deck: ["Railing", "Stairs", "Permit", "Demo old deck"], lawn: ["Edging", "Leaf cleanup", "Fertilizing"],
  moving: ["Packing", "Heavy item", "Stairs fee"], paint: ["Trim", "Ceilings", "Primer coat"],
  fenc: ["Gate", "Demo & haul", "Corner posts"], roof: ["Tear off", "Permit", "Skylight"],
};

const numOnly = (v: string) => v.replace(/[^0-9.]/g, "");
const toNum = (v: string) => Number(v) || 0;

export function SchemaWizard({ primaryColor, backgroundColor, initialTrade, onComplete, onBack }: {
  primaryColor: string; backgroundColor?: string; initialTrade?: string;
  onComplete: (data: WizardData) => void; onBack: () => void;
}) {
  const onPrimary = ON_PRIMARY;
  const [step, setStep] = useState(1);
  const [trade, setTrade] = useState(initialTrade || "");
  const [customTrade, setCustomTrade] = useState("");
  const [method, setMethod] = useState("");
  // Screen 2 state
  const [sqftPrimary, setSqftPrimary] = useState("");
  const [sqftVariants, setSqftVariants] = useState<{ name: string; rate: string }[]>([]);
  const [lfPrimary, setLfPrimary] = useState("");
  const [lfVariants, setLfVariants] = useState<{ name: string; rate: string }[]>([]);
  const [hourRate, setHourRate] = useState("");
  const [minHours, setMinHours] = useState("");
  const [flatStarting, setFlatStarting] = useState("");
  const [items, setItems] = useState<{ name: string; price: string }[]>([{ name: "", price: "" }]);
  const [addOns, setAddOns] = useState<{ name: string; price: string; perUnit: boolean }[]>([]);
  const [addOnDraft, setAddOnDraft] = useState("");
  // Screen 3
  const [deposit, setDeposit] = useState<number>(0);
  const [customDeposit, setCustomDeposit] = useState("");

  const effectiveTrade = (trade === "__custom" ? customTrade : trade).trim();
  const shownMethods = method === "multiple" ? ["sqft", "lf", "hour", "flat", "item"] : method ? [method] : [];
  const canNext1 = !!effectiveTrade && !!method;

  const input = (value: string, onChange: (v: string) => void, placeholder: string, numeric = true) => (
    <TextInput
      style={[s.input, { backgroundColor: B.card }]}
      value={value} onChangeText={v => onChange(numeric ? numOnly(v) : v)} placeholder={placeholder} placeholderTextColor={B.gray3}
      keyboardType={numeric ? "numeric" : "default"}
    />
  );

  const Pill = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: active ? primaryColor : B.border, backgroundColor: active ? primaryColor : B.card }}>
      <Text style={{ color: active ? onPrimary : B.gray1, fontSize: 14, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{label}</Text>
    </TouchableOpacity>
  );

  const kitMsg = (text: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <View style={[s.kitAvatar, { backgroundColor: primaryColor, width: 30, height: 30, borderRadius: 15 }]}><Text style={{ color: onPrimary, fontWeight: "800", fontFamily: "Syne_800ExtraBold", fontSize: 13 }}>K</Text></View>
      <Text style={{ flex: 1, color: B.gray1, fontSize: 16, fontWeight: "700", fontFamily: "Syne_700Bold" }}>{text}</Text>
    </View>
  );

  const VariantRows = ({ variants, setVariants }: { variants: { name: string; rate: string }[]; setVariants: (v: { name: string; rate: string }[]) => void }) => (
    <View style={{ gap: 8 }}>
      {variants.map((v, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput style={[s.input, { flex: 2, backgroundColor: B.card }]} value={v.name} onChangeText={t => setVariants(variants.map((x, j) => j === i ? { ...x, name: t } : x))} placeholder="Material name" placeholderTextColor={B.gray3} />
          <TextInput style={[s.input, { flex: 1, backgroundColor: B.card }]} value={v.rate} onChangeText={t => setVariants(variants.map((x, j) => j === i ? { ...x, rate: numOnly(t) } : x))} placeholder="$/unit" placeholderTextColor={B.gray3} keyboardType="numeric" />
          <TouchableOpacity onPress={() => setVariants(variants.filter((_, j) => j !== i))} hitSlop={8}><Feather name="x" size={18} color={B.gray3} /></TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity onPress={() => setVariants([...variants, { name: "", rate: "" }])} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Feather name="plus" size={16} color={primaryColor} />
        <Text style={{ color: primaryColor, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Add material variant</Text>
      </TouchableOpacity>
    </View>
  );

  const buildData = (): WizardData => {
    const cleanVariants = (vs: { name: string; rate: string }[]): WizardVariant[] => vs.filter(v => v.name.trim() && toNum(v.rate) > 0).map(v => ({ name: v.name.trim(), rate: toNum(v.rate) }));
    const methods: string[] = [];
    const data: WizardData = { trade: effectiveTrade, methods, addOns: addOns.filter(a => a.name.trim()).map(a => ({ name: a.name.trim(), price: toNum(a.price), perUnit: a.perUnit })), depositPercent: deposit === -1 ? toNum(customDeposit) : deposit };
    if (shownMethods.includes("sqft") && (toNum(sqftPrimary) > 0 || cleanVariants(sqftVariants).length)) { methods.push("sqft"); data.sqft = { primary: toNum(sqftPrimary), variants: cleanVariants(sqftVariants) }; }
    if (shownMethods.includes("lf") && (toNum(lfPrimary) > 0 || cleanVariants(lfVariants).length)) { methods.push("lf"); data.lf = { primary: toNum(lfPrimary), variants: cleanVariants(lfVariants) }; }
    if (shownMethods.includes("hour") && toNum(hourRate) > 0) { methods.push("hour"); data.hour = { rate: toNum(hourRate), minHours: toNum(minHours) || undefined }; }
    if (shownMethods.includes("flat") && toNum(flatStarting) > 0) { methods.push("flat"); data.flat = { starting: toNum(flatStarting) }; }
    const realItems = items.filter(it => it.name.trim() && toNum(it.price) > 0).map(it => ({ name: it.name.trim(), price: toNum(it.price) }));
    if (shownMethods.includes("item") && realItems.length) { methods.push("item"); data.item = { items: realItems }; }
    return data;
  };

  const addOnSuggestions = (() => {
    const t = effectiveTrade.toLowerCase();
    const key = Object.keys(ADDON_SUGGESTIONS).find(k => t.includes(k));
    return key ? ADDON_SUGGESTIONS[key] : [];
  })();

  return (
    <SafeAreaView style={[s.container, backgroundColor ? { backgroundColor } : null]}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => (step === 1 ? onBack() : setStep(step - 1))} style={[s.navBack, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
          <Feather name="chevron-left" size={18} color={primaryColor} />
          <Text style={[s.navBackText, { color: primaryColor }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[s.navTitle]}>Step {step} of 3</Text>
        <View style={{ width: 60 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <>
              {kitMsg("What type of work do you do?")}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {TRADES.map(t => <Pill key={t} label={t} active={trade === t} onPress={() => setTrade(t)} />)}
                <Pill label="Other — type yours" active={trade === "__custom"} onPress={() => setTrade("__custom")} />
              </View>
              {trade === "__custom" && input(customTrade, setCustomTrade, "Your trade", false)}
              {!!effectiveTrade && (
                <>
                  {kitMsg("How do you charge?")}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {METHODS.map(m => <Pill key={m.key} label={m.label} active={method === m.key} onPress={() => setMethod(m.key)} />)}
                  </View>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              {kitMsg("What do you charge?")}
              {shownMethods.includes("sqft") && (
                <View style={{ gap: 8 }}>
                  <Text style={s.formLabel}>Standard rate (per sq ft)</Text>
                  {input(sqftPrimary, setSqftPrimary, "$ per sq ft")}
                  <VariantRows variants={sqftVariants} setVariants={setSqftVariants} />
                </View>
              )}
              {shownMethods.includes("lf") && (
                <View style={{ gap: 8 }}>
                  <Text style={s.formLabel}>Rate per linear foot</Text>
                  {input(lfPrimary, setLfPrimary, "$ per linear foot")}
                  <VariantRows variants={lfVariants} setVariants={setLfVariants} />
                </View>
              )}
              {shownMethods.includes("hour") && (
                <View style={{ gap: 8 }}>
                  <Text style={s.formLabel}>Hourly rate</Text>
                  {input(hourRate, setHourRate, "$ per hour")}
                  <Text style={s.formLabel}>Minimum hours (optional)</Text>
                  {input(minHours, setMinHours, "e.g. 2")}
                </View>
              )}
              {shownMethods.includes("flat") && (
                <View style={{ gap: 8 }}>
                  <Text style={s.formLabel}>Starting price</Text>
                  {input(flatStarting, setFlatStarting, "Starting at $")}
                </View>
              )}
              {shownMethods.includes("item") && (
                <View style={{ gap: 8 }}>
                  <Text style={s.formLabel}>Items & prices</Text>
                  {items.map((it, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <TextInput style={[s.input, { flex: 2, backgroundColor: B.card }]} value={it.name} onChangeText={t => setItems(items.map((x, j) => j === i ? { ...x, name: t } : x))} placeholder="Item name" placeholderTextColor={B.gray3} />
                      <TextInput style={[s.input, { flex: 1, backgroundColor: B.card }]} value={it.price} onChangeText={t => setItems(items.map((x, j) => j === i ? { ...x, price: numOnly(t) } : x))} placeholder="$ each" placeholderTextColor={B.gray3} keyboardType="numeric" />
                      <TouchableOpacity onPress={() => setItems(items.filter((_, j) => j !== i))} hitSlop={8}><Feather name="x" size={18} color={B.gray3} /></TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => setItems([...items, { name: "", price: "" }])} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="plus" size={16} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Add another item type</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Add-ons (always shown) */}
              <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: B.border, paddingTop: 16 }}>
                {kitMsg("Any add-ons or optional extras?")}
                {addOnSuggestions.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {addOnSuggestions.filter(sug => !addOns.some(a => a.name.toLowerCase() === sug.toLowerCase())).map(sug => (
                      <TouchableOpacity key={sug} onPress={() => setAddOns([...addOns, { name: sug, price: "", perUnit: false }])} style={[s.chip, { borderColor: primaryColor + "60" }]}>
                        <Text style={[s.chipText, { color: primaryColor }]}>+ {sug}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput style={[s.input, { flex: 1, backgroundColor: B.card }]} value={addOnDraft} onChangeText={setAddOnDraft} placeholder="Add-on name" placeholderTextColor={B.gray3} />
                  <TouchableOpacity onPress={() => { if (addOnDraft.trim()) { setAddOns([...addOns, { name: addOnDraft.trim(), price: "", perUnit: false }]); setAddOnDraft(""); } }} style={[s.btn, { paddingHorizontal: 18, justifyContent: "center" }]}>
                    <Text style={s.btnText}>Add</Text>
                  </TouchableOpacity>
                </View>
                {addOns.map((a, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: B.card, borderRadius: 12, borderWidth: 1, borderColor: B.border, padding: 8 }}>
                    <Text style={{ flex: 1, color: B.gray1, fontSize: 14, fontFamily: "DMSans_600SemiBold", paddingLeft: 4 }}>{a.name}</Text>
                    <TextInput style={{ width: 80, color: B.white, fontSize: 14, fontFamily: "DMSans_400Regular", borderWidth: 1, borderColor: B.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }} value={a.price} onChangeText={t => setAddOns(addOns.map((x, j) => j === i ? { ...x, price: numOnly(t) } : x))} placeholder="$" placeholderTextColor={B.gray3} keyboardType="numeric" />
                    <TouchableOpacity onPress={() => setAddOns(addOns.map((x, j) => j === i ? { ...x, perUnit: !x.perUnit } : x))} style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: a.perUnit ? primaryColor : B.border }}>
                      <Text style={{ color: a.perUnit ? primaryColor : B.gray2, fontSize: 11, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{a.perUnit ? "per unit" : "flat"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAddOns(addOns.filter((_, j) => j !== i))} hitSlop={8}><Feather name="x" size={18} color={B.gray3} /></TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}

          {step === 3 && (
            <>
              {kitMsg("Last thing — do you require a deposit upfront?")}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {[["No deposit", 0], ["25%", 25], ["30%", 30], ["50%", 50], ["Custom %", -1]].map(([label, val]) => (
                  <Pill key={String(label)} label={String(label)} active={deposit === val} onPress={() => setDeposit(val as number)} />
                ))}
              </View>
              {deposit === -1 && input(customDeposit, setCustomDeposit, "Deposit %")}

              {/* Summary */}
              <View style={{ backgroundColor: B.card, borderRadius: 16, borderWidth: 1, borderColor: B.border, padding: 16, gap: 8, marginTop: 8 }}>
                <Text style={{ color: B.gray1, fontSize: 15, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{effectiveTrade || "Your tool"}</Text>
                {/* Blank prices are a first-class state across Pricr (Import + edit mode both allow them
                    with placeholder hints) — no warning here, no gate on the Build button below. */}
                {buildData().methods.length === 0 && (
                  <Text style={{ color: B.muted, fontSize: 13, fontFamily: "DMSans_400Regular" }}>You can leave prices blank and fill them in the editor — placeholder hints will guide you.</Text>
                )}
                {(() => { const d = buildData(); return (<>
                  {d.sqft && <SummaryLine label="Per sq ft" value={d.sqft.variants.length ? d.sqft.variants.map(v => `${v.name} $${v.rate}`).join(", ") : `$${d.sqft.primary}/sq ft`} primaryColor={primaryColor} />}
                  {d.lf && <SummaryLine label="Per linear ft" value={d.lf.variants.length ? d.lf.variants.map(v => `${v.name} $${v.rate}`).join(", ") : `$${d.lf.primary}/lf`} primaryColor={primaryColor} />}
                  {d.hour && <SummaryLine label="Hourly" value={`$${d.hour.rate}/hr${d.hour.minHours ? ` · min ${d.hour.minHours}h` : ""}`} primaryColor={primaryColor} />}
                  {d.flat && <SummaryLine label="Flat" value={`Starting at $${d.flat.starting}`} primaryColor={primaryColor} />}
                  {d.item && d.item.items.map(it => <SummaryLine key={it.name} label={it.name} value={`$${it.price} each`} primaryColor={primaryColor} />)}
                  {d.addOns.map(a => <SummaryLine key={a.name} label={`+ ${a.name}`} value={`$${a.price}${a.perUnit ? "/unit" : " flat"}`} primaryColor={primaryColor} />)}
                  <SummaryLine label="Deposit" value={`${d.depositPercent || 0}%`} primaryColor={primaryColor} />
                </>); })()}
              </View>
            </>
          )}
        </ScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: B.border }}>
          {step < 3 ? (
            <TouchableOpacity disabled={step === 1 && !canNext1} style={[s.btn, { backgroundColor: primaryColor }, step === 1 && !canNext1 && { opacity: 0.4 }]} onPress={() => setStep(step + 1)}>
              <Text style={[s.btnText, { color: onPrimary }]}>Next</Text>
            </TouchableOpacity>
          ) : (
            // Always enabled on Step 3 — the tool can be built with zero prices entered. Blank prices
            // render as placeholder hints in the editor (same as the Import path).
            <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor }]} onPress={() => onComplete(buildData())}>
              <Text style={[s.btnText, { color: onPrimary }]}>Build My Tool →</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryLine({ label, value, primaryColor }: { label: string; value: string; primaryColor: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: B.gray2, fontSize: 13, fontFamily: "DMSans_400Regular", flexShrink: 1 }}>{label}</Text>
      <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold", textAlign: "right", flexShrink: 1 }}>{value}</Text>
    </View>
  );
}
