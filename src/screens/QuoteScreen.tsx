import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, LayoutAnimation, Modal, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, UIManager, View } from "react-native";
import { AnimatedDollar } from "../components/AnimatedDollar";
import { BrandHeader } from "../components/BrandHeader";
import { ClosingCard } from "../components/ClosingCard";
import { ConfettiOverlay } from "../components/ConfettiOverlay";
import { KitAgentSheet } from "../components/KitAgentSheet";
import { PressableScale } from "../components/PressableScale";
import { SkeletonCard } from "../components/SkeletonCard";
import { API_URL, B, SIGN_BASE } from "../constants/brand";
import { AGENT_PROMPT } from "../constants/prompts";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { addQuote, attachQuotePresentation, getQuoteSigningToken, getQuotes, markQuoteSent, saveBusiness, saveSignature } from "../storage";
import { s } from "../styles";
import { Business, QuotePresentation, SavedQuote, User } from "../types";
import { getBrandPalette, ON_PRIMARY } from "../utils/colorUtils";
import { formatMoney, resolvePaymentMethods } from "../utils/helpers";
import { computeTotals, fieldRate, groupFields, optionPrice, smartDefaults, typicalRange } from "../utils/quote";
import { evaluateCondition, evaluateFormula } from "../utils/formula";
import { deriveSections } from "../utils/buildSchemaFromVerified";
import { humanSchemaSummary } from "../utils/schemaExtractor";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function QuoteScreen({ schema, setSchema, business, currentUser, onBack, isDemoMode, initialValues, previewMode }: {
  schema: any; setSchema: (s: any) => void; business: Business; currentUser: User; onBack: () => void; isDemoMode?: boolean; initialValues?: Record<string, any>; previewMode?: boolean;
}) {
  const readOnly = !!previewMode; // confirmation-preview render: real QuoteScreen, non-interactive
  const [customerName, setCustomerName] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, any>>(initialValues ?? {});
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  const [showTotal, setShowTotal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedQuote[]>([]);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentMessages, setAgentMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [showOverview, setShowOverview] = useState(false);       // section overview / negotiation screen
  const [comparingField, setComparingField] = useState<string | null>(null); // selector with the comparison panel open
  const [activeSections, setActiveSections] = useState<Record<string, boolean>>({}); // single-page: which sections are ON
  const [compareSection, setCompareSection] = useState<string | null>(null);          // single-page comparison sheet
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});           // section content offsets for "Edit" jumps

  // Single-page job-walkthrough layout — only for schemas that carry section metadata (import/wizard).
  // Legacy/demo schemas (no sections) keep the classic flat field list below, unchanged.
  const quoteSections: any[] = schema?.sections || [];
  const useNewLayout = quoteSections.length > 0;

  const reduceMotion = useReduceMotion();
  const isAdmin = currentUser.role === "admin" || currentUser.role === "superadmin";
  const pal = getBrandPalette(business);          // always-readable palette derived from brand colors
  const primaryColor = pal.primary;
  const onPrimary = ON_PRIMARY; // brand look: always white text/icons on the primary color

  const sections = useMemo(() => groupFields(schema?.fields ?? []), [schema]);
  const setField = (id: string, value: any) => { if (readOnly) return; setFieldValues(p => ({ ...p, [id]: value })); };
  const toggleAddOn = (id: string) => { if (readOnly) return; setSelectedAddOns(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };

  // ── Single-page layout data helpers (defined early so the section-driven total can use them) ──
  const fieldById = (id?: string): any => (schema?.fields || []).find((f: any) => f.id === id);

  const unitLabel = (unit?: string): string => {
    switch (unit) {
      case "sqft": return "sq ft";
      case "lf": return "linear ft";
      case "hr": return "hours";
      case "each": return "units";
      case "ton": return "tons";
      case "room": return "rooms";
      case "load": return "loads";
      case "vehicle": return "vehicles";
      default: return unit || "units";
    }
  };

  // ── Bug 2: multi-select for INDEPENDENT items ──
  // A MATERIAL_MEASUREMENT section is SINGLE-select when its items are alternatives measured against
  // one shared measurement (decking by sq ft — pick ONE material). It's MULTI-select when the items
  // are independently countable (lighting fixtures, components by the "each"/unit) — the rep can
  // include several and enter a quantity for each. Measurement units stay single; countable → multi.
  const SINGLE_SELECT_UNITS = ["sqft", "lf", "hr", "ton", "room", "load", "yard"];
  const isMultiSelect = (sec: any): boolean =>
    sec?.pattern === "MATERIAL_MEASUREMENT" && !!sec.quantityFieldId && !SINGLE_SELECT_UNITS.includes(sec.unit);
  // Per-item state keys for multi-select. Kept off the schema's declared fields — the single-page total
  // is section-driven (see newLineItems), so these don't need to live in the pricing formula.
  const selKey = (sec: any, opt: string) => `${sec.materialFieldId}::sel::${opt}`;
  const qtyKey = (sec: any, opt: string) => `${sec.materialFieldId}::qty::${opt}`;

  // Dollar contribution of one section — zero until the rep makes a selection / enters a measurement.
  const sectionSubtotal = (sec: any): number => {
    const pricing = schema?.pricing || {};
    if (sec.pattern === "MATERIAL_MEASUREMENT") {
      if (isMultiSelect(sec)) {
        const sel = fieldById(sec.materialFieldId);
        return (sel?.options || []).reduce((sum: number, opt: string) => {
          if (!fieldValues[selKey(sec, opt)]) return sum;
          const r = optionPrice(opt, pricing) || 0;
          return sum + r * (Number(fieldValues[qtyKey(sec, opt)]) || 0);
        }, 0);
      }
      const chosen = fieldValues[sec.materialFieldId];
      if (!chosen) return 0;
      const rate = optionPrice(chosen, pricing);
      if (rate == null) return 0;
      if (sec.quantityFieldId) return rate * (Number(fieldValues[sec.quantityFieldId]) || 0);
      return rate; // flat pick-one tier (no quantity)
    }
    if (sec.pattern === "LABOR") {
      const rate = sec.laborRate || pricing[`${sec.quantityFieldId}Rate`] || 0;
      return rate * (Number(fieldValues[sec.quantityFieldId]) || 0);
    }
    if (sec.pattern === "FLAT_RATE") {
      return (sec.itemFieldIds || []).reduce((sum: number, id: string) => sum + (fieldValues[id] ? (pricing[`${id}Rate`] || 0) : 0), 0);
    }
    return 0;
  };

  // Line items for the single-page layout, derived from what the rep actually selected (NOT from the
  // schema formula, whose fallback would charge the first option of every unselected selector). This is
  // what makes the grand total start at $0 and stay honest, and it feeds ClosingCard + the PDF too.
  const newLineItems = useMemo(() => {
    if (!useNewLayout) return [] as { label: string; amount: number }[];
    const pricing = schema?.pricing || {};
    const items: { label: string; amount: number }[] = [];
    for (const sec of quoteSections) {
      if (sec.pattern === "FLAT_RATE") {
        for (const id of sec.itemFieldIds || []) {
          if (!fieldValues[id]) continue;
          const amt = pricing[`${id}Rate`] || 0;
          if (amt) items.push({ label: fieldById(id)?.label || id, amount: amt });
        }
        continue;
      }
      if (isMultiSelect(sec)) {
        const sel = fieldById(sec.materialFieldId);
        for (const opt of sel?.options || []) {
          if (!fieldValues[selKey(sec, opt)]) continue;
          const r = optionPrice(opt, pricing) || 0;
          const q = Number(fieldValues[qtyKey(sec, opt)]) || 0;
          const amt = r * q;
          if (amt > 0) items.push({ label: `${opt} (${q.toLocaleString()} ${unitLabel(sec.unit)})`, amount: amt });
        }
        continue;
      }
      const sub = sectionSubtotal(sec);
      if (sub <= 0) continue;
      const chosen = sec.materialFieldId ? fieldValues[sec.materialFieldId] : null;
      const qty = sec.quantityFieldId ? Number(fieldValues[sec.quantityFieldId]) || 0 : 0;
      const unit = unitLabel(sec.unit);
      let label = sec.name;
      if (chosen && sec.quantityFieldId) label = `${chosen} (${qty.toLocaleString()} ${unit})`;
      else if (chosen) label = `${sec.name}: ${chosen}`;
      else if (sec.quantityFieldId) label = `${sec.name} (${qty.toLocaleString()} ${unit})`;
      items.push({ label, amount: sub });
    }
    return items;
  }, [useNewLayout, quoteSections, fieldValues, schema]); // eslint-disable-line react-hooks/exhaustive-deps

  const newBase = newLineItems.reduce((sum, l) => sum + l.amount, 0);
  // For the single-page layout, feed computeTotals/ClosingCard a schema whose total + line items come
  // from the rep's actual selections (zero by default) instead of the formula's first-option fallback.
  const computeSchema = useNewLayout
    ? { ...schema, calculation: String(newBase), summaryLines: newLineItems.map(li => ({ label: li.label, value: String(li.amount) })) }
    : schema;

  useEffect(() => {
    if (reduceMotion) { setReady(true); return; }
    const timer = setTimeout(() => setReady(true), 450);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  // Load history → smart defaults (most-used selector per field) + sensible defaults + expansion.
  useEffect(() => {
    if (!schema?.fields) return;
    getQuotes(business.code).then(qs => {
      setHistory(qs);
      const smart = smartDefaults(schema, qs);
      const defaults: Record<string, any> = {};
      for (const f of schema.fields) {
        if (f.type === "number" || f.type === "area") defaults[f.id] = 0;
        else if (f.type === "toggle") defaults[f.id] = false;
        // Single-page layout: leave selectors unselected so the rep taps a material (the spec's flow).
        else if (f.type === "selector" && f.options?.length) defaults[f.id] = useNewLayout ? "" : (smart[f.id] ?? f.options[0]);
      }
      setFieldValues({ ...defaults, ...(initialValues ?? {}) });
      const exp: Record<string, boolean> = {};
      let maxKey = ""; let maxLen = -1;
      groupFields(schema.fields).forEach(sec => {
        exp[sec.key] = !sec.optional;
        if (sec.fields.length > maxLen) { maxLen = sec.fields.length; maxKey = sec.key; }
      });
      if (maxKey) exp[maxKey] = true;
      exp["addons"] = false;
      setExpanded(exp);
      setActiveSections({}); // single-page: every section starts OFF; the rep taps to include
    });
  }, [schema, business.code]);

  const discount = { mode: discountMode, value: Number(discountValue) || 0, reason: discountReason.trim() };
  const t = computeTotals(computeSchema, fieldValues, selectedAddOns, discount);
  const range = typicalRange(history);
  const outsideRange = !!range && t.total > 0 && (t.total > range.avg + 1.5 * range.std || t.total < Math.max(0, range.avg - 1.5 * range.std));

  // Map a field id → the section it lives in (for the overview's "Edit" jumps).
  const fieldSectionKey = (fieldId: string): string | undefined => sections.find(sec => sec.fields.some((f: any) => f.id === fieldId))?.key;

  // Live, editable line items for the negotiation overview, grouped by section with running subtotals.
  const overviewSections = useMemo(() => {
    const pricing = schema?.pricing || {};
    type Line = { label: string; amount: number };
    const bySection: Record<string, { key: string; title: string; icon: any; lines: Line[]; subtotal: number }> = {};
    const order: string[] = [];
    const ensure = (key: string) => {
      if (!bySection[key]) {
        const sec = sections.find(x => x.key === key);
        bySection[key] = { key, title: sec?.title || (key === "addons" ? "Add-ons" : "Other"), icon: sec?.icon || "plus-circle", lines: [], subtotal: 0 };
        order.push(key);
      }
      return bySection[key];
    };
    for (const line of schema?.summaryLines || []) {
      if (line.showIf && !evaluateCondition(line.showIf, t.ctx, pricing)) continue;
      const value = evaluateFormula(line.value, t.ctx, pricing);
      if (!value) continue;
      const label = line.label.replace(/\{(\w+)\}/g, (_: string, k: string) => t.ctx[k] ?? pricing[k] ?? k);
      const refField = (schema?.fields || []).find((f: any) => new RegExp(`(^|[^\\w])${f.id}([^\\w]|$)`).test(line.value));
      const key = (refField && fieldSectionKey(refField.id)) || "details";
      const g = ensure(key); g.lines.push({ label, amount: value }); g.subtotal += value;
    }
    for (const id of selectedAddOns) {
      const ao = schema?.addOns?.find((a: any) => a.id === id); if (!ao) continue;
      const g = ensure("addons"); g.lines.push({ label: ao.label, amount: ao.price || 0 }); g.subtotal += ao.price || 0;
    }
    return order.map(k => bySection[k]);
  }, [schema, t, selectedAddOns, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Edit" from the overview: jump straight to that section, expanded, and scroll it into view.
  const editSection = (key: string) => {
    setShowOverview(false);
    setExpanded(p => ({ ...p, [key]: true }));        // legacy field-group sections
    setActiveSections(p => ({ ...p, [key]: true }));  // single-page sections
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[key] || 0) - 12), animated: true }), 120);
  };

  const toggleSection = (key: string) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setExpanded(p => ({ ...p, [key]: !p[key] }));
  };

  // Throws if the write fails — callers MUST surface the error and not show a success state.
  const saveQuote = async (): Promise<string> => {
    const quote: SavedQuote = {
      id: Date.now().toString(), timestamp: Date.now(), customerName,
      trade: schema?.trade, total: t.total, deposit: t.deposit, fieldValues,
      userId: currentUser.id, repName: currentUser.name, status: "open",
      ...(discount.value > 0 ? { discount: { mode: discount.mode, value: discount.value, reason: discount.reason || undefined } } : {}),
    };
    const isFirstReal = history.filter(q => !q.isSample).length === 0;
    await addQuote(business.code, quote); // throws on backend failure — success UI below only runs if it didn't
    setHistory(h => [...h, quote]);
    setLastSavedId(quote.id);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (isFirstReal) { setShowCelebration(true); setTimeout(() => setShowCelebration(false), 2000); }
    // Flag the business as having generated a quote so the dashboard hides the onboarding card (FIX 19).
    if (isFirstReal && !business.hasGeneratedQuote) { try { await saveBusiness({ ...business, hasGeneratedQuote: true }); } catch { } }
    return quote.id;
  };

  // Reset every field for a fresh quote (FIX 17). Mirrors the initial-load defaults.
  const resetQuote = () => {
    const smart = smartDefaults(schema, history);
    const defaults: Record<string, any> = {};
    for (const f of schema?.fields ?? []) {
      if (f.type === "number" || f.type === "area") defaults[f.id] = 0;
      else if (f.type === "toggle") defaults[f.id] = false;
      else if (f.type === "selector" && f.options?.length) defaults[f.id] = useNewLayout ? "" : (smart[f.id] ?? f.options[0]);
    }
    setCustomerName("");
    setFieldValues(defaults);
    setSelectedAddOns([]);
    setActiveSections({});
    setDiscountOpen(false); setDiscountValue(""); setDiscountReason("");
    setLastSavedId(null); setSaved(false);
    setShowTotal(false);
  };

  // "New Quote" — confirm first if the current quote has unsaved work.
  const handleNewQuote = () => {
    const hasUnsaved = !lastSavedId && (!!customerName.trim() || t.total > 0);
    if (hasUnsaved) {
      Alert.alert("Start a new quote?", "This quote hasn't been saved yet. Starting fresh will clear it.", [
        { text: "Cancel", style: "cancel" },
        { text: "Start new", style: "destructive", onPress: resetQuote },
      ]);
    } else {
      resetQuote();
    }
  };

  // Save button handler: surfaces failures instead of silently showing "Saved".
  const onSavePress = async () => {
    try { await saveQuote(); }
    catch { Alert.alert("Couldn't save quote", "We couldn't save this quote. Check your connection and try again."); }
  };

  // Sharing the proposal: persist it (if not already), stash the rendered presentation so the
  // remote page / signed PDF can render it, flip status to "sent", and return the signing link.
  const prepareShare = async (presentation: QuotePresentation): Promise<{ signingLink: string | null }> => {
    let id = lastSavedId;
    if (!id) id = await saveQuote();
    if (!id) return { signingLink: null };
    await attachQuotePresentation(business.code, id, presentation);
    await markQuoteSent(business.code, id);
    const token = await getQuoteSigningToken(business.code, id);
    return { signingLink: token ? `${SIGN_BASE}/sign/${token}` : null };
  };

  // In-person signature: persist the quote (if needed) + its presentation, then record the
  // signature (status -> accepted in cloud, won locally). Works offline too.
  const handleSign = async (signatureData: string, presentation: QuotePresentation) => {
    let id = lastSavedId;
    if (!id) id = await saveQuote();
    if (!id) return;
    await attachQuotePresentation(business.code, id, presentation);
    await saveSignature(business.code, id, signatureData, customerName || undefined);
  };

  const sendAgentMessage = async (textArg?: string) => {
    const text = (typeof textArg === "string" ? textArg : agentInput).trim();
    if (!text || agentLoading) return;
    const newMessages = [...agentMessages, { role: "user" as const, content: text }];
    setAgentMessages(newMessages);
    setAgentInput("");
    setAgentLoading(true);
    try {
      // Send the conversation for context (so the layout-pill follow-up remembers what to build),
      // grounding the latest turn with the current schema.
      const apiMessages = newMessages.map((m, i) =>
        i === newMessages.length - 1
          ? { role: "user" as const, content: `Current schema:\n${JSON.stringify(schema, null, 2)}\n\nRequest: ${m.content}` }
          : m,
      );
      // Give Kit the full, human-readable quote tool as context so it answers about pricing specifically.
      const agentSystem = `${AGENT_PROMPT}\n\nYou are Kit, the AI assistant for ${business.name}${schema?.trade ? `, a ${schema.trade} business` : ""}.\n\nYOUR CURRENT QUOTE TOOL:\n${humanSchemaSummary(schema)}`;
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1500, system: agentSystem, messages: apiMessages }),
      });
      const data = await response.json();
      const reply = data.content[0].text.trim();
      if (reply.includes("CONFIG_UPDATED")) {
        const jsonStart = reply.indexOf("\n{");
        if (jsonStart !== -1) {
          try {
            const updated = JSON.parse(reply.substring(jsonStart).trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
            // Keep the single-page layout alive across Kit edits: re-derive section metadata when the
            // schema was using it (the agent returns plain fields/pricing without it).
            if (useNewLayout && updated && Array.isArray(updated.fields)) {
              try { updated.sections = deriveSections(updated.fields, updated.pricing || {}); } catch { }
            }
            setSchema(updated);
            await saveBusiness({ ...business, schema: updated, kitUpdates: (business.kitUpdates || 0) + 1 });
            const msg = reply.substring(0, jsonStart).replace("CONFIG_UPDATED", "").trim();
            setAgentMessages([...newMessages, { role: "assistant", content: msg || "Done. Your tool is updated." }]);
          } catch {
            setAgentMessages([...newMessages, { role: "assistant", content: "Made the change. If something looks off just tell me." }]);
          }
        }
      } else {
        setAgentMessages([...newMessages, { role: "assistant", content: reply }]);
      }
    } catch {
      setAgentMessages([...newMessages, { role: "assistant", content: "Something went wrong. Give it another shot." }]);
    }
    setAgentLoading(false);
  };

  // ── Field renderers ──
  const renderNumber = (field: any) => {
    const value = fieldValues[field.id];
    const hint = fieldRate(field, schema?.pricing || {});
    return (
      <View key={field.id} style={{ gap: 6 }}>
        <Text style={[s.fieldLabel, { color: pal.textMuted }]}>{field.label.toUpperCase()}</Text>
        <TextInput editable={!readOnly} style={[s.input, { backgroundColor: pal.surface, color: pal.text, borderColor: pal.border }]} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} placeholderTextColor={pal.textMuted} value={value ? value.toString() : ""} onChangeText={v => setField(field.id, v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" />
        {hint ? <Text style={[s.qHint, { color: pal.textMuted }]}>{hint}</Text> : null}
      </View>
    );
  };

  const renderSelector = (field: any) => {
    const value = fieldValues[field.id];
    const pricing = schema?.pricing || {};
    // Find the measurement this material applies to (a number field sharing the selector's unit), so
    // we can show every option's cost for THIS job without re-entering anything.
    const measureField = (schema?.fields || []).find((f: any) => (f.type === "number" || f.type === "area") && f.unit === field.unit && Number(fieldValues[f.id]) > 0);
    const measure = measureField ? Number(fieldValues[measureField.id]) || 0 : 0;
    const hasPrices = (field.options || []).some((o: string) => optionPrice(o, pricing) != null);
    const comparing = comparingField === field.id;
    return (
      <View key={field.id} style={{ gap: 8 }}>
        <Text style={[s.fieldLabel, { color: pal.textMuted }]}>{field.label.toUpperCase()}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {field.options?.map((opt: string) => {
            const selected = value === opt;
            const price = optionPrice(opt, pricing);
            return (
              // Quick swap: tapping a different option swaps the material instantly; the measurement
              // stays and the grand total recalculates immediately.
              <PressableScale key={opt} onPress={() => setField(field.id, opt)} style={[s.qOptionCard, { borderColor: selected ? primaryColor : pal.border, backgroundColor: selected ? primaryColor : pal.surface }]}>
                <Text style={[s.qOptionName, { color: selected ? onPrimary : pal.text }]}>{opt}</Text>
                {price != null ? <Text style={[s.qOptionPrice, { color: selected ? onPrimary : primaryColor }]}>${price.toLocaleString()}</Text> : null}
              </PressableScale>
            );
          })}
        </View>
        {!readOnly && value && hasPrices && (
          <TouchableOpacity onPress={() => setComparingField(comparing ? null : field.id)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Feather name={comparing ? "chevron-up" : "bar-chart-2"} size={14} color={primaryColor} />
            <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{comparing ? "Hide options" : "See all options for this measurement"}</Text>
          </TouchableOpacity>
        )}
        {!readOnly && comparing && (
          <View style={{ backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }}>
            {measure > 0 && measureField ? (
              <Text style={[s.qHint, { color: pal.textMuted }]}>{measureField.label} {measure} {field.unit} · tap a row to switch</Text>
            ) : (
              <Text style={[s.qHint, { color: pal.textMuted }]}>Enter a {field.label.toLowerCase()} measurement to compare totals</Text>
            )}
            {(field.options || []).map((opt: string) => {
              const rate = optionPrice(opt, pricing);
              const lineTotal = rate == null ? null : (measure > 0 ? rate * measure : rate);
              const selected = value === opt;
              return (
                <TouchableOpacity key={opt} onPress={() => setField(field.id, opt)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
                  <Text style={{ color: selected ? primaryColor : pal.text, fontSize: 14, fontWeight: selected ? "800" : "400", fontFamily: selected ? "DMSans_700Bold" : "DMSans_400Regular" }}>{opt}{selected ? "  ← current" : ""}</Text>
                  <Text style={{ color: selected ? primaryColor : pal.text, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{lineTotal == null ? "—" : formatMoney(lineTotal)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderToggle = (field: any) => {
    const on = !!fieldValues[field.id];
    const hint = fieldRate(field, schema?.pricing || {});
    const Pill = ({ label, active }: { label: string; active: boolean }) => (
      <PressableScale onPress={() => setField(field.id, label === "Include")} style={[s.qPill, { borderColor: active ? primaryColor : pal.border, backgroundColor: active ? primaryColor : pal.surface }]}>
        <Text style={[s.qPillText, { color: active ? onPrimary : pal.textMuted }]}>{label}</Text>
      </PressableScale>
    );
    return (
      <View key={field.id} style={{ gap: 8 }}>
        <Text style={[s.fieldLabel, { color: pal.textMuted }]}>{field.label.toUpperCase()}</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pill label="Include" active={on} />
          <Pill label="Don't Include" active={!on} />
        </View>
        {hint ? <Text style={[s.qHint, { color: pal.textMuted }]}>{hint}</Text> : null}
      </View>
    );
  };

  const renderField = (field: any) => {
    const isAlsoAddOn = schema?.addOns?.some((a: any) => a.label.toLowerCase() === field.label.toLowerCase() || a.id.toLowerCase() === field.id.toLowerCase());
    if (field.type === "toggle" && isAlsoAddOn) return null;
    if (field.type === "number" || field.type === "area") return renderNumber(field);
    if (field.type === "selector") return renderSelector(field);
    if (field.type === "toggle") return renderToggle(field);
    return null;
  };

  const renderSectionHeader = (key: string, title: string, icon: any, optional: boolean) => {
    const open = !!expanded[key];
    if (optional && !open) {
      return (
        <PressableScale onPress={() => toggleSection(key)} style={s.qAddPill}>
          <Feather name="plus" size={16} color={primaryColor} />
          <Text style={{ fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold", color: primaryColor }}>Add {title}</Text>
        </PressableScale>
      );
    }
    return (
      <Pressable onPress={() => toggleSection(key)} style={s.qSectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Feather name={icon} size={18} color={primaryColor} />
          <Text style={[s.qSectionTitle, { color: pal.text }]}>{title}</Text>
        </View>
        {optional ? <Feather name={open ? "chevron-up" : "chevron-down"} size={20} color={pal.textMuted} /> : null}
      </Pressable>
    );
  };

  // ── Single-page job-walkthrough helpers (new layout only); fieldById/unitLabel/sectionSubtotal live above ──

  // Auto-pick a Feather icon from a section name so the checklist reads at a glance.
  const iconFor = (name: string): any => {
    const n = (name || "").toLowerCase();
    if (/light|elect|fixture|lamp/.test(n)) return "sun";
    if (/rail|fence|linear|trim|edge|gutter/.test(n)) return "git-commit";
    if (/roof|home|house|room|wall|shingle/.test(n)) return "home";
    if (/labor|hour|install|service|crew/.test(n)) return "tool";
    if (/haul|truck|delivery|move|dispos/.test(n)) return "truck";
    if (/fee|option|misc|permit|warranty/.test(n)) return "clipboard";
    if (/deck|board|floor|surface|sq|area|material|paint|concrete/.test(n)) return "layers";
    return "box";
  };

  // ── Bug 1 fix: dedupe sections into one card per logical group ──
  // deriveSections() emits one section per priced selector, so a category split across units
  // ("Deck Components (per lf)" + "(per sq ft)") becomes several cards with the same base name.
  // Group by the base name (parenthetical suffix stripped, case/space-insensitive) so each base
  // name is ONE card holding all its members. Industry-agnostic — no trade-specific keywords.
  const stripParen = (n: string) => String(n || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  const normName = (n: string) => stripParen(n).toLowerCase().replace(/\s+/g, " ").trim();
  // Sub-label shown for each member when a group holds more than one (e.g. the "(per lf)" qualifier).
  const memberSubLabel = (sec: any): string => {
    const m = String(sec.name || "").match(/\(([^)]+)\)\s*$/);
    return (m ? m[1] : unitLabel(sec.unit)).replace(/^\w/, c => c.toUpperCase());
  };

  const displaySections = useMemo(() => {
    if (!useNewLayout) return [] as { id: string; name: string; members: any[] }[];
    const byKey: Record<string, { id: string; name: string; members: any[] }> = {};
    const order: string[] = [];
    for (const sec of quoteSections) {
      const key = normName(sec.name) || sec.id;
      if (!byKey[key]) { byKey[key] = { id: key, name: stripParen(sec.name) || sec.name, members: [] }; order.push(key); }
      byKey[key].members.push(sec);
    }
    let groups = order.map(k => byKey[k]);
    // Cap at 8 cards — fold the smallest groups into a single "Other" so the checklist stays scannable.
    if (groups.length > 8) {
      const keep = [...groups].sort((a, b) => b.members.length - a.members.length).slice(0, 7);
      const other = { id: "_other", name: "Other", members: groups.filter(g => !keep.includes(g)).flatMap(g => g.members) };
      groups = groups.filter(g => keep.includes(g));
      groups.push(other);
    }
    return groups;
  }, [useNewLayout, quoteSections]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupSubtotal = (group: any): number => (group.members || []).reduce((sum: number, sec: any) => sum + sectionSubtotal(sec), 0);

  // Clear every field a group's member sections own (used when the rep turns the group OFF).
  const clearGroupFields = (group: any) => {
    setFieldValues(prev => {
      const next = { ...prev };
      for (const sec of group.members || []) {
        if (sec.materialFieldId) next[sec.materialFieldId] = "";
        if (sec.quantityFieldId) next[sec.quantityFieldId] = 0;
        (sec.itemFieldIds || []).forEach((id: string) => { next[id] = false; });
        // Multi-select per-item selection + quantity keys.
        if (isMultiSelect(sec)) {
          for (const opt of fieldById(sec.materialFieldId)?.options || []) { delete next[selKey(sec, opt)]; next[qtyKey(sec, opt)] = 0; }
        }
      }
      return next;
    });
  };

  // Tap a section card: ON → expand inline + scroll into view; OFF → collapse + clear its values.
  const toggleGroup = (group: any) => {
    if (readOnly) return;
    const willActivate = !activeSections[group.id];
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setActiveSections(p => ({ ...p, [group.id]: willActivate }));
    if (willActivate) {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[group.id] || 0) - 12), animated: true }), 150);
    } else {
      clearGroupFields(group);
    }
  };

  // A large measurement input — big number, unit on the right, numeric keyboard, clear (×). Keyed by
  // an arbitrary fieldValues id so multi-select items can each have their own quantity.
  const renderMeasurementInput = (id: string, unit?: string) => {
    const value = fieldValues[id];
    const filled = !!value && Number(value) > 0;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: pal.surface, borderColor: filled ? primaryColor : pal.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16 }}>
        <TextInput editable={!readOnly} style={{ flex: 1, color: pal.text, fontSize: 24, fontWeight: "800", fontFamily: "Syne_700Bold", paddingVertical: 14 }} placeholder="0" placeholderTextColor={pal.textMuted} value={value ? value.toString() : ""} onChangeText={v => setField(id, v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" />
        <Text style={{ color: pal.textMuted, fontSize: 15, fontWeight: "700", fontFamily: "DMSans_700Bold", marginLeft: 8 }}>{unitLabel(unit)}</Text>
        {filled && !readOnly && (
          <TouchableOpacity onPress={() => setField(id, 0)} style={{ marginLeft: 10, padding: 4 }}>
            <Feather name="x" size={18} color={pal.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  };
  const renderMeasurement = (field: any, unit?: string) => renderMeasurementInput(field.id, unit);

  // Toggle one independent item in a multi-select section; clears its quantity when removed.
  const toggleMultiItem = (sec: any, opt: string) => {
    if (readOnly) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const on = !!fieldValues[selKey(sec, opt)];
    setFieldValues(prev => {
      const next = { ...prev };
      if (on) { delete next[selKey(sec, opt)]; next[qtyKey(sec, opt)] = 0; }
      else { next[selKey(sec, opt)] = true; }
      return next;
    });
  };

  // The running "qty × rate = $total" subtotal that fades in below a section's inputs.
  const subtotalRow = (label: string | null, amount: number) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: pal.textMuted, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{label || ""}</Text>
      <Text style={{ color: primaryColor, fontSize: 22, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>{formatMoney(amount)}</Text>
    </View>
  );

  // MATERIAL_MEASUREMENT: horizontal material pills → measurement input → live subtotal → compare.
  const renderMaterialSection = (sec: any) => {
    const sel = fieldById(sec.materialFieldId);
    const pricing = schema?.pricing || {};

    // Multi-select: independent items (e.g. lighting fixtures). Tap to add/remove; each selected item
    // gets its own quantity input + running subtotal; the section total sums them.
    if (isMultiSelect(sec)) {
      const selectedOpts = (sel?.options || []).filter((opt: string) => fieldValues[selKey(sec, opt)]);
      const total = sectionSubtotal(sec);
      const unitOne = unitLabel(sec.unit).replace(/s$/, "");
      return (
        <View style={{ gap: 14 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }} keyboardShouldPersistTaps="handled">
            {(sel?.options || []).map((opt: string) => {
              const selected = !!fieldValues[selKey(sec, opt)];
              const price = optionPrice(opt, pricing);
              return (
                <PressableScale key={opt} onPress={() => toggleMultiItem(sec, opt)} style={{ minWidth: 100, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, backgroundColor: selected ? primaryColor : pal.surface, borderColor: selected ? primaryColor : pal.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {selected && <Feather name="check" size={14} color={onPrimary} />}
                    <Text style={{ color: selected ? onPrimary : pal.text, fontSize: 15, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{opt}</Text>
                  </View>
                  {price != null && <Text style={{ color: selected ? onPrimary : pal.secondary, fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold", marginTop: 3 }}>${price.toLocaleString()}/{unitOne}</Text>}
                </PressableScale>
              );
            })}
          </ScrollView>
          {selectedOpts.map((opt: string) => {
            const price = optionPrice(opt, pricing) || 0;
            const q = Number(fieldValues[qtyKey(sec, opt)]) || 0;
            const lineTotal = price * q;
            return (
              <View key={opt} style={{ gap: 8, borderLeftWidth: 2, borderLeftColor: primaryColor, paddingLeft: 12 }}>
                <Text style={{ color: pal.text, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{opt} <Text style={{ color: pal.secondary }}>· ${price.toLocaleString()}/{unitOne}</Text></Text>
                {renderMeasurementInput(qtyKey(sec, opt), sec.unit)}
                {lineTotal > 0 && subtotalRow(`${q.toLocaleString()} ${unitLabel(sec.unit)} × $${price.toLocaleString()}`, lineTotal)}
              </View>
            );
          })}
          {selectedOpts.length === 0 && !readOnly && <Text style={[s.qHint, { color: pal.textMuted }]}>Tap each item this job includes — you can pick more than one.</Text>}
          {total > 0 && selectedOpts.length > 1 && (
            <View style={{ borderTopWidth: 1, borderTopColor: pal.border, paddingTop: 10 }}>{subtotalRow("Section total", total)}</View>
          )}
        </View>
      );
    }

    const chosen = fieldValues[sec.materialFieldId];
    const qtyField = sec.quantityFieldId ? fieldById(sec.quantityFieldId) : null;
    const rate = chosen ? optionPrice(chosen, pricing) : null;
    const qty = sec.quantityFieldId ? Number(fieldValues[sec.quantityFieldId]) || 0 : 0;
    const subtotal = sectionSubtotal(sec);
    return (
      <View style={{ gap: 14 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }} keyboardShouldPersistTaps="handled">
          {(sel?.options || []).map((opt: string) => {
            const selected = chosen === opt;
            const price = optionPrice(opt, pricing);
            return (
              <PressableScale key={opt} onPress={() => !readOnly && setField(sec.materialFieldId, opt)} style={{ minWidth: 100, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, backgroundColor: selected ? primaryColor : pal.surface, borderColor: selected ? primaryColor : pal.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {selected && <Feather name="check" size={14} color={onPrimary} />}
                  <Text style={{ color: selected ? onPrimary : pal.text, fontSize: 15, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{opt}</Text>
                </View>
                {price != null && <Text style={{ color: selected ? onPrimary : pal.secondary, fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold", marginTop: 3 }}>{sec.quantityFieldId ? `$${price.toLocaleString()}/${unitLabel(sec.unit).replace(/s$/, "")}` : `$${price.toLocaleString()}`}</Text>}
              </PressableScale>
            );
          })}
        </ScrollView>
        {chosen && qtyField && renderMeasurement(qtyField, sec.unit)}
        {subtotal > 0 && subtotalRow(sec.quantityFieldId && rate != null ? `${qty.toLocaleString()} ${unitLabel(sec.unit)} × $${rate.toLocaleString()}` : null, subtotal)}
        {chosen && sec.quantityFieldId && (sel?.options?.length || 0) > 1 && !readOnly && (
          <TouchableOpacity onPress={() => setCompareSection(sec.id)} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Feather name="bar-chart-2" size={15} color={primaryColor} />
            <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Compare options</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // LABOR: "$rate / unit" + an hours/quantity input + live subtotal.
  const renderLaborSection = (sec: any) => {
    const field = fieldById(sec.quantityFieldId);
    const pricing = schema?.pricing || {};
    const rate = sec.laborRate || pricing[`${sec.quantityFieldId}Rate`] || 0;
    const qty = Number(fieldValues[sec.quantityFieldId]) || 0;
    const subtotal = sectionSubtotal(sec);
    return (
      <View style={{ gap: 14 }}>
        {rate > 0 && <Text style={{ color: pal.secondary, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>${rate.toLocaleString()} / {unitLabel(sec.unit).replace(/s$/, "")}</Text>}
        {field && renderMeasurement(field, sec.unit)}
        {subtotal > 0 && subtotalRow(`${qty.toLocaleString()} ${unitLabel(sec.unit)} × $${rate.toLocaleString()}`, subtotal)}
      </View>
    );
  };

  // FLAT_RATE: tap-to-include cards for fixed-price items.
  const renderFlatSection = (sec: any) => {
    const pricing = schema?.pricing || {};
    return (
      <View style={{ gap: 10 }}>
        {(sec.itemFieldIds || []).map((id: string) => {
          const f = fieldById(id);
          if (!f) return null;
          const on = !!fieldValues[id];
          const price = pricing[`${id}Rate`] || 0;
          return (
            <PressableScale key={id} onPress={() => !readOnly && setField(id, !on)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: on ? primaryColor : pal.surface, borderColor: on ? primaryColor : pal.border, borderWidth: 1, borderRadius: 14, padding: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <Feather name={on ? "check-circle" : "circle"} size={20} color={on ? onPrimary : pal.textMuted} />
                <Text style={{ color: on ? onPrimary : pal.text, fontSize: 15, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{f.label}</Text>
              </View>
              {price > 0 && <Text style={{ color: on ? onPrimary : primaryColor, fontSize: 15, fontWeight: "800", fontFamily: "Syne_700Bold" }}>${price.toLocaleString()}</Text>}
            </PressableScale>
          );
        })}
      </View>
    );
  };

  const renderSectionContent = (sec: any) => {
    if (sec.pattern === "MATERIAL_MEASUREMENT") return renderMaterialSection(sec);
    if (sec.pattern === "LABOR") return renderLaborSection(sec);
    if (sec.pattern === "FLAT_RATE") return renderFlatSection(sec);
    return null;
  };

  // The single-page body: a 2-column section checklist (one card per group), then every active
  // group expanded inline with each of its member sections stacked.
  const renderNewBody = () => {
    const activeGroups = displaySections.filter((g) => activeSections[g.id] || readOnly);
    return (
      <>
        {!readOnly && (
          <View style={{ gap: 10 }}>
            <Text style={[s.fieldLabel, { color: pal.textMuted }]}>WHAT&apos;S IN THIS JOB?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {displaySections.map((g) => {
                const on = !!activeSections[g.id];
                const sub = groupSubtotal(g);
                return (
                  <PressableScale key={g.id} onPress={() => toggleGroup(g)} style={{ width: "47.5%", flexGrow: 1, minWidth: 140, backgroundColor: on ? primaryColor : pal.surface, borderColor: on ? primaryColor : pal.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Feather name={iconFor(g.name)} size={20} color={on ? onPrimary : primaryColor} />
                      <Feather name={on ? "check-circle" : "plus-circle"} size={18} color={on ? onPrimary : pal.textMuted} />
                    </View>
                    <Text numberOfLines={2} style={{ color: on ? onPrimary : pal.text, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{g.name}</Text>
                    {on && sub > 0 && <Text style={{ color: onPrimary, fontSize: 14, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{formatMoney(sub)}</Text>}
                  </PressableScale>
                );
              })}
            </View>
          </View>
        )}

        {activeGroups.map((g) => (
          <View key={g.id} style={{ gap: 16, backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 18, padding: 16 }} onLayout={e => { sectionY.current[g.id] = e.nativeEvent.layout.y; }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name={iconFor(g.name)} size={18} color={primaryColor} />
                <Text style={[s.qSectionTitle, { color: pal.text }]}>{g.name}</Text>
              </View>
              {!readOnly && (
                <TouchableOpacity onPress={() => toggleGroup(g)} hitSlop={8}>
                  <Feather name="x" size={20} color={pal.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            {g.members.map((sec: any) => (
              <View key={sec.id} style={{ gap: 10 }}>
                {g.members.length > 1 && <Text style={[s.fieldLabel, { color: pal.textMuted }]}>{memberSubLabel(sec)}</Text>}
                {renderSectionContent(sec)}
              </View>
            ))}
          </View>
        ))}
      </>
    );
  };

  // Group subtotals for the negotiation overview when the single-page layout is active.
  const newOverviewSections = useMemo(() => {
    if (!useNewLayout) return [];
    const pricing = schema?.pricing || {};
    const groups = displaySections
      .filter((g) => activeSections[g.id] && groupSubtotal(g) > 0)
      .map((g) => {
        const lines: { label: string; amount: number }[] = [];
        for (const sec of g.members) {
          if (sec.pattern === "FLAT_RATE") {
            (sec.itemFieldIds || []).filter((id: string) => fieldValues[id]).forEach((id: string) => lines.push({ label: fieldById(id)?.label || id, amount: pricing[`${id}Rate`] || 0 }));
          } else if (isMultiSelect(sec)) {
            for (const opt of fieldById(sec.materialFieldId)?.options || []) {
              if (!fieldValues[selKey(sec, opt)]) continue;
              const r = optionPrice(opt, pricing) || 0;
              const q = Number(fieldValues[qtyKey(sec, opt)]) || 0;
              if (r * q > 0) lines.push({ label: `${opt} (${q.toLocaleString()} ${unitLabel(sec.unit)})`, amount: r * q });
            }
          } else {
            const sub = sectionSubtotal(sec);
            if (sub <= 0) continue;
            const chosen = sec.materialFieldId ? fieldValues[sec.materialFieldId] : null;
            const prefix = g.members.length > 1 ? `${memberSubLabel(sec)}: ` : "";
            lines.push({ label: `${prefix}${chosen ? String(chosen) : sec.name}`, amount: sub });
          }
        }
        return { key: g.id, title: g.name, icon: iconFor(g.name), lines, subtotal: groupSubtotal(g) };
      });
    if (selectedAddOns.length) {
      const lines = selectedAddOns.map(id => { const ao = schema?.addOns?.find((a: any) => a.id === id); return { label: ao?.label || id, amount: ao?.price || 0 }; });
      groups.push({ key: "addons", title: "Add-ons", icon: "plus-circle", lines, subtotal: lines.reduce((sum, l) => sum + l.amount, 0) });
    }
    return groups;
  }, [useNewLayout, displaySections, activeSections, fieldValues, selectedAddOns, schema]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayOverviewSections = useNewLayout ? newOverviewSections : overviewSections;
  const compareSec = quoteSections.find((sec: any) => sec.id === compareSection);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: pal.background }]}>
      <BrandHeader business={business} right={
        readOnly ? (
          <View style={{ backgroundColor: primaryColor, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
            <Text style={{ color: onPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1, fontFamily: "DMSans_700Bold" }}>PREVIEW</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[s.roleBadge, isAdmin && { borderColor: primaryColor + "60", backgroundColor: primaryColor + "15" }]}>
              <Text style={s.roleBadgeText}>{isAdmin ? "Admin" : "Rep"}</Text>
            </View>
            <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Feather name="chevron-left" size={18} color={primaryColor} />
              <Text style={[s.navBackText, { color: primaryColor }]}>Back</Text>
            </TouchableOpacity>
          </View>
        )
      } />

      {isDemoMode && !readOnly && (
        <View style={{ alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: primaryColor }} />
            <Text style={{ color: pal.textMuted, fontSize: 11, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Demo Mode</Text>
          </View>
        </View>
      )}

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: readOnly ? 40 : 200 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Text style={[s.fieldLabel, { color: pal.textMuted }]}>CLIENT NAME</Text>
          <TextInput editable={!readOnly} style={[s.input, { backgroundColor: pal.surface, color: pal.text, borderColor: pal.border }]} placeholder="Who is this quote for?" placeholderTextColor={pal.textMuted} value={customerName} onChangeText={setCustomerName} />
          {!customerName.trim() && !readOnly && <Text style={[s.qHint, { color: pal.textMuted }]}>Optional, but adding a name personalizes the quote and PDF.</Text>}
        </View>

        {!ready ? (
          <View style={{ gap: 14 }}>
            <SkeletonCard height={20} /><SkeletonCard /><SkeletonCard height={90} /><SkeletonCard height={48} />
          </View>
        ) : (
          <>
            {useNewLayout ? renderNewBody() : sections.map(sec => {
              // #2: a section gated by an "Include X" toggle collapses its other fields when that toggle is off.
              const controller = sec.fields.find((f: any) => f.type === "toggle" && /\b(include|includes|add|with|has)\b/i.test(`${f.id} ${f.label}`));
              const fieldsToRender = controller && !fieldValues[controller.id] ? [controller] : sec.fields;
              return (
                <View key={sec.key} style={{ gap: 14 }} onLayout={e => { sectionY.current[sec.key] = e.nativeEvent.layout.y; }}>
                  {renderSectionHeader(sec.key, sec.title, sec.icon, sec.optional)}
                  {expanded[sec.key] && <View style={{ gap: 18 }}>{fieldsToRender.map(renderField)}</View>}
                </View>
              );
            })}

            {schema?.addOns?.length > 0 && (
              <View style={{ gap: 14 }} onLayout={e => { sectionY.current["addons"] = e.nativeEvent.layout.y; }}>
                {renderSectionHeader("addons", "Add-ons", "plus-circle", true)}
                {expanded["addons"] && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {schema.addOns.map((a: any) => {
                      const selected = selectedAddOns.includes(a.id);
                      return (
                        <PressableScale key={a.id} onPress={() => toggleAddOn(a.id)} style={[s.qOptionCard, { borderColor: selected ? primaryColor : pal.border, backgroundColor: selected ? primaryColor : pal.surface }]}>
                          <Text style={[s.qOptionName, { color: selected ? onPrimary : pal.text }]}>{a.label}</Text>
                          {a.price ? <Text style={[s.qOptionPrice, { color: selected ? onPrimary : primaryColor }]}>${a.price.toLocaleString()}</Text> : null}
                        </PressableScale>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Discount — optional, collapsed by default; available on every quote regardless of trade. */}
            {!readOnly && <View style={{ gap: 14 }}>
              {!discountOpen && t.discountAmount <= 0 ? (
                <PressableScale onPress={() => setDiscountOpen(true)} style={s.qAddPill}>
                  <Feather name="plus" size={16} color={primaryColor} />
                  <Text style={{ fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold", color: primaryColor }}>Add Discount</Text>
                </PressableScale>
              ) : (
                <>
                  <Pressable onPress={() => setDiscountOpen(o => !o)} style={s.qSectionHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Feather name="tag" size={18} color={primaryColor} />
                      <Text style={[s.qSectionTitle, { color: pal.text }]}>Discount</Text>
                    </View>
                    <Feather name={discountOpen ? "chevron-up" : "chevron-down"} size={20} color={pal.textMuted} />
                  </Pressable>
                  {discountOpen && (
                    <View style={{ gap: 12 }}>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {(["amount", "percent"] as const).map(m => {
                          const active = discountMode === m;
                          return (
                            <PressableScale key={m} onPress={() => setDiscountMode(m)} style={[s.qPill, { borderColor: active ? primaryColor : pal.border, backgroundColor: active ? primaryColor : pal.surface }]}>
                              <Text style={[s.qPillText, { color: active ? onPrimary : pal.textMuted }]}>{m === "amount" ? "$ Amount" : "% Off"}</Text>
                            </PressableScale>
                          );
                        })}
                      </View>
                      <TextInput style={[s.input, { backgroundColor: pal.surface, color: pal.text, borderColor: pal.border }]} placeholder={discountMode === "amount" ? "Discount amount" : "Percent off (e.g. 10)"} placeholderTextColor={pal.textMuted} value={discountValue} onChangeText={v => setDiscountValue(v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" />
                      <TextInput style={[s.input, { backgroundColor: pal.surface, color: pal.text, borderColor: pal.border }]} placeholder="Discount reason (optional)" placeholderTextColor={pal.textMuted} value={discountReason} onChangeText={setDiscountReason} />
                      {t.discountAmount > 0 && <Text style={[s.qHint, { color: pal.textMuted }]}>Applied: -{formatMoney(t.discountAmount)}</Text>}
                    </View>
                  )}
                </>
              )}
            </View>}
          </>
        )}
      </ScrollView>

      {/* Sticky live total bar (+ minimum warning, + typical range) — hidden in read-only preview */}
      {!readOnly && (
      <View style={[s.qStickyWrap, { backgroundColor: pal.background, borderTopColor: pal.border, borderTopWidth: 1 }]}>
        {t.belowMin && (
          <View style={s.qMinWarn}>
            <Feather name="alert-triangle" size={14} color={B.midnight} />
            <Text style={s.qMinWarnText}>Below your minimum of {formatMoney(t.minimum)} — showing minimum charge.</Text>
          </View>
        )}
        {range && (
          <Text style={[s.qRange, { color: outsideRange ? "#F59E0B" : pal.textMuted }]}>Typical range: {formatMoney(range.low)} – {formatMoney(range.high)}</Text>
        )}
        <View style={s.qStickyRow}>
          <View>
            <Text style={[s.qStickyLabel, { color: pal.textMuted }]}>GRAND TOTAL</Text>
            <AnimatedDollar value={t.total} style={[s.qStickyTotal, { color: primaryColor }]} />
          </View>
          {t.total > 0 ? (
            <PressableScale onPress={() => setShowOverview(true)} style={[s.qReviewBtn, { backgroundColor: primaryColor }]}>
              <Text style={[s.qReviewText, { color: onPrimary }]}>Review</Text>
              <Feather name="chevron-up" size={18} color={onPrimary} />
            </PressableScale>
          ) : (
            <View style={[s.qReviewBtn, { backgroundColor: primaryColor, opacity: 0.4 }]}>
              <Text style={[s.qReviewText, { color: onPrimary }]}>Add items to quote</Text>
            </View>
          )}
        </View>
      </View>
      )}

      {showTotal && !readOnly && (
        <ClosingCard schema={computeSchema} business={business} primaryColor={primaryColor} customerName={customerName} totals={t} selectedAddOns={selectedAddOns} discount={{ amount: t.discountAmount, reason: discountReason.trim() }} paymentMethods={resolvePaymentMethods(business.paymentMethods)} saved={saved} onSave={onSavePress} prepareShare={prepareShare} onSign={handleSign} termsAndConditions={business.termsAndConditions} onClose={() => setShowTotal(false)} onNewQuote={handleNewQuote} />
      )}

      {/* ── Section overview / negotiation screen — review subtotals, edit any section, see the live total ── */}
      <Modal visible={showOverview && !readOnly} transparent animationType="slide" onRequestClose={() => setShowOverview(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowOverview(false)} />
          <View style={{ maxHeight: "90%", backgroundColor: pal.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: pal.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingBottom: 10 }}>
              <View>
                <Text style={[s.h2, { color: pal.text, fontSize: 20 }]}>Review the quote</Text>
                <Text style={[s.qHint, { color: pal.textMuted }]}>Tap any section to adjust — the total updates live.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowOverview(false)}><Feather name="chevron-down" size={26} color={pal.textMuted} /></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 12 }}>
              {displayOverviewSections.length === 0 && <Text style={[s.body, { color: pal.textMuted }]}>Add some pricing to review.</Text>}
              {displayOverviewSections.map(g => (
                <View key={g.key} style={{ backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <Feather name={g.icon} size={16} color={primaryColor} />
                      <Text style={{ color: pal.text, fontSize: 15, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{g.title}</Text>
                    </View>
                    <TouchableOpacity onPress={() => editSection(g.key)} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <Feather name="edit-2" size={13} color={primaryColor} />
                      <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  {g.lines.map((ln, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                      <Text style={{ color: pal.textMuted, fontSize: 13, fontFamily: "DMSans_400Regular", flexShrink: 1 }}>{ln.label}</Text>
                      <Text style={{ color: pal.text, fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{formatMoney(ln.amount)}</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: pal.border, paddingTop: 6 }}>
                    <Text style={{ color: pal.textMuted, fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>SUBTOTAL</Text>
                    <Text style={{ color: primaryColor, fontSize: 14, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{formatMoney(g.subtotal)}</Text>
                  </View>
                </View>
              ))}

              {/* Discount — always accessible on the negotiation screen */}
              {!discountOpen && t.discountAmount <= 0 ? (
                <TouchableOpacity onPress={() => setDiscountOpen(true)} style={[s.qAddPill, { backgroundColor: pal.surface, borderColor: pal.border, alignSelf: "flex-start" }]}>
                  <Feather name="tag" size={16} color={primaryColor} />
                  <Text style={{ fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold", color: primaryColor }}>Apply Discount</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
                  <Text style={{ color: pal.text, fontSize: 15, fontWeight: "800", fontFamily: "Syne_700Bold" }}>Discount</Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {(["amount", "percent"] as const).map(m => {
                      const active = discountMode === m;
                      return (
                        <PressableScale key={m} onPress={() => setDiscountMode(m)} style={[s.qPill, { borderColor: active ? primaryColor : pal.border, backgroundColor: active ? primaryColor : pal.background }]}>
                          <Text style={[s.qPillText, { color: active ? onPrimary : pal.textMuted }]}>{m === "amount" ? "$ Amount" : "% Off"}</Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                  <TextInput style={[s.input, { backgroundColor: pal.background, color: pal.text, borderColor: pal.border }]} placeholder={discountMode === "amount" ? "Discount amount" : "Percent off (e.g. 10)"} placeholderTextColor={pal.textMuted} value={discountValue} onChangeText={v => setDiscountValue(v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" />
                  <TextInput style={[s.input, { backgroundColor: pal.background, color: pal.text, borderColor: pal.border }]} placeholder="Label (optional): Referral, Returning client…" placeholderTextColor={pal.textMuted} value={discountReason} onChangeText={setDiscountReason} />
                  {t.discountAmount > 0 && <Text style={[s.qHint, { color: pal.textMuted }]}>Applied: -{formatMoney(t.discountAmount)}</Text>}
                </View>
              )}
            </ScrollView>

            {/* Footer: live grand total + continue to the proposal */}
            <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: pal.border, gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: pal.textMuted, fontSize: 13, fontWeight: "700", letterSpacing: 1, fontFamily: "DMSans_700Bold" }}>TOTAL</Text>
                <Text style={{ color: primaryColor, fontSize: 30, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>{formatMoney(t.total)}</Text>
              </View>
              <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, flexDirection: "row", justifyContent: "center", gap: 8 }]} onPress={() => { setShowOverview(false); setShowTotal(true); }}>
                <Feather name="arrow-right" size={18} color={onPrimary} />
                <Text style={[s.btnText, { color: onPrimary }]}>Sign or Share →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Compare options (single-page): every material × this section's measurement, tap to switch ── */}
      <Modal visible={!!compareSec && !readOnly} transparent animationType="slide" onRequestClose={() => setCompareSection(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setCompareSection(null)} />
          <View style={{ maxHeight: "80%", backgroundColor: pal.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: pal.border }}>
            {compareSec && (() => {
              const sel = fieldById(compareSec.materialFieldId);
              const pricing = schema?.pricing || {};
              const measure = compareSec.quantityFieldId ? Number(fieldValues[compareSec.quantityFieldId]) || 0 : 0;
              const chosen = fieldValues[compareSec.materialFieldId];
              return (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingBottom: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.h2, { color: pal.text, fontSize: 20 }]}>Compare options</Text>
                      <Text style={[s.qHint, { color: pal.textMuted }]}>{measure > 0 ? `${measure.toLocaleString()} ${unitLabel(compareSec.unit)} · tap a row to switch` : "Tap a row to switch the material"}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setCompareSection(null)}><Feather name="chevron-down" size={26} color={pal.textMuted} /></TouchableOpacity>
                  </View>
                  <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 4 }}>
                    {(sel?.options || []).map((opt: string) => {
                      const rate = optionPrice(opt, pricing);
                      const lineTotal = rate == null ? null : (measure > 0 ? rate * measure : rate);
                      const selected = chosen === opt;
                      return (
                        <TouchableOpacity key={opt} onPress={() => { setField(compareSec.materialFieldId, opt); setCompareSection(null); }} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: pal.border }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                            {selected && <Feather name="check" size={16} color={primaryColor} />}
                            <Text style={{ color: selected ? primaryColor : pal.text, fontSize: 16, fontWeight: selected ? "800" : "600", fontFamily: selected ? "Syne_700Bold" : "DMSans_600SemiBold" }}>{opt}</Text>
                          </View>
                          <Text style={{ color: selected ? primaryColor : pal.text, fontSize: 16, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{lineTotal == null ? "—" : formatMoney(lineTotal)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {isAdmin && !showTotal && !readOnly && (
        <TouchableOpacity style={[s.kitCircle, { bottom: 150, backgroundColor: primaryColor, shadowColor: primaryColor }]} onPress={() => setAgentOpen(true)}>
          <Feather name="message-circle" size={24} color={B.white} />
        </TouchableOpacity>
      )}

      {agentOpen && isAdmin && !readOnly && (
        <KitAgentSheet primaryColor={primaryColor} messages={agentMessages} input={agentInput} loading={agentLoading} onInputChange={setAgentInput} onSend={sendAgentMessage} onClose={() => { setAgentOpen(false); setAgentMessages([]); }} />
      )}

      {showCelebration && !readOnly && <ConfettiOverlay message="First quote saved!" />}
    </SafeAreaView>
  );
}
