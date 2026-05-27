import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, UIManager, useWindowDimensions, View } from "react-native";
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
import { addQuote, attachQuotePresentation, getKitChatHistory, getQuoteSigningToken, getQuotes, markQuoteSent, saveBusiness, saveKitChatHistory, saveSignature } from "../storage";
import { s } from "../styles";
import { Business, QuotePresentation, SavedQuote, User } from "../types";
import { getBrandPalette, ON_PRIMARY } from "../utils/colorUtils";
import { formatMoney, resolvePaymentMethods } from "../utils/helpers";
import { computeTotals, fieldRate, groupFields, optionPrice, smartDefaults, typicalRange } from "../utils/quote";
import { evaluateCondition, evaluateFormula } from "../utils/formula";
import { defaultAllowMultiSelect, deriveSections } from "../utils/buildSchemaFromVerified";
import { applyKitSchemaUpdate } from "../utils/kitSchemaUpdate";
import { fetchWithTimeout, isTimeout, KIT_TIMEOUT_MS } from "../utils/fetchTimeout";
import { checkOnline } from "../hooks/useNetworkStatus";
import { executeKitCommand } from "../utils/executeKitCommand";
import { KitCommand } from "../utils/kitCommands";
import { logger } from "../utils/logger";
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
  const [kitEarlierCount, setKitEarlierCount] = useState(0); // how many leading messages are from prior sessions
  const [kitRetryText, setKitRetryText] = useState<string | null>(null); // last message to resend after a timeout
  const [showOverview, setShowOverview] = useState(false);       // section overview / negotiation screen
  const [comparingField, setComparingField] = useState<string | null>(null); // selector with the comparison panel open
  const [activeSections, setActiveSections] = useState<Record<string, boolean>>({}); // single-page: which sections are ON
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({}); // single-page: tap header to hide content (values kept)
  const [compareSection, setCompareSection] = useState<string | null>(null);          // single-page comparison sheet
  const [showCustomer, setShowCustomer] = useState(false);                              // customer-facing read-only view
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});           // section content offsets for "Edit" jumps

  // Single-page job-walkthrough layout — only for schemas that carry section metadata (import/wizard).
  // Legacy/demo schemas (no sections) keep the classic flat field list below, unchanged.
  const useNewLayout = !!(schema?.sections?.length);
  // Re-derive section metadata from the canonical fields whenever fields/pricing/sections change —
  // NOT just on mount. Keyed on the stringified content so a Kit edit (which mutates fields/pricing)
  // always re-runs deriveSections and the section cards reflect the change immediately, even if the
  // schema object identity didn't change. Deterministic + idempotent.
  const schemaFieldsKey = JSON.stringify(schema?.fields ?? null);
  const schemaPricingKey = JSON.stringify(schema?.pricing ?? null);
  const schemaSectionsKey = JSON.stringify(schema?.sections ?? null);
  const quoteSections: any[] = useMemo(
    () => (useNewLayout && schema?.fields?.length ? deriveSections(schema.fields, schema.pricing || {}) : (schema?.sections || [])),
    [schemaFieldsKey, schemaPricingKey, schemaSectionsKey, useNewLayout], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Schema the pricing engine actually sees — carries the upgraded sections (with option ids + rates).
  const engineSchema = useMemo(() => (useNewLayout ? { ...schema, sections: quoteSections } : schema), [schema, quoteSections, useNewLayout]);

  const reduceMotion = useReduceMotion();
  const isAdmin = currentUser.role === "admin" || currentUser.role === "superadmin";
  const pal = getBrandPalette(business);          // always-readable palette derived from brand colors
  const primaryColor = pal.primary;
  const onPrimary = ON_PRIMARY; // brand look: always white text/icons on the primary color
  const PILL_MAX = Platform.OS === "web" ? 180 : 140; // FIX 7: keep pills compact for long material names
  const { width: screenW } = useWindowDimensions();
  const narrowCards = screenW < 380; // small phones → single-column section list
  const COMPLETE_GREEN = "#22C55E";                   // FIX 3: section-complete accent
  const COMPLETE_TINT = "rgba(34,197,94,0.10)";       // subtle green card tint when a section is done

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

  // ── Multi-select for INDEPENDENT items ──
  // Use the section's explicit flag when present; otherwise apply the shared default rule (multi
  // unless it's a primary material choice). Sections are re-derived on load, so the flag is normally set.
  const isMultiSelect = (sec: any): boolean => {
    if (typeof sec?.allowMultiSelect === "boolean") return sec.allowMultiSelect;
    return defaultAllowMultiSelect(sec?.name || "", sec?.options || []);
  };
  // Per-item multi-select state keys (must match src/utils/quoteSelections.ts so the engine reads them).
  const selKey = (sec: any, opt: string) => `${sec.materialFieldId}::sel::${opt}`;
  const qtyKey = (sec: any, opt: string) => `${sec.materialFieldId}::qty::${opt}`;
  // Exact per-option rate — looked up by label (unique within a section), never fuzzy. Falls back to
  // the legacy fuzzy match only for demo/legacy schemas whose sections carry no option metadata.
  const optionRate = (sec: any, label: string): number => {
    const o = (sec?.options || []).find((x: any) => x.label === label);
    if (o) return o.rate;
    return optionPrice(label, schema?.pricing || {}) ?? 0;
  };

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
      setCollapsedGroups({});
    });
  }, [schema, business.code]);

  // Kit remembers context per business: load the saved conversation when the sheet is opened fresh.
  useEffect(() => {
    if (!agentOpen || agentMessages.length > 0) return;
    getKitChatHistory(business.code).then(hist => {
      if (hist.length) { setAgentMessages(hist.map(h => ({ role: h.role, content: h.content }))); setKitEarlierCount(hist.length); }
    });
  }, [agentOpen, business.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const discount = { mode: discountMode, value: Number(discountValue) || 0, reason: discountReason.trim() };
  // ALL pricing flows through computeTotals → the pricing engine (exact rate-by-ID for real schemas,
  // safe formula for demos). t carries lineItems + valid/hasErrors so a pricing problem is never silent.
  const t = computeTotals(engineSchema, fieldValues, selectedAddOns, discount);
  // Only flag a pricing problem once the rep has actually entered something — an empty/unselected
  // quote is the normal starting state, not an error.
  const hasUserInput = (schema?.fields || []).some((f: any) => {
    const v = fieldValues[f.id];
    if (f.type === "number" || f.type === "area") return Number(v) > 0;
    return f.type === "selector" || f.type === "toggle" ? !!v : false;
  }) || Object.keys(fieldValues).some(k => k.includes("::sel::") && fieldValues[k]);
  const pricingError = hasUserInput && (!!t.error || t.hasErrors || t.valid === false);

  // Per-section subtotal, sourced from the engine's line items (single source of truth — the card
  // numbers can't drift from the grand total).
  const sectionSubtotal = (sec: any): number =>
    t.lineItems.filter(li => li.sectionId === sec.id).reduce((sum, li) => sum + li.total, 0);

  // ClosingCard + PDF render from line items. For engine schemas, feed them the engine's exact line
  // items (as literal-valued summary lines); demos keep their original formula-based summary lines.
  const presentationSchema = (useNewLayout && t.lineItems.length)
    ? { ...schema, summaryLines: t.lineItems.filter(li => li.type !== "discount").map(li => ({ label: li.label, value: String(li.total) })) }
    : schema;
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
    setCollapsedGroups(p => ({ ...p, [key]: false })); // ensure its content is visible
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[key] || 0) - 12), animated: true }), 120);
  };

  const toggleSection = (key: string) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setExpanded(p => ({ ...p, [key]: !p[key] }));
  };

  // Throws if the write fails — callers MUST surface the error and not show a success state.
  const saveQuote = async (): Promise<string> => {
    const expiryDays = business.quoteExpiryDays === undefined ? 30 : business.quoteExpiryDays;
    const quote: SavedQuote = {
      id: Date.now().toString(), timestamp: Date.now(), customerName,
      trade: schema?.trade, total: t.total, deposit: t.deposit, fieldValues,
      userId: currentUser.id, repName: currentUser.name, status: "open",
      ...(expiryDays > 0 ? { expiresAt: Date.now() + expiryDays * 24 * 60 * 60 * 1000 } : {}),
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
    if (isFirstReal && !business.hasGeneratedQuote) { try { await saveBusiness({ ...business, hasGeneratedQuote: true }); } catch (e) { logger.error("[Quote] hasGeneratedQuote flag save failed", e instanceof Error ? e.message : String(e)); } }
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
    setCollapsedGroups({});
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

  // Persist the in-quote Kit conversation per business so it survives reopen/restart.
  const persistKitHistory = (msgs: { role: "user" | "assistant"; content: string }[]) => {
    const now = Date.now();
    saveKitChatHistory(business.code, msgs.map((m, i) => ({ role: m.role, content: m.content, timestamp: now - (msgs.length - i) })));
  };

  // Apply a new schema to live state + persist + re-derive sections (so the quote tool re-renders).
  const applyKitSchema = async (next: any, source: string) => {
    if (useNewLayout || (next?.fields && Array.isArray(next.fields))) {
      try { next.sections = deriveSections(next.fields || [], next.pricing || {}); }
      catch (e) { logger.error(`[KitAgent] deriveSections failed (${source})`, e instanceof Error ? e.message : String(e)); }
    }
    logger.debug("[KitApply] schema after update:", JSON.stringify(next).substring(0, 300));
    setSchema(next);
    try {
      await saveBusiness({ ...business, schema: next, kitUpdates: (business.kitUpdates || 0) + 1 });
      logger.debug("[KitAgent] schema update result: saved");
    } catch (e) {
      logger.error("[KitAgent] saveBusiness failed", e instanceof Error ? e.message : String(e));
      Alert.alert("Couldn't save", "Failed to save — your changes are applied here but won't sync until you reconnect.");
    }
  };

  const sendAgentMessage = async (textArg?: string) => {
    const text = (typeof textArg === "string" ? textArg : agentInput).trim();
    if (!text || agentLoading) return;
    const newMessages = [...agentMessages, { role: "user" as const, content: text }];
    setAgentMessages(newMessages);
    setAgentInput("");
    setAgentLoading(true);
    setKitRetryText(null);
    const finish = (assistantText: string) => {
      const all = [...newMessages, { role: "assistant" as const, content: assistantText }];
      setAgentMessages(all);
      persistKitHistory(all);
    };
    // Fail fast when offline — Kit needs the network; no hanging spinner.
    if (!(await checkOnline())) { setKitRetryText(text); finish("Kit requires an internet connection. Reconnect and try again."); setAgentLoading(false); return; }
    try {
      logger.debug("[KitAgent] sending message to Claude");
      // Send the LAST 20 messages for context (window management), grounding the latest turn with the
      // current schema. Strip any prior change-blocks from history so they don't confuse the model.
      const stripBlocks = (c: string) => c.replace(/COMMAND_START[\s\S]*?COMMAND_END/g, "").replace(/COMMAND_START[\s\S]*$/g, "").replace(/SCHEMA_UPDATE_START[\s\S]*?SCHEMA_UPDATE_END/g, "").replace(/CONFIG_UPDATED[\s\S]*$/g, "").trim();
      let recent = newMessages.slice(-20);
      while (recent.length && recent[0].role !== "user") recent = recent.slice(1); // Anthropic requires a leading user turn
      const apiMessages = recent.map((m, i) =>
        i === recent.length - 1
          ? { role: m.role, content: `Current schema:\n${JSON.stringify(schema, null, 2)}\n\nRequest: ${m.content}` }
          : { role: m.role, content: m.role === "assistant" ? stripBlocks(m.content) : m.content },
      );
      const agentSystem = `${AGENT_PROMPT}\n\nYou are Kit, the AI assistant for ${business.name}${schema?.trade ? `, a ${schema.trade} business` : ""}.\n\nYOUR CURRENT QUOTE TOOL:\n${humanSchemaSummary(schema)}`;
      const response = await fetchWithTimeout(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1500, system: agentSystem, messages: apiMessages }),
      }, KIT_TIMEOUT_MS);
      const data = await response.json();
      const reply = (data?.content?.[0]?.text || "").trim();
      logger.debug("[KitAgent] raw response:", reply.substring(0, 300));

      // What the user sees is ONLY the text before any machine block — strip from the first marker
      // onward (also covers a missing/garbled END marker). The raw block can never reach the chat UI.
      const markerIdx = (() => {
        const found = [/COMMAND_START/i, /SCHEMA_UPDATE_START/i, /CONFIG_UPDATED/].map(r => reply.search(r)).filter(i => i >= 0);
        return found.length ? Math.min(...found) : -1;
      })();
      const displayMessage = (markerIdx >= 0 ? reply.slice(0, markerIdx) : reply).replace(/```json/gi, "").replace(/```/g, "").trim();

      // 0) PREFERRED: a structured COMMAND block executed deterministically by executeKitCommand.
      const cmdStart = reply.search(/COMMAND_START/i);
      if (cmdStart >= 0) {
        const afterCmd = reply.slice(cmdStart + "COMMAND_START".length);
        const cmdEnd = afterCmd.search(/COMMAND_END/i);
        const cmdRegion = (cmdEnd >= 0 ? afterCmd.slice(0, cmdEnd) : afterCmd).replace(/```json/gi, "").replace(/```/g, "").trim();
        const cf = cmdRegion.indexOf("{"), cl = cmdRegion.lastIndexOf("}");
        const cmdJson = (cf >= 0 && cl > cf) ? cmdRegion.slice(cf, cl + 1) : "";
        logger.debug("[KitApply] raw command block:", cmdRegion.substring(0, 200));
        let command: any = null;
        try { command = cmdJson ? JSON.parse(cmdJson) : null; }
        catch (e) { logger.error("[KitApply] command JSON parse failed:", e instanceof Error ? e.message : String(e), "raw:", cmdJson.substring(0, 200)); }
        if (command && command.type) {
          logger.debug("[KitApply] parsed command:", command.type);
          if (command.type === "NO_CHANGE") { finish(displayMessage || "Done."); }
          else {
            const { schema: nextSchema, result } = executeKitCommand(schema, command as KitCommand);
            if (result.success) {
              logger.debug("[KitApply] command applied — calling setSchema");
              await applyKitSchema(nextSchema, "command");
              finish(displayMessage || `✓ ${result.description}.`);
            } else {
              logger.debug("[KitApply] command failed:", result.error);
              finish(`${displayMessage ? displayMessage + " " : ""}⚠️ ${result.error || "Couldn't apply that"}. Try describing it differently.`);
            }
          }
        } else {
          finish(displayMessage || "I tried to make that change but couldn't read it — tell me again and I'll retry.");
        }
        setAgentLoading(false);
        return;
      }

      // 1) FALLBACK: legacy compact diff (SCHEMA_UPDATE). Extract the JSON object after the marker even
      // when the END marker is missing or has trailing characters.
      const startIdx = reply.search(/SCHEMA_UPDATE_START/i);
      if (startIdx >= 0) {
        const after = reply.slice(startIdx + "SCHEMA_UPDATE_START".length);
        const endIdx = after.search(/SCHEMA_UPDATE_END/i);
        const region = (endIdx >= 0 ? after.slice(0, endIdx) : after).replace(/```json/gi, "").replace(/```/g, "").trim();
        const f = region.indexOf("{"), l = region.lastIndexOf("}");
        const jsonStr = (f >= 0 && l > f) ? region.slice(f, l + 1) : "";
        logger.debug("[KitApply] raw block found:", region.substring(0, 200));
        let update: any = null;
        try { update = jsonStr ? JSON.parse(jsonStr) : null; }
        catch (e) { logger.error("[KitApply] JSON parse failed:", e instanceof Error ? e.message : String(e), "raw:", jsonStr.substring(0, 200)); }
        if (update) {
          const result = applyKitSchemaUpdate(schema, update);
          if (result.changed) {
            logger.debug("[KitApply] calling setSchema with updated schema");
            await applyKitSchema(result.schema, "diff");
            finish(displayMessage || `✓ ${result.summary}.`);
          } else {
            logger.debug("[KitApply] field not found — not applied");
            finish(displayMessage || "I couldn't find that field to change — which one did you mean?");
          }
        } else {
          finish(displayMessage || "I tried to make that change but couldn't read it — tell me again and I'll retry.");
        }
        setAgentLoading(false);
        return;
      }

      // 2) FALLBACK: a full-schema CONFIG_UPDATED rewrite (large restructures).
      if (reply.includes("CONFIG_UPDATED")) {
        const jsonStart = reply.indexOf("{", reply.indexOf("CONFIG_UPDATED"));
        if (jsonStart !== -1) {
          try {
            const region = reply.substring(jsonStart).replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            const lastBrace = region.lastIndexOf("}");
            const updated = JSON.parse(lastBrace >= 0 ? region.slice(0, lastBrace + 1) : region);
            logger.debug("[KitApply] full-schema rewrite parsed");
            if (updated && Array.isArray(updated.fields)) {
              logger.debug("[KitApply] calling setSchema with updated schema");
              await applyKitSchema(updated, "full");
              finish(displayMessage || "✓ Updated.");
            } else {
              finish(displayMessage || "That didn't come through as a valid change — tell me again and I'll retry.");
            }
          } catch (e) {
            logger.error("[KitApply] full-schema parse failed:", e instanceof Error ? e.message : String(e));
            finish(displayMessage || "I couldn't apply that change cleanly — tell me the specific field and value and I'll fix it.");
          }
        } else {
          finish(displayMessage || "I couldn't read that change — tell me the specific field and value and I'll fix it.");
        }
        setAgentLoading(false);
        return;
      }

      // 3) Informational reply.
      finish(displayMessage || reply);
    } catch (e) {
      logger.error("[KitAgent] request failed", e instanceof Error ? e.message : String(e));
      if (isTimeout(e)) { setKitRetryText(text); finish("Kit is taking longer than usual. Check your connection and try again."); }
      else finish("Something went wrong. Give it another shot.");
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

  // Tap a checklist card: ON → include section, expand inline + scroll into view; OFF → remove + clear.
  const toggleGroup = (group: any) => {
    if (readOnly) return;
    const willActivate = !activeSections[group.id];
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setActiveSections(p => ({ ...p, [group.id]: willActivate }));
    if (willActivate) {
      setCollapsedGroups(p => ({ ...p, [group.id]: false })); // freshly added → show its content
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[group.id] || 0) - 12), animated: true }), 150);
    } else {
      clearGroupFields(group);
    }
  };

  // FIX 6: tap a section's header to collapse/expand its content (the values are kept either way).
  const toggleCollapse = (id: string) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setCollapsedGroups(p => ({ ...p, [id]: !p[id] }));
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
              const price = optionRate(sec, opt);
              return (
                <PressableScale key={opt} onPress={() => toggleMultiItem(sec, opt)} style={{ minWidth: 100, maxWidth: PILL_MAX, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, backgroundColor: selected ? primaryColor : pal.surface, borderColor: selected ? primaryColor : pal.border }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                    {selected && <Feather name="check" size={14} color={onPrimary} style={{ marginTop: 2 }} />}
                    <Text numberOfLines={2} style={{ flexShrink: 1, color: selected ? onPrimary : pal.text, fontSize: 15, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{opt}</Text>
                  </View>
                  {price > 0 && <Text numberOfLines={1} style={{ color: selected ? onPrimary : pal.secondary, fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold", marginTop: 3 }}>${price.toLocaleString()}/{unitOne}</Text>}
                </PressableScale>
              );
            })}
          </ScrollView>
          {selectedOpts.map((opt: string) => {
            const price = optionRate(sec, opt);
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
    const rate = chosen ? optionRate(sec, chosen) : null;
    const qty = sec.quantityFieldId ? Number(fieldValues[sec.quantityFieldId]) || 0 : 0;
    const subtotal = sectionSubtotal(sec);
    return (
      <View style={{ gap: 14 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }} keyboardShouldPersistTaps="handled">
          {(sel?.options || []).map((opt: string) => {
            const selected = chosen === opt;
            const price = optionRate(sec, opt);
            return (
              <PressableScale key={opt} onPress={() => !readOnly && setField(sec.materialFieldId, opt)} style={{ minWidth: 100, maxWidth: PILL_MAX, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, backgroundColor: selected ? primaryColor : pal.surface, borderColor: selected ? primaryColor : pal.border }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                  {selected && <Feather name="check" size={14} color={onPrimary} style={{ marginTop: 2 }} />}
                  <Text numberOfLines={2} style={{ flexShrink: 1, color: selected ? onPrimary : pal.text, fontSize: 15, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{opt}</Text>
                </View>
                {price > 0 && <Text numberOfLines={1} style={{ color: selected ? onPrimary : pal.secondary, fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold", marginTop: 3 }}>{sec.quantityFieldId ? `$${price.toLocaleString()}/${unitLabel(sec.unit).replace(/s$/, "")}` : `$${price.toLocaleString()}`}</Text>}
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
                <Feather name={on ? "check-square" : "square"} size={20} color={on ? onPrimary : pal.textMuted} />
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
            <View style={narrowCards ? { gap: 8 } : { flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {displaySections.map((g) => {
                const on = !!activeSections[g.id];
                const sub = groupSubtotal(g);
                const complete = on && sub > 0;                 // toggled on AND has a value
                const cardBg = complete ? COMPLETE_TINT : pal.surface;
                const cardBorder = complete ? COMPLETE_GREEN : (on ? primaryColor : pal.border);
                const statusIcon = complete
                  ? <Feather name="check-circle" size={18} color={COMPLETE_GREEN} />
                  : (on ? null : <Feather name="plus-circle" size={18} color={pal.textMuted} />);
                // Small phones: single-column list row (icon · name · subtotal · chevron).
                if (narrowCards) {
                  return (
                    <PressableScale key={g.id} onPress={() => toggleGroup(g)} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: cardBg, borderColor: cardBorder, borderWidth: complete || on ? 2 : 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
                      <Feather name={iconFor(g.name)} size={20} color={complete ? COMPLETE_GREEN : primaryColor} />
                      <Text numberOfLines={2} style={{ flex: 1, color: pal.text, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{g.name}</Text>
                      {complete && <Text style={{ color: COMPLETE_GREEN, fontSize: 13, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{formatMoney(sub)}</Text>}
                      <Feather name="chevron-right" size={18} color={pal.textMuted} />
                    </PressableScale>
                  );
                }
                // Wide: fixed-height 2-column card so rows align regardless of name length.
                return (
                  <PressableScale key={g.id} onPress={() => toggleGroup(g)} style={{ width: "47.5%", flexGrow: 1, minWidth: 150, height: 86, justifyContent: "space-between", backgroundColor: cardBg, borderColor: cardBorder, borderWidth: complete || on ? 2 : 1, borderRadius: 16, padding: 12 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Feather name={iconFor(g.name)} size={20} color={complete ? COMPLETE_GREEN : primaryColor} />
                      {statusIcon}
                    </View>
                    <Text numberOfLines={2} style={{ color: pal.text, fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold", lineHeight: 15 }}>{g.name}</Text>
                    <Text style={{ color: COMPLETE_GREEN, fontSize: 12, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{complete ? formatMoney(sub) : " "}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        )}

        {activeGroups.map((g) => {
          const collapsed = !readOnly && !!collapsedGroups[g.id];
          const sub = groupSubtotal(g);
          return (
            <View key={g.id} style={{ gap: 16, backgroundColor: pal.surface, borderColor: sub > 0 ? COMPLETE_GREEN : pal.border, borderWidth: 1, borderRadius: 18, padding: 16 }} onLayout={e => { sectionY.current[g.id] = e.nativeEvent.layout.y; }}>
              {/* FIX 6: the full-width header row toggles collapse (easy one-thumb reach); chevron shows state */}
              <Pressable onPress={() => !readOnly && toggleCollapse(g.id)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Feather name={iconFor(g.name)} size={18} color={primaryColor} />
                  <Text style={[s.qSectionTitle, { color: pal.text }]}>{g.name}</Text>
                  {sub > 0 && <Feather name="check-circle" size={16} color={COMPLETE_GREEN} />}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {collapsed && sub > 0 && <Text style={{ color: COMPLETE_GREEN, fontSize: 15, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{formatMoney(sub)}</Text>}
                  {!readOnly && <Feather name={collapsed ? "chevron-right" : "chevron-down"} size={22} color={pal.textMuted} />}
                </View>
              </Pressable>
              {!collapsed && g.members.map((sec: any) => (
                <View key={sec.id} style={{ gap: 10 }}>
                  {renderSectionContent(sec)}
                </View>
              ))}
            </View>
          );
        })}
      </>
    );
  };

  // Negotiation-overview groups, built straight from the engine's line items so the review screen,
  // the cards, and the grand total can never disagree.
  const newOverviewSections = useMemo(() => {
    if (!useNewLayout) return [];
    const groups = displaySections.map((g) => {
      const memberIds = new Set(g.members.map((m: any) => m.id));
      const lines = t.lineItems.filter(li => memberIds.has(li.sectionId) && li.type !== "discount").map(li => ({ label: li.label, amount: li.total }));
      return { key: g.id, title: g.name, icon: iconFor(g.name), lines, subtotal: lines.reduce((s, l) => s + l.amount, 0) };
    }).filter(g => g.subtotal > 0);
    const addonLines = t.lineItems.filter(li => li.type === "addon").map(li => ({ label: li.label, amount: li.total }));
    if (addonLines.length) groups.push({ key: "addons", title: "Add-ons", icon: "plus-circle", lines: addonLines, subtotal: addonLines.reduce((s, l) => s + l.amount, 0) });
    return groups;
  }, [useNewLayout, displaySections, t]);

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {/* FIX 12: hand-the-phone customer view */}
            <TouchableOpacity onPress={() => setShowCustomer(true)} hitSlop={8} accessibilityLabel="Show customer view">
              <Feather name="eye" size={20} color={primaryColor} />
            </TouchableOpacity>
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

      {/* FIX 5: client name in a fixed bar (never scrolls away) so the rep always sees who it's for */}
      {!readOnly && (
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="user" size={16} color={pal.textMuted} />
          <TextInput style={{ flex: 1, backgroundColor: pal.surface, color: pal.text, borderColor: pal.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 10 : 6, fontFamily: "DMSans_600SemiBold", fontSize: 15 }} placeholder="Client name" placeholderTextColor={pal.textMuted} value={customerName} onChangeText={setCustomerName} />
        </View>
      )}

      {/* Pricing integrity surface — never let a bad/zero total go out silently. */}
      {!readOnly && pricingError && (
        <TouchableOpacity
          onPress={() => { if (t.error) onBack(); else setShowOverview(true); }}
          style={{ marginHorizontal: 20, marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: t.error ? "#7F1D1D" : "#78350F", borderColor: t.error ? "#EF4444" : "#F59E0B", borderWidth: 1, borderRadius: 10, padding: 10 }}>
          <Feather name="alert-triangle" size={15} color={t.error ? "#FCA5A5" : "#FCD34D"} />
          <Text style={{ flex: 1, color: B.white, fontSize: 12.5, fontFamily: "DMSans_600SemiBold" }}>
            {t.error
              ? "Pricing calculation error — tap to rebuild your quote tool"
              : "Total may be incorrect — tap Review to verify before sending"}
          </Text>
        </TouchableOpacity>
      )}

      {/* FIX 2: keep inputs + footer above the keyboard on both platforms */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: readOnly ? 40 : 32 }} keyboardShouldPersistTaps="handled">
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
      <View style={[s.qStickyWrap, { position: "relative", backgroundColor: pal.background, borderTopColor: pal.border, borderTopWidth: 1 }]}>
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
            // FIX 4: Review button shows the live total
            <PressableScale onPress={() => setShowOverview(true)} style={[s.qReviewBtn, { backgroundColor: primaryColor }]}>
              <Text style={[s.qReviewText, { color: onPrimary }]}>Review — {formatMoney(t.total)}</Text>
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
      </KeyboardAvoidingView>

      {showTotal && !readOnly && (
        <ClosingCard schema={presentationSchema} business={business} primaryColor={primaryColor} customerName={customerName} totals={t} selectedAddOns={selectedAddOns} discount={{ amount: t.discountAmount, reason: discountReason.trim() }} paymentMethods={resolvePaymentMethods(business.paymentMethods)} saved={saved} onSave={onSavePress} prepareShare={prepareShare} onSign={handleSign} termsAndConditions={business.termsAndConditions} onClose={() => setShowTotal(false)} onNewQuote={handleNewQuote} />
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
                      const rate = optionRate(compareSec, opt);
                      const lineTotal = measure > 0 ? rate * measure : rate;
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

      {/* ── FIX 12: Show Customer — clean, large, read-only view to hand the phone over ── */}
      <Modal visible={showCustomer} animationType="slide" onRequestClose={() => setShowCustomer(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: pal.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: pal.border, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
              {business.brand.logoUri ? <Image source={{ uri: business.brand.logoUri }} style={{ width: 44, height: 44, borderRadius: 8 }} resizeMode="contain" /> : null}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: pal.text, fontSize: 24, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>{business.name}</Text>
                {customerName.trim() ? <Text numberOfLines={1} style={{ color: pal.textMuted, fontSize: 15, fontFamily: "DMSans_400Regular" }}>Prepared for {customerName.trim()}</Text> : null}
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowCustomer(false)} hitSlop={10}><Feather name="x" size={28} color={pal.textMuted} /></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 24, gap: 22 }}>
            {displayOverviewSections.length === 0 && <Text style={{ color: pal.textMuted, fontSize: 18, fontFamily: "DMSans_400Regular", textAlign: "center", marginTop: 48 }}>Your quote is being built…</Text>}
            {displayOverviewSections.map(g => (
              <View key={g.key} style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <Text style={{ color: pal.text, fontSize: 21, fontWeight: "800", fontFamily: "Syne_700Bold", flex: 1 }}>{g.title}</Text>
                  <Text style={{ color: primaryColor, fontSize: 21, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{formatMoney(g.subtotal)}</Text>
                </View>
                {g.lines.map((ln, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 16, paddingLeft: 4 }}>
                    <Text style={{ color: pal.textMuted, fontSize: 16, fontFamily: "DMSans_400Regular", flexShrink: 1 }}>{ln.label}</Text>
                    <Text style={{ color: pal.text, fontSize: 16, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{formatMoney(ln.amount)}</Text>
                  </View>
                ))}
              </View>
            ))}
            {t.discountAmount > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: pal.border, paddingTop: 14 }}>
                <Text style={{ color: pal.textMuted, fontSize: 17, fontFamily: "DMSans_400Regular" }}>Discount</Text>
                <Text style={{ color: primaryColor, fontSize: 17, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>-{formatMoney(t.discountAmount)}</Text>
              </View>
            )}
          </ScrollView>

          <View style={{ padding: 24, borderTopWidth: 1, borderTopColor: pal.border, gap: 4 }}>
            <Text style={{ color: pal.textMuted, fontSize: 14, fontWeight: "700", letterSpacing: 1.5, fontFamily: "DMSans_700Bold" }}>YOUR TOTAL</Text>
            <Text style={{ color: primaryColor, fontSize: 52, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>{formatMoney(t.total)}</Text>
            {t.depositPct > 0 && t.total > 0 && <Text style={{ color: pal.textMuted, fontSize: 16, fontFamily: "DMSans_400Regular" }}>{t.depositPct}% deposit today: {formatMoney(t.deposit)}</Text>}
            <TouchableOpacity onPress={() => setShowCustomer(false)} style={[s.btnSecondary, { borderColor: pal.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14 }]}>
              <Feather name="edit-2" size={15} color={pal.text} />
              <Text style={[s.btnSecondaryText, { color: pal.text }]}>Back to editing</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {isAdmin && !showTotal && !readOnly && (
        <TouchableOpacity style={[s.kitCircle, { bottom: 150, backgroundColor: primaryColor, borderWidth: 2, borderColor: "rgba(255,255,255,0.15)", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }]} onPress={() => setAgentOpen(true)}>
          <Feather name="message-circle" size={24} color={B.white} />
        </TouchableOpacity>
      )}

      {agentOpen && isAdmin && !readOnly && (
        <KitAgentSheet primaryColor={primaryColor} messages={agentMessages} earlierCount={kitEarlierCount} input={agentInput} loading={agentLoading} canRetry={!!kitRetryText && !agentLoading} onRetry={() => { const t = kitRetryText; setKitRetryText(null); if (t) sendAgentMessage(t); }} onInputChange={setAgentInput} onSend={sendAgentMessage} onClose={() => { setAgentOpen(false); setAgentMessages([]); setKitEarlierCount(0); setKitRetryText(null); }} />
      )}

      {showCelebration && !readOnly && <ConfettiOverlay message="First quote saved!" />}
    </SafeAreaView>
  );
}
