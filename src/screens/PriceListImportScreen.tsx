import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { PROXY_URL } from "../config";
import { API_URL, B } from "../constants/brand";
import { PRICE_LIST_UNDERSTAND_PROMPT } from "../constants/prompts";
import { clearImportProgress, getImportProgress, saveImportProgress } from "../storage";
import { QuoteSchema } from "../types";
import { ON_PRIMARY } from "../utils/colorUtils";
import { buildSchemaFromVerified, VerifiedAddOn, VerifiedCategory, VerifiedItem, VerifiedUnit, verifiedItemCount } from "../utils/buildSchemaFromVerified";

const UNITS: VerifiedUnit[] = ["sq ft", "lf", "hour", "each", "flat", "section", "other"];
// Carries a user-facing message for a handled Phase 1 failure (vs. network/timeout/unknown).
class ImportError extends Error {}
const numOnly = (v: string) => v.replace(/[^0-9.]/g, "");
let uid = 0;
const newId = () => `it_${Date.now()}_${uid++}`;

// Normalize the AI's free-form unit string to one of our verified units.
function normalizeUnit(u: any): VerifiedUnit {
  const k = String(u || "").toLowerCase().trim();
  if (/sq|sf|square/.test(k)) return "sq ft";
  if (/lf|linear|ln/.test(k)) return "lf";
  if (/hour|hr/.test(k)) return "hour";
  if (/flat|fixed/.test(k)) return "flat";
  if (/section|panel/.test(k)) return "section";
  if (/each|item|unit|per/.test(k)) return "each";
  return UNITS.includes(k as VerifiedUnit) ? (k as VerifiedUnit) : "each";
}

const PLACEHOLDER = `Paste your prices here...

Examples of what works:
- Pressure treated deck: $20/sq ft
- Composite: $28/sq ft
- Railing: $25/lf
- Permit: $200 flat

Or paste a full price sheet — product tables, categories, everything.`;

type Phase = "paste" | "loading" | "verify" | "editor" | "addons";

export function PriceListImportScreen({ primaryColor, backgroundColor, initialText, resume, onComplete, onBack, onEnterManually }: {
  primaryColor: string; backgroundColor?: string; initialText?: string; resume?: boolean;
  onComplete: (schema: QuoteSchema, rawText: string) => void; onBack: () => void; onEnterManually: () => void;
}) {
  const onPrimary = ON_PRIMARY;
  const [phase, setPhase] = useState<Phase>("paste");
  const [text, setText] = useState(initialText || "");
  const [error, setError] = useState("");
  const [trade, setTrade] = useState("");
  const [summary, setSummary] = useState("");
  const [categories, setCategories] = useState<VerifiedCategory[]>([]);
  const [catIndex, setCatIndex] = useState(0);
  const [addOns, setAddOns] = useState<VerifiedAddOn[]>([]);
  const [deposit, setDeposit] = useState(0);
  const [customDeposit, setCustomDeposit] = useState("");
  const [editingUnit, setEditingUnit] = useState<string | null>(null);

  // Resume an in-progress import from storage.
  useEffect(() => {
    if (!resume) return;
    getImportProgress<any>().then(p => {
      if (!p) return;
      setText(p.text || ""); setTrade(p.trade || ""); setSummary(p.summary || "");
      setCategories(p.categories || []); setCatIndex(p.catIndex || 0);
      setAddOns(p.addOns || []); setDeposit(p.deposit || 0);
      setPhase(p.phase && p.phase !== "loading" ? p.phase : "paste");
    });
  }, [resume]);

  const persist = (over: any = {}) => saveImportProgress({ phase, text, trade, summary, categories, catIndex, addOns, deposit, ...over });

  // ── Phase 1: AI READS the price list (proxy → Claude). Returns categories for the human to verify. ──
  const understand = async () => {
    if (!text.trim()) return;
    setPhase("loading"); setError("");

    // Price list rides in the user message (NOT the system prompt). max_tokens 8000 so the categories
    // JSON for a long, detailed list (50+ items) is never truncated — truncation produces incomplete
    // JSON that can't be parsed, which is the classic "couldn't read it" failure.
    const payload = { model: "claude-sonnet-4-5", max_tokens: 8000, system: PRICE_LIST_UNDERSTAND_PROMPT, messages: [{ role: "user", content: text }] };
    const payloadStr = JSON.stringify(payload);
    console.log("[Import] Phase 1 starting, text length:", text.length);
    console.log("[Import] proxy URL:", PROXY_URL);
    console.log("[Import] request payload size:", payloadStr.length);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000); // 60s ceiling so it can't hang forever
    try {
      const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: payloadStr, signal: controller.signal });
      clearTimeout(timer);
      console.log("[Import] response status:", response.status);
      console.log("[Import] response ok:", response.ok);
      const rawText = await response.text();
      console.log("[Import] raw response first 500 chars:", rawText.substring(0, 500));

      // STEP 1 — parse the outer Anthropic envelope: { model, content: [{ type:"text", text }] } (or { error }).
      let envelope: any;
      try { envelope = JSON.parse(rawText); }
      catch { console.error("[Import] envelope JSON.parse failed"); throw new ImportError("Got a response but couldn't read it — try again."); }
      if (envelope && envelope.error) { console.error("[Import] proxy/anthropic error:", JSON.stringify(envelope.error)); throw new ImportError("Got a response but couldn't read it — try again."); }
      console.log("[Import] envelope parsed ok");

      // STEP 2 — extract the inner text block. Parsing the envelope already turned the \n escapes in
      // the "text" field into real newlines (and \" into "), so no manual unescaping is needed.
      const innerText: string = envelope?.content?.[0]?.text;
      if (typeof innerText !== "string") { console.error("[Import] no inner text in envelope"); throw new ImportError("Got a response but couldn't read it — try again."); }
      console.log("[Import] inner text length:", innerText.length);
      console.log("[Import] inner text first 200:", innerText.substring(0, 200));

      // STEP 3 — strip any markdown fences and isolate the {...} object, then parse.
      let cleanedText = innerText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const open = cleanedText.indexOf("{"), close = cleanedText.lastIndexOf("}");
      if (open !== -1 && close !== -1 && close > open) cleanedText = cleanedText.substring(open, close + 1);
      console.log("[Import] cleaned text first 200:", cleanedText.substring(0, 200));
      if (!cleanedText.endsWith("}")) console.warn("[Import] cleaned text does not end with } — response may have been truncated");

      let parsed: any;
      try { parsed = JSON.parse(cleanedText); }
      catch (pe) { console.error("[Import] inner JSON.parse failed (likely truncated):", pe instanceof Error ? pe.message : String(pe)); throw new ImportError("Got a response but couldn't read it — try again."); }
      console.log("[Import] final parse result:", JSON.stringify(parsed).substring(0, 200));
      if (!parsed || !Array.isArray(parsed.categories)) throw new ImportError("Got a response but couldn't read it — try again.");

      // Map AI output → verified categories; pull any "add-ons"-style category into the add-ons list.
      const cats: VerifiedCategory[] = [];
      const extraAddOns: VerifiedAddOn[] = [];
      for (const c of parsed.categories) {
        const items: VerifiedItem[] = (c.items || []).filter((it: any) => it && it.name).map((it: any) => ({
          id: newId(), name: String(it.name), price: Number(it.price) || 0, unit: normalizeUnit(it.unit), notes: it.notes ? String(it.notes) : "",
        }));
        if (!items.length) continue;
        if (/add.?on|extra|option|upgrade/i.test(c.name || "")) {
          items.forEach(it => extraAddOns.push({ id: newId(), name: it.name, price: it.price }));
        } else {
          cats.push({ id: newId(), name: String(c.name || "Services"), items });
        }
      }
      if (cats.length === 0 && extraAddOns.length === 0) throw new ImportError("Got a response but couldn't read it — try again.");

      const t = String(parsed.trade || "");
      const dep = Number(parsed.depositPercent) || 0;
      setTrade(t); setSummary(String(parsed.summary || "")); setCategories(cats); setAddOns(extraAddOns); setDeposit(dep); setCatIndex(0);
      setPhase("verify");
      saveImportProgress({ phase: "verify", text, trade: t, summary: String(parsed.summary || ""), categories: cats, catIndex: 0, addOns: extraAddOns, deposit: dep });
    } catch (e: any) {
      clearTimeout(timer);
      let msg = "Couldn't read your price list automatically. You can enter your pricing manually instead.";
      if (e?.name === "AbortError") msg = "This is taking too long — try again.";
      else if (e instanceof ImportError) msg = e.message;
      else if (e instanceof TypeError) msg = "Connection failed — check your internet and try again.";
      console.error("[Import] Phase 1 failed:", e?.name || "Error", "-", e?.message || String(e));
      setPhase("paste");
      setError(msg);
    }
  };

  // ── Editor helpers ──
  const updateItem = (catId: string, itemId: string, patch: Partial<VerifiedItem>) =>
    setCategories(cs => cs.map(c => c.id === catId ? { ...c, items: c.items.map(it => it.id === itemId ? { ...it, ...patch } : it) } : c));
  const deleteItem = (catId: string, itemId: string) =>
    setCategories(cs => cs.map(c => c.id === catId ? { ...c, items: c.items.filter(it => it.id !== itemId) } : c));
  const addItem = (catId: string) =>
    setCategories(cs => cs.map(c => c.id === catId ? { ...c, items: [...c.items, { id: newId(), name: "", price: 0, unit: "each" as VerifiedUnit }] } : c));
  const removeCategory = (catId: string) => {
    const next = categories.filter(c => c.id !== catId);
    setCategories(next);
    setCatIndex(i => Math.max(0, Math.min(i, next.length - 1)));
    saveImportProgress({ phase: "editor", text, trade, summary, categories: next, catIndex: Math.max(0, catIndex - (catIndex >= next.length ? 1 : 0)), addOns, deposit });
  };

  const goToAddons = () => { setPhase("addons"); persist({ phase: "addons" }); };

  const build = () => {
    const depositPercent = deposit === -1 ? Number(customDeposit) || 0 : deposit;
    const schema = buildSchemaFromVerified({ trade, categories, addOns, depositPercent });
    if (!schema.fields.length) { setError("Add at least one service with a price to continue."); return; }
    clearImportProgress();
    onComplete(schema, text);
  };

  // ── LOADING ──
  if (phase === "loading") {
    return (
      <SafeAreaView style={[styles.c, backgroundColor ? { backgroundColor } : null]}>
        <View style={styles.center}>
          <PricrLogo />
          <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 36 }} />
          <Text style={{ color: primaryColor, fontSize: 16, marginTop: 24, fontFamily: "DMSans_600SemiBold" }}>Reading your price list...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const nav = (title: string, onBackPress: () => void) => (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={onBackPress} style={{ flexDirection: "row", alignItems: "center", gap: 2, width: 70 }}>
        <Feather name="chevron-left" size={18} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.navTitle}>{title}</Text>
      <View style={{ width: 70 }} />
    </View>
  );

  const kit = (msg: string) => (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={[styles.avatar, { backgroundColor: primaryColor }]}><Text style={{ color: onPrimary, fontWeight: "800", fontFamily: "Syne_800ExtraBold", fontSize: 15 }}>K</Text></View>
      <Text style={{ flex: 1, color: B.gray1, fontSize: 15, lineHeight: 22, fontFamily: "DMSans_400Regular" }}>{msg}</Text>
    </View>
  );

  // ── PASTE ──
  if (phase === "paste") {
    return (
      <SafeAreaView style={[styles.c, backgroundColor ? { backgroundColor } : null]}>
        {nav("Import Prices", onBack)}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            {kit("Paste your price list below — any format works. Tables, bullet points, spreadsheet text — I'll read it and you'll confirm everything before it's saved.")}
            <TextInput style={styles.textArea} value={text} onChangeText={setText} placeholder={PLACEHOLDER} placeholderTextColor={B.gray3} multiline />
            <Text style={{ color: B.muted, fontSize: 12, textAlign: "right", fontFamily: "DMSans_400Regular" }}>{text.length} characters</Text>
            {error ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: B.red, fontSize: 14, fontFamily: "DMSans_400Regular" }}>{error}</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: primaryColor }]} onPress={understand}><Text style={[styles.btnTxt, { color: onPrimary }]}>Try again</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.btnSec, { flex: 1, borderColor: primaryColor }]} onPress={onEnterManually}><Text style={[styles.btnSecTxt, { color: primaryColor }]}>Enter manually →</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity disabled={!text.trim()} style={[styles.btn, { backgroundColor: primaryColor }, !text.trim() && { opacity: 0.4 }]} onPress={understand}>
                <Text style={[styles.btnTxt, { color: onPrimary }]}>Build My Tool →</Text>
              </TouchableOpacity>
            )}
            <Text style={{ color: B.muted, fontSize: 12, textAlign: "center", fontFamily: "DMSans_400Regular" }}>Your pricing stays private — it&apos;s only used to build your tool</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── VERIFY ──
  if (phase === "verify") {
    const count = verifiedItemCount(categories);
    return (
      <SafeAreaView style={[styles.c, backgroundColor ? { backgroundColor } : null]}>
        {nav("Confirm", () => setPhase("paste"))}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          {kit(`I found ${count} item${count !== 1 ? "s" : ""} across ${categories.length} categor${categories.length !== 1 ? "ies" : "y"}${trade ? ` for ${trade}` : ""}.\n\n${summary || ""}\n\nDoes this look right?`)}
          <View style={{ gap: 8 }}>
            {categories.map(c => (
              <View key={c.id} style={styles.card}>
                <Text style={{ color: B.gray1, fontSize: 15, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{c.name}</Text>
                <Text style={{ color: B.muted, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{c.items.length} item{c.items.length !== 1 ? "s" : ""}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={[styles.btn, { backgroundColor: primaryColor }]} onPress={() => { setCatIndex(0); setPhase("editor"); persist({ phase: "editor", catIndex: 0 }); }}>
            <Text style={[styles.btnTxt, { color: onPrimary }]}>Yes, looks right →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSec, { borderColor: primaryColor }]} onPress={() => { setCatIndex(0); setPhase("editor"); persist({ phase: "editor", catIndex: 0 }); }}>
            <Text style={[styles.btnSecTxt, { color: primaryColor }]}>Edit before continuing</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── EDITOR (one category at a time) ──
  if (phase === "editor" && categories.length > 0) {
    const cat = categories[Math.min(catIndex, categories.length - 1)];
    const isLast = catIndex >= categories.length - 1;
    const empty = cat.items.length === 0;
    return (
      <SafeAreaView style={[styles.c, backgroundColor ? { backgroundColor } : null]}>
        {nav(`${catIndex + 1} of ${categories.length}`, () => (catIndex > 0 ? setCatIndex(catIndex - 1) : setPhase("verify")))}
        <View style={{ height: 4, backgroundColor: B.border }}>
          <View style={{ height: 4, backgroundColor: primaryColor, width: `${((catIndex + 1) / categories.length) * 100}%` }} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: B.white, fontSize: 24, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>{cat.name}</Text>
            {kit("Check these items and prices. Tap any value to edit.")}
            {cat.items.map(it => (
              <View key={it.id} style={styles.itemCard}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TextInput style={[styles.cell, { flex: 1 }]} value={it.name} onChangeText={t => updateItem(cat.id, it.id, { name: t })} placeholder="Item name" placeholderTextColor={B.gray3} />
                  <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: B.border, borderRadius: 8, paddingHorizontal: 6 }}>
                    <Text style={{ color: B.gray3, fontSize: 14 }}>$</Text>
                    <TextInput style={{ width: 60, color: B.white, fontSize: 14, paddingVertical: 10, fontFamily: "DMSans_400Regular" }} value={it.price ? String(it.price) : ""} onChangeText={t => updateItem(cat.id, it.id, { price: Number(numOnly(t)) || 0 })} placeholder="0" placeholderTextColor={B.gray3} keyboardType="numeric" />
                  </View>
                  <TouchableOpacity onPress={() => deleteItem(cat.id, it.id)} hitSlop={8}><Feather name="x" size={18} color={B.gray3} /></TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setEditingUnit(editingUnit === it.id ? null : it.id)} style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}>
                  <Text style={{ color: primaryColor, fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>per {it.unit}</Text>
                  <Feather name="chevron-down" size={13} color={primaryColor} />
                </TouchableOpacity>
                {editingUnit === it.id && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {UNITS.map(u => (
                      <TouchableOpacity key={u} onPress={() => { updateItem(cat.id, it.id, { unit: u }); setEditingUnit(null); }} style={{ borderWidth: 1, borderColor: it.unit === u ? primaryColor : B.border, backgroundColor: it.unit === u ? primaryColor : "transparent", borderRadius: 16, paddingVertical: 5, paddingHorizontal: 11 }}>
                        <Text style={{ color: it.unit === u ? onPrimary : B.gray2, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
            <TouchableOpacity onPress={() => addItem(cat.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
              <Feather name="plus" size={16} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Add item</Text>
            </TouchableOpacity>
            {empty && (
              <View style={{ gap: 8, backgroundColor: "#F59E0B22", borderColor: "#F59E0B", borderWidth: 1, borderRadius: 10, padding: 12 }}>
                <Text style={{ color: "#F59E0B", fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>This category is empty — remove it or add at least one item.</Text>
                <TouchableOpacity onPress={() => removeCategory(cat.id)}><Text style={{ color: B.red, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Remove this category</Text></TouchableOpacity>
              </View>
            )}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: B.border }}>
            {catIndex > 0 && <TouchableOpacity style={[styles.btnSec, { flex: 1, borderColor: B.border }]} onPress={() => { setCatIndex(catIndex - 1); persist({ catIndex: catIndex - 1 }); }}><Text style={styles.btnSecTxt}>← Back</Text></TouchableOpacity>}
            <TouchableOpacity disabled={empty} style={[styles.btn, { flex: 2, backgroundColor: primaryColor }, empty && { opacity: 0.4 }]} onPress={() => { if (empty) return; if (isLast) goToAddons(); else { const ni = catIndex + 1; setCatIndex(ni); persist({ catIndex: ni }); } }}>
              <Text style={[styles.btnTxt, { color: onPrimary }]}>{isLast ? "Build My Tool →" : "Next →"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── ADD-ONS + DEPOSIT ──
  return (
    <SafeAreaView style={[styles.c, backgroundColor ? { backgroundColor } : null]}>
      {nav("Add-ons & Deposit", () => { setPhase("editor"); setCatIndex(Math.max(0, categories.length - 1)); })}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          {kit("Almost done. Any add-ons or optional extras?")}
          {addOns.map(a => (
            <View key={a.id} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput style={[styles.cell, { flex: 1 }]} value={a.name} onChangeText={t => setAddOns(addOns.map(x => x.id === a.id ? { ...x, name: t } : x))} placeholder="Add-on name" placeholderTextColor={B.gray3} />
              <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: B.border, borderRadius: 8, paddingHorizontal: 6 }}>
                <Text style={{ color: B.gray3, fontSize: 14 }}>$</Text>
                <TextInput style={{ width: 60, color: B.white, fontSize: 14, paddingVertical: 10, fontFamily: "DMSans_400Regular" }} value={a.price ? String(a.price) : ""} onChangeText={t => setAddOns(addOns.map(x => x.id === a.id ? { ...x, price: Number(numOnly(t)) || 0 } : x))} placeholder="0" placeholderTextColor={B.gray3} keyboardType="numeric" />
              </View>
              <TouchableOpacity onPress={() => setAddOns(addOns.filter(x => x.id !== a.id))} hitSlop={8}><Feather name="x" size={18} color={B.gray3} /></TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={() => setAddOns([...addOns, { id: newId(), name: "", price: 0 }])} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
            <Feather name="plus" size={16} color={primaryColor} /><Text style={{ color: primaryColor, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Add another</Text>
          </TouchableOpacity>

          <Text style={{ color: B.gray1, fontSize: 15, fontWeight: "700", fontFamily: "DMSans_700Bold", marginTop: 10 }}>Deposit</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[["No deposit", 0], ["25%", 25], ["30%", 30], ["50%", 50], ["Custom", -1]].map(([label, val]) => (
              <TouchableOpacity key={String(label)} onPress={() => setDeposit(val as number)} style={{ borderWidth: 1, borderColor: deposit === val ? primaryColor : B.border, backgroundColor: deposit === val ? primaryColor : B.card, borderRadius: 22, paddingVertical: 9, paddingHorizontal: 15 }}>
                <Text style={{ color: deposit === val ? onPrimary : B.gray1, fontSize: 14, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {deposit === -1 && <TextInput style={styles.cell} value={customDeposit} onChangeText={t => setCustomDeposit(numOnly(t))} placeholder="Deposit %" placeholderTextColor={B.gray3} keyboardType="numeric" />}
          {error ? <Text style={{ color: B.red, fontSize: 14, fontFamily: "DMSans_400Regular" }}>{error}</Text> : null}
        </ScrollView>
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: B.border }}>
          <TouchableOpacity style={[styles.btn, { backgroundColor: primaryColor }]} onPress={build}><Text style={[styles.btnTxt, { color: onPrimary }]}>Build My Tool →</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = {
  c: { flex: 1, backgroundColor: B.midnight } as const,
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 } as const,
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: B.border } as const,
  navTitle: { fontSize: 17, fontWeight: "700", color: B.white, fontFamily: "Syne_700Bold" } as const,
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" } as const,
  textArea: { minHeight: 280, backgroundColor: B.card, borderRadius: 12, borderWidth: 1, borderColor: B.border, padding: 14, color: B.white, fontSize: 15, lineHeight: 22, textAlignVertical: "top", fontFamily: "DMSans_400Regular" } as const,
  card: { backgroundColor: B.card, borderRadius: 12, borderWidth: 1, borderColor: B.border, padding: 14, gap: 2 } as const,
  itemCard: { backgroundColor: B.card, borderRadius: 12, borderWidth: 1, borderColor: B.border, padding: 12, gap: 8 } as const,
  cell: { backgroundColor: B.card, borderWidth: 1, borderColor: B.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: B.white, fontSize: 14, fontFamily: "DMSans_400Regular" } as const,
  btn: { padding: 16, borderRadius: 14, alignItems: "center" } as const,
  btnTxt: { fontSize: 16, fontWeight: "700", fontFamily: "DMSans_700Bold" } as const,
  btnSec: { padding: 15, borderRadius: 14, alignItems: "center", borderWidth: 1 } as const,
  btnSecTxt: { color: B.muted, fontSize: 15, fontWeight: "600", fontFamily: "DMSans_600SemiBold" } as const,
};
