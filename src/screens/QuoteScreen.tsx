import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { Alert, LayoutAnimation, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, UIManager, View } from "react-native";
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
import { formatMoney } from "../utils/helpers";
import { computeTotals, fieldRate, groupFields, optionPrice, smartDefaults, typicalRange } from "../utils/quote";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function QuoteScreen({ schema, setSchema, business, currentUser, onBack, isDemoMode, initialValues }: {
  schema: any; setSchema: (s: any) => void; business: Business; currentUser: User; onBack: () => void; isDemoMode?: boolean; initialValues?: Record<string, any>;
}) {
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

  const reduceMotion = useReduceMotion();
  const isAdmin = currentUser.role === "admin" || currentUser.role === "superadmin";
  const pal = getBrandPalette(business);          // always-readable palette derived from brand colors
  const primaryColor = pal.primary;
  const onPrimary = ON_PRIMARY; // brand look: always white text/icons on the primary color

  const sections = useMemo(() => groupFields(schema?.fields ?? []), [schema]);
  const setField = (id: string, value: any) => setFieldValues(p => ({ ...p, [id]: value }));
  const toggleAddOn = (id: string) => setSelectedAddOns(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

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
        else if (f.type === "selector" && f.options?.length) defaults[f.id] = smart[f.id] ?? f.options[0];
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
    });
  }, [schema, business.code]);

  const discount = { mode: discountMode, value: Number(discountValue) || 0, reason: discountReason.trim() };
  const t = computeTotals(schema, fieldValues, selectedAddOns, discount);
  const range = typicalRange(history);
  const outsideRange = !!range && t.total > 0 && (t.total > range.avg + 1.5 * range.std || t.total < Math.max(0, range.avg - 1.5 * range.std));

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
    return quote.id;
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
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1500, system: AGENT_PROMPT, messages: apiMessages }),
      });
      const data = await response.json();
      const reply = data.content[0].text.trim();
      if (reply.includes("CONFIG_UPDATED")) {
        const jsonStart = reply.indexOf("\n{");
        if (jsonStart !== -1) {
          try {
            const updated = JSON.parse(reply.substring(jsonStart).trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
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
        <TextInput style={[s.input, { backgroundColor: pal.surface, color: pal.text, borderColor: pal.border }]} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} placeholderTextColor={pal.textMuted} value={value ? value.toString() : ""} onChangeText={v => setField(field.id, v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" />
        {hint ? <Text style={[s.qHint, { color: pal.textMuted }]}>{hint}</Text> : null}
      </View>
    );
  };

  const renderSelector = (field: any) => {
    const value = fieldValues[field.id];
    return (
      <View key={field.id} style={{ gap: 8 }}>
        <Text style={[s.fieldLabel, { color: pal.textMuted }]}>{field.label.toUpperCase()}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {field.options?.map((opt: string) => {
            const selected = value === opt;
            const price = optionPrice(opt, schema?.pricing || {});
            return (
              <PressableScale key={opt} onPress={() => setField(field.id, opt)} style={[s.qOptionCard, { borderColor: selected ? primaryColor : pal.border, backgroundColor: selected ? primaryColor : pal.surface }]}>
                <Text style={[s.qOptionName, { color: selected ? onPrimary : pal.text }]}>{opt}</Text>
                {price != null ? <Text style={[s.qOptionPrice, { color: selected ? onPrimary : primaryColor }]}>${price.toLocaleString()}</Text> : null}
              </PressableScale>
            );
          })}
        </View>
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

  return (
    <SafeAreaView style={[s.container, { backgroundColor: pal.background }]}>
      <BrandHeader business={business} right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={[s.roleBadge, isAdmin && { borderColor: primaryColor + "60", backgroundColor: primaryColor + "15" }]}>
            <Text style={s.roleBadgeText}>{isAdmin ? "Admin" : "Rep"}</Text>
          </View>
          <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Feather name="chevron-left" size={18} color={primaryColor} />
            <Text style={[s.navBackText, { color: primaryColor }]}>Back</Text>
          </TouchableOpacity>
        </View>
      } />

      {isDemoMode && (
        <View style={s.demoBanner}>
          <Feather name="radio" size={13} color={B.midnight} />
          <Text style={s.demoBannerText}>DEMO MODE — changes are live</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Text style={[s.fieldLabel, { color: pal.textMuted }]}>CUSTOMER NAME</Text>
          <TextInput style={[s.input, { backgroundColor: pal.surface, color: pal.text, borderColor: pal.border }]} placeholder="Customer full name" placeholderTextColor={pal.textMuted} value={customerName} onChangeText={setCustomerName} />
        </View>

        {!ready ? (
          <View style={{ gap: 14 }}>
            <SkeletonCard height={20} /><SkeletonCard /><SkeletonCard height={90} /><SkeletonCard height={48} />
          </View>
        ) : (
          <>
            {sections.map(sec => {
              // #2: a section gated by an "Include X" toggle collapses its other fields when that toggle is off.
              const controller = sec.fields.find((f: any) => f.type === "toggle" && /\b(include|includes|add|with|has)\b/i.test(`${f.id} ${f.label}`));
              const fieldsToRender = controller && !fieldValues[controller.id] ? [controller] : sec.fields;
              return (
                <View key={sec.key} style={{ gap: 14 }}>
                  {renderSectionHeader(sec.key, sec.title, sec.icon, sec.optional)}
                  {expanded[sec.key] && <View style={{ gap: 18 }}>{fieldsToRender.map(renderField)}</View>}
                </View>
              );
            })}

            {schema?.addOns?.length > 0 && (
              <View style={{ gap: 14 }}>
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
            <View style={{ gap: 14 }}>
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
            </View>
          </>
        )}
      </ScrollView>

      {/* Sticky live total bar (+ minimum warning, + typical range) */}
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
            <Text style={[s.qStickyLabel, { color: pal.textMuted }]}>ESTIMATED TOTAL</Text>
            <AnimatedDollar value={t.total} style={[s.qStickyTotal, { color: pal.text }]} />
          </View>
          <PressableScale onPress={() => setShowTotal(true)} style={[s.qReviewBtn, { backgroundColor: primaryColor }]}>
            <Text style={[s.qReviewText, { color: onPrimary }]}>Review</Text>
            <Feather name="chevron-up" size={18} color={onPrimary} />
          </PressableScale>
        </View>
      </View>

      {showTotal && (
        <ClosingCard schema={schema} business={business} primaryColor={primaryColor} customerName={customerName} totals={t} selectedAddOns={selectedAddOns} discount={{ amount: t.discountAmount, reason: discountReason.trim() }} saved={saved} onSave={onSavePress} prepareShare={prepareShare} onSign={handleSign} termsAndConditions={business.termsAndConditions} onClose={() => setShowTotal(false)} />
      )}

      {isAdmin && !showTotal && (
        <TouchableOpacity style={[s.kitCircle, { bottom: 150, backgroundColor: primaryColor, shadowColor: primaryColor }]} onPress={() => setAgentOpen(true)}>
          <Feather name="message-circle" size={24} color={B.white} />
        </TouchableOpacity>
      )}

      {agentOpen && isAdmin && (
        <KitAgentSheet primaryColor={primaryColor} messages={agentMessages} input={agentInput} loading={agentLoading} onInputChange={setAgentInput} onSend={sendAgentMessage} onClose={() => { setAgentOpen(false); setAgentMessages([]); }} />
      )}

      {showCelebration && <ConfettiOverlay message="First quote saved!" />}
    </SafeAreaView>
  );
}
