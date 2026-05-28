import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { shouldShowPayButton } from "../utils/paymentConfig";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, Image, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import SignaturePad from "./SignaturePad";
import { B } from "../constants/brand";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { s, wl } from "../styles";
import { Business, QuotePresentation } from "../types";
import { getCardTheme } from "../utils/color";
import { evaluateCondition, evaluateFormula } from "../utils/formula";
import { formatLongDate, formatMoney, resolveDocPrefs } from "../utils/helpers";
import { previewQuotePDF, shareQuotePDF } from "../utils/shareQuotePDF";
import { sendQuoteLink } from "../utils/sendQuoteLink";
import { canSubmitSignature, hasContactCaptured } from "../utils/signingGate";

const SCREEN_H = Dimensions.get("window").height;

// E-SIGN / UETA consent the signer affirms before signing (matches the remote signing page).
const CONSENT_TEXT = "I have read and agree to the terms above. By signing below I consent to use electronic records and signatures for this transaction. I understand this electronic signature is legally binding under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act (UETA).";

type Totals = { ctx: Record<string, any>; taxRate: number; tax: number; total: number; depositPct: number; deposit: number };

// Result of the in-person sign flow, returned by the parent's onSign so the success card can
// show "We've sent a copy to <email>" — or surface a send failure honestly (the signature
// stuck, the delivery didn't).
export interface InPersonSignResult { signed: boolean; sentEmail: boolean; sentSms: boolean; sendError?: string }

// The slide-up "proposal" sheet shown when reviewing a quote. Owns its own entrance animation.
export function ClosingCard({ schema, business, primaryColor, customerName, notes, totals, selectedAddOns, discount, paymentMethods, saved, onSave, prepareShare, onSign, termsAndConditions, onClose, onNewQuote, onSaveTemplate, onDuplicate, initialSignature, initialSignedAt, initialDeliveryContact }: {
  schema: any; business: Business; primaryColor: string; customerName: string; notes?: string;
  totals: Totals; selectedAddOns: string[]; discount?: { amount: number; reason?: string }; paymentMethods?: string[]; saved: boolean; onSave: () => void;
  prepareShare?: (presentation: QuotePresentation) => Promise<{ signingLink: string | null; signingToken: string | null }>;
  onSign?: (signatureData: string, presentation: QuotePresentation, contact: { email?: string; phone?: string }) => Promise<InPersonSignResult>;
  termsAndConditions?: string;
  onClose: () => void;
  onNewQuote?: () => void;
  onSaveTemplate?: (name: string) => void;   // save this quote's config as a named template
  onDuplicate?: () => void;                   // start a similar quote (same config, blank client)
  // If the quote was already signed (re-opened from history), seed the success card so the
  // contractor doesn't see the pre-sign UI again (and can't accidentally re-sign).
  initialSignature?: string;
  initialSignedAt?: number;
  initialDeliveryContact?: { email?: string; phone?: string };
}) {
  const reduceMotion = useReduceMotion();
  const theme = getCardTheme(primaryColor);
  const slide = useRef(new Animated.Value(0)).current;
  const depositScale = useRef(new Animated.Value(1)).current;
  const sigRef = useRef<any>(null);
  const [sharing, setSharing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // Seed signature state from props so re-opening a previously-signed quote lands on the success
  // card, not the pre-sign UI (the latter would let the contractor accidentally re-sign).
  const [signature, setSignature] = useState<string | null>(initialSignature || null);
  const [signedAt, setSignedAt] = useState<number | null>(initialSignedAt || null);
  const [signingBusy, setSigningBusy] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [consentChecked, setConsentChecked] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);
  // Customer contact captured BEFORE signing so the signed copy gets auto-delivered. At least
  // one of email / phone is required to enable the signature pad.
  const [signerEmail, setSignerEmail] = useState<string>(initialDeliveryContact?.email || "");
  const [signerPhone, setSignerPhone] = useState<string>(initialDeliveryContact?.phone || "");
  // Delivery outcome — drives the "We've sent a copy to …" line on the success card.
  const [deliveryStatus, setDeliveryStatus] = useState<{ ok: boolean; email?: string; phone?: string; error?: string } | null>(
    initialSignature && (initialDeliveryContact?.email || initialDeliveryContact?.phone)
      ? { ok: true, email: initialDeliveryContact?.email, phone: initialDeliveryContact?.phone }
      : null,
  );
  // "Share Quote" pre-sign modal — collects email/phone and uses /quote/send-link (proxy delivers
  // a hosted link via Resend/Twilio). Keeps the customer's inbox free of HTML attachments.
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendModalEmail, setSendModalEmail] = useState<string>("");
  const [sendModalPhone, setSendModalPhone] = useState<string>("");
  const [sendModalBusy, setSendModalBusy] = useState(false);
  const [sendModalResult, setSendModalResult] = useState<{ ok: boolean; error?: string; sentEmail?: boolean; sentSms?: boolean } | null>(null);
  const t = totals;
  const hasTerms = !!(termsAndConditions && termsAndConditions.trim());
  // E-SIGN consent + at least one valid contact required before the pad becomes active. (The
  // contact requirement is what lets us auto-deliver a signed copy — see handleSignatureOK.)
  // Predicates are pure helpers in signingGate.ts so the gate is unit-tested.
  const hasContact = hasContactCaptured(signerEmail, signerPhone);
  const canSign = canSubmitSignature({ hasTerms, agreed, consentChecked, hasContact, busy: signingBusy });
  const docPrefs = resolveDocPrefs(business.docPrefs); // what the customer sees on this card

  useEffect(() => {
    if (reduceMotion) { slide.setValue(1); return; }
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 9, tension: 65 }).start();
    Animated.sequence([
      Animated.delay(250),
      Animated.timing(depositScale, { toValue: 1.08, duration: 200, useNativeDriver: true }),
      Animated.timing(depositScale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [reduceMotion]);

  const balanceDue = Math.max(0, t.total - t.deposit);
  // Quote validity window — business.quoteExpiryDays (default 30); 0 = "Never" (no expiry → validTs 0).
  const expiryDays = business.quoteExpiryDays === undefined ? 30 : business.quoteExpiryDays;
  const validTs = expiryDays > 0 ? Date.now() + expiryDays * 24 * 60 * 60 * 1000 : 0;
  const validThrough = validTs > 0 ? formatLongDate(validTs) : "";

  // Build the same line items the card renders, for the PDF.
  const buildLineItems = () => {
    const items: { label: string; amount: number }[] = [];
    for (const line of schema?.summaryLines || []) {
      if (line.showIf && !evaluateCondition(line.showIf, t.ctx, schema.pricing || {})) continue;
      const label = line.label.replace(/\{(\w+)\}/g, (_: string, k: string) => t.ctx[k] ?? schema.pricing?.[k] ?? k);
      const value = evaluateFormula(line.value, t.ctx, schema.pricing || {});
      if (value) items.push({ label, amount: value });
    }
    for (const id of selectedAddOns) {
      const ao = schema?.addOns?.find((a: any) => a.id === id);
      if (ao) items.push({ label: ao.label, amount: ao.price || 0 });
    }
    // Discount as a negative line item so it flows into the PDF and the remote signing page.
    if (discount && discount.amount > 0) {
      items.push({ label: discount.reason ? `Discount (${discount.reason})` : "Discount", amount: -discount.amount });
    }
    return items;
  };

  // The renderable snapshot shared by the share-sheet, the PDF, and the remote signing page.
  const buildPresentation = (): QuotePresentation => ({
    businessName: business.name,
    brandColor: primaryColor,
    logoUri: business.brand.logoUri,
    phone: business.brand.phone,
    email: business.brand.email,
    address: business.brand.address,
    customerName,
    // Customer contact captured in this card — distinct from `phone`/`email` above (those are
    // the contractor's). Persisted on the SavedQuote so history can show who got the copy.
    customerEmail: signerEmail.trim() || undefined,
    customerPhone: signerPhone.trim() || undefined,
    trade: schema?.trade,
    date: Date.now(),
    validThrough: validTs,
    notes: notes && notes.trim() ? notes.trim() : undefined,
    lineItems: buildLineItems(),
    taxRate: t.taxRate,
    tax: t.tax,
    total: t.total,
    depositPct: t.depositPct,
    deposit: t.deposit,
    balanceDue,
    docPrefs: business.docPrefs,
    paymentMethods: paymentMethods && paymentMethods.length ? paymentMethods : undefined,
  });

  // Contractor preview — renders the quote exactly as the client sees it (no send, no side effects).
  const onPreview = async () => {
    await previewQuotePDF({ ...buildPresentation(), signatureData: signature ?? undefined, signedAt: signedAt ?? undefined, termsAndConditions });
  };

  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const presentation = buildPresentation();
      const { signingLink } = (await prepareShare?.(presentation)) ?? { signingLink: null };
      // The contractor's intro now travels in the SMS/email delivery body (the signing page opens
      // clean at the quote). Personalize when we have a customer name; otherwise lead with the biz.
      const greet = customerName.trim() ? `Hi ${customerName.trim()},` : "Hi there,";
      const intro = `${greet}\n\nThanks for considering ${business.name}. Here's your quote for ${formatMoney(t.total)}.`;
      const deliveryMessage = signingLink ? `${intro}\n\nReview and sign: ${signingLink}` : undefined;
      await shareQuotePDF(
        { ...presentation, signatureData: signature ?? undefined, signedAt: signedAt ?? undefined, signingLink: signingLink ?? undefined, termsAndConditions },
        deliveryMessage ? { message: deliveryMessage } : undefined,
      );
    } catch {
      Alert.alert("Couldn't share quote", "We couldn't prepare this quote to share. Check your connection and try again.");
    } finally {
      setSharing(false);
    }
  };

  // ── In-person signature capture + delivery ──
  const handleConfirmSign = () => {
    if (!canSign) return;
    sigRef.current?.readSignature(); // → onOK (has ink) or onEmpty
  };
  const handleSignatureOK = async (sig: string) => {
    setSigningBusy(true);
    try {
      // The parent's onSign returns a delivery result — it saves the signature server-side, then
      // hits /quote/send-link (proxy) to email/SMS the customer a hosted-link copy. We surface
      // that result on the success card: green "Sent to <email>" or amber "Saved, but couldn't
      // send — retry below". The signature itself is committed either way.
      const result = await onSign?.(sig, buildPresentation(), { email: signerEmail.trim(), phone: signerPhone.trim() });
      setSignature(sig);
      setSignedAt(Date.now());
      if (result) {
        setDeliveryStatus({
          ok: result.sentEmail || result.sentSms,
          email: signerEmail.trim() || undefined,
          phone: signerPhone.trim() || undefined,
          error: result.sendError,
        });
      }
    } catch {
      Alert.alert("Couldn't save signature", "Please try again.");
    } finally {
      setSigningBusy(false);
    }
  };
  // Post-sign "Resend copy" — if /quote/send-link failed (network blip, bad address), the
  // contractor can fix the contact and retry without going back through the signature pad.
  const handleResendSignedCopy = async () => {
    const presentation = buildPresentation();
    const prep = await prepareShare?.(presentation);
    const token = prep?.signingToken;
    if (!token) { setDeliveryStatus({ ok: false, error: "Couldn't find the quote on the server." }); return; }
    const r = await sendQuoteLink({ token, email: signerEmail.trim(), phone: signerPhone.trim(), signed: true });
    setDeliveryStatus({ ok: r.ok, email: signerEmail.trim() || undefined, phone: signerPhone.trim() || undefined, error: r.ok ? undefined : r.error });
  };
  // "Share Quote" pre-sign modal handler — collects email/phone, calls /quote/send-link with
  // signed=false so the customer gets a tap-to-open URL to the hosted signing page (never an
  // HTML/PDF attachment).
  const handleSendUnsigned = async () => {
    const email = sendModalEmail.trim();
    const phone = sendModalPhone.trim();
    if (!email && !phone) { setSendModalResult({ ok: false, error: "Enter an email or phone number." }); return; }
    setSendModalBusy(true);
    try {
      const presentation = buildPresentation();
      const prep = await prepareShare?.(presentation);
      const token = prep?.signingToken;
      if (!token) { setSendModalResult({ ok: false, error: "Couldn't prepare the quote — try again." }); return; }
      const r = await sendQuoteLink({ token, email, phone, signed: false });
      setSendModalResult({ ok: r.ok, sentEmail: r.sentEmail, sentSms: r.sentSms, error: r.ok ? undefined : r.error });
    } catch { setSendModalResult({ ok: false, error: "Couldn't send the quote — try again." }); }
    finally { setSendModalBusy(false); }
  };

  return (
    <View style={s.qFill}>
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", opacity: slide }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "90%", transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0] }) }] }}>
        <View style={[s.closingCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder, borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>
          <ScrollView contentContainerStyle={{ gap: 16 }} showsVerticalScrollIndicator={false} scrollEnabled={scrollEnabled}>
            <View style={s.closingCardHeader}>
              {business.brand.logoUri ? (
                <Image source={{ uri: business.brand.logoUri }} style={wl.quoteLogo} resizeMode="contain" />
              ) : (
                <Text style={[wl.bizName, { color: theme.bizColor, fontSize: 16 }]}>{business.name}</Text>
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TouchableOpacity style={[s.saveBtn, { flexDirection: "row", alignItems: "center", gap: 4, borderColor: primaryColor, backgroundColor: saved ? primaryColor : "transparent" }]} onPress={onSave}>
                  {saved && <Feather name="check" size={14} color={B.white} />}
                  <Text style={[s.saveBtnText, { color: saved ? B.white : primaryColor }]}>{saved ? "Saved" : "Save"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose}><Feather name="chevron-down" size={24} color={theme.lineColor} /></TouchableOpacity>
              </View>
            </View>

            <Text style={[s.ccFixedPrice, { color: primaryColor, textTransform: "uppercase" }]}>Fixed price estimate</Text>
            <Text style={[s.closingCustomer, { color: theme.customerColor }]}>{customerName || "Customer"}</Text>

            {docPrefs.showLineItems && (
              <>
                <View style={[s.closingDivider, { backgroundColor: theme.dividerColor }]} />
                <View style={{ gap: 10 }}>
                  {schema?.summaryLines?.map((line: any, i: number) => {
                    if (line.showIf && !evaluateCondition(line.showIf, t.ctx, schema.pricing || {})) return null;
                    const label = line.label.replace(/\{(\w+)\}/g, (_: string, key: string) => t.ctx[key] ?? schema.pricing?.[key] ?? key);
                    const value = evaluateFormula(line.value, t.ctx, schema.pricing || {});
                    if (!value) return null;
                    return (
                      <View key={i} style={s.lineItem}>
                        <Text style={[s.lineLabel, { color: theme.lineColor }]}>{label}</Text>
                        {docPrefs.showPricing && <Text style={[s.lineValue, { color: theme.valueColor }]}>{formatMoney(value)}</Text>}
                      </View>
                    );
                  })}
                  {selectedAddOns.map(id => {
                    const ao = schema?.addOns?.find((a: any) => a.id === id);
                    if (!ao) return null;
                    return (
                      <View key={id} style={s.lineItem}>
                        <Text style={[s.lineLabel, { color: theme.lineColor }]}>{ao.label}</Text>
                        {docPrefs.showPricing && <Text style={[s.lineValue, { color: theme.valueColor }]}>${ao.price?.toLocaleString()}</Text>}
                      </View>
                    );
                  })}
                  {docPrefs.showSubtotal && docPrefs.showPricing && t.taxRate > 0 && (
                    <View style={s.lineItem}>
                      <Text style={[s.lineLabel, { color: theme.lineColor }]}>Tax ({t.taxRate}%)</Text>
                      <Text style={[s.lineValue, { color: theme.valueColor }]}>{formatMoney(t.tax)}</Text>
                    </View>
                  )}
                  {discount && discount.amount > 0 && (
                    <View style={s.lineItem}>
                      <Text style={[s.lineLabel, { color: theme.lineColor }]}>{discount.reason ? `Discount (${discount.reason})` : "Discount"}</Text>
                      <Text style={[s.lineValue, { color: primaryColor }]}>-{formatMoney(discount.amount)}</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            <View style={[s.closingDivider, { backgroundColor: theme.dividerColor }]} />
            <View style={s.totalRow}>
              <Text style={[s.totalLabel, { color: theme.totalColor }]}>Total</Text>
              <Text style={[s.totalAmount, { color: theme.totalColor }]}>{formatMoney(t.total)}</Text>
            </View>

            {t.depositPct > 0 && t.total > 0 && (
              <Animated.View style={[s.depositBadge, { backgroundColor: theme.depositBg, borderColor: theme.depositBorder, transform: [{ scale: depositScale }] }]}>
                <View>
                  <Text style={[s.depositLabel, { color: theme.depositLabelColor }]}>{t.depositPct}% Deposit Due Today</Text>
                  <Text style={[s.depositSub, { color: theme.lineColor }]}>Balance due upon completion</Text>
                </View>
                <Text style={[s.depositAmount, { color: theme.depositAmountColor }]}>{formatMoney(t.deposit)}</Text>
              </Animated.View>
            )}

            {t.total > 0 && (
              <View style={{ gap: 2 }}>
                <Text style={[s.ccTerms, { color: theme.valueColor }]}>Balance of {formatMoney(balanceDue)} due upon completion</Text>
                {validThrough ? <Text style={[s.ccValid, { color: theme.lineColor }]}>Valid until {validThrough}</Text> : null}
              </View>
            )}

            {/* ── Job notes (only if set) ── */}
            {notes && notes.trim() ? (
              <View style={{ gap: 6 }}>
                <View style={[s.closingDivider, { backgroundColor: theme.dividerColor }]} />
                <Text style={[s.ccTerms, { color: theme.lineColor, fontWeight: "700" }]}>Job Notes</Text>
                <Text style={{ color: theme.valueColor, fontSize: 13, lineHeight: 19, fontFamily: "DMSans_400Regular" }}>{notes.trim()}</Text>
              </View>
            ) : null}

            {/* ── Terms & conditions (only if the business has set them) ── */}
            {hasTerms && (
              <View style={{ gap: 8 }}>
                <View style={[s.closingDivider, { backgroundColor: theme.dividerColor }]} />
                <Text style={[s.ccTerms, { color: theme.lineColor, fontWeight: "700" }]}>Please review the terms and conditions below</Text>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 150, borderWidth: 1, borderColor: theme.dividerColor, borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: theme.valueColor, fontSize: 12, lineHeight: 19, fontFamily: "DMSans_400Regular" }}>{termsAndConditions}</Text>
                </ScrollView>
                {!signature && (
                  <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }} onPress={() => setAgreed(a => !a)}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: agreed ? primaryColor : theme.lineColor, backgroundColor: agreed ? primaryColor : "transparent", alignItems: "center", justifyContent: "center" }}>
                      {agreed && <Feather name="check" size={14} color={B.white} />}
                    </View>
                    <Text style={{ flex: 1, color: theme.valueColor, fontSize: 13, fontFamily: "DMSans_400Regular" }}>I have read and agree to the terms and conditions</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── In-person signature ── */}
            <View style={{ gap: 8 }}>
              <View style={[s.closingDivider, { backgroundColor: theme.dividerColor }]} />
              {signature ? (
                // ── DEAL CLOSED ── success card. Replaces both the old inline "Quote Accepted"
                // line AND the dead-end "Already signed" state — re-opening a signed quote lands
                // here with the persisted signature/contact (via initialSignature props).
                <View style={{ gap: 12 }}>
                  <View style={{ alignItems: "center", paddingTop: 4, gap: 6 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: primaryColor, alignItems: "center", justifyContent: "center" }}>
                      <Feather name="check" size={30} color={B.white} />
                    </View>
                    <Text style={{ color: primaryColor, fontSize: 22, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>Signed ✓ — Deal closed</Text>
                    <Text style={{ color: theme.totalColor, fontSize: 28, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>{formatMoney(t.total)}</Text>
                    <Text style={{ color: theme.lineColor, fontSize: 12, fontFamily: "DMSans_400Regular" }}>Signed {formatLongDate(signedAt ?? Date.now())}</Text>
                  </View>

                  {/* Delivery status: green when sent, amber + retry when the post-sign /quote/send-link call failed. */}
                  {deliveryStatus && (deliveryStatus.email || deliveryStatus.phone) && (
                    <View style={{ backgroundColor: deliveryStatus.ok ? primaryColor + "1A" : B.red + "1A", borderColor: deliveryStatus.ok ? primaryColor : B.red, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Feather name={deliveryStatus.ok ? "send" : "alert-circle"} size={16} color={deliveryStatus.ok ? primaryColor : B.red} />
                        <Text style={{ flex: 1, color: theme.totalColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>
                          {deliveryStatus.ok
                            ? `We've sent a copy to ${[deliveryStatus.email, deliveryStatus.phone].filter(Boolean).join(" + ")}`
                            : "Couldn't send the signed copy — the signature is saved. Retry below."}
                        </Text>
                      </View>
                      {!deliveryStatus.ok && (
                        <TouchableOpacity onPress={handleResendSignedCopy} style={[s.btn, { backgroundColor: primaryColor, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8 }]}>
                          <Text style={s.btnText}>Retry send</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* Signature image */}
                  <View style={{ backgroundColor: B.white, borderRadius: 10, padding: 8, alignItems: "center" }}>
                    <Image source={{ uri: signature }} style={{ width: "100%", height: 100 }} resizeMode="contain" />
                  </View>

                  {/* Legally-binding trust badge — tap for details */}
                  <TouchableOpacity onPress={() => setLegalModalOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: theme.dividerColor, borderRadius: 10, padding: 12 }}>
                    <Feather name="shield" size={16} color={primaryColor} />
                    <Text style={{ flex: 1, color: theme.valueColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Legally binding e-signature — E-SIGN Act compliant</Text>
                    <Feather name="info" size={15} color={theme.lineColor} />
                  </TouchableOpacity>

                  {/* Optional Pay Now — only when the business configured payment passthrough. Opens the
                      contractor's own link (QuickBooks/Square/PayPal/etc.); Pricr never touches money. */}
                  {(() => {
                    const link = shouldShowPayButton(business.payment);
                    if (!link) return null;
                    return (
                      <View style={{ gap: 6, marginTop: 4 }}>
                        {business.payment?.instructions ? <Text style={{ color: theme.lineColor, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{business.payment.instructions}</Text> : null}
                        <TouchableOpacity style={[s.btn, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: primaryColor }]} onPress={() => { WebBrowser.openBrowserAsync(link).catch(() => {}); }}>
                          <Feather name="credit-card" size={18} color={B.white} />
                          <Text style={s.btnText}>Pay Now</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={[s.ccTerms, { color: theme.lineColor, fontWeight: "700" }]}>Customer Signature</Text>
                  {/* Trust badges */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {[{ icon: "lock", label: "256-bit encrypted" }, { icon: "check", label: "E-SIGN compliant" }, { icon: "clipboard", label: "Audit logged" }].map(b => (
                      <View key={b.label} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: theme.dividerColor, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10 }}>
                        <Feather name={b.icon as any} size={11} color={theme.lineColor} />
                        <Text style={{ color: theme.lineColor, fontSize: 11, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{b.label}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Customer contact — required so the signed copy can be auto-sent. Phone OR email
                      is enough; pad stays disabled until one of them is filled. */}
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: theme.lineColor, fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Where should we send your signed copy?</Text>
                    <TextInput
                      style={[s.input, { backgroundColor: B.white, color: "#0A0E1A", borderColor: theme.dividerColor }]}
                      placeholder="Email" placeholderTextColor={theme.lineColor}
                      value={signerEmail} onChangeText={setSignerEmail}
                      autoCapitalize="none" keyboardType="email-address"
                    />
                    <TextInput
                      style={[s.input, { backgroundColor: B.white, color: "#0A0E1A", borderColor: theme.dividerColor }]}
                      placeholder="Mobile (optional if email above)" placeholderTextColor={theme.lineColor}
                      value={signerPhone} onChangeText={setSignerPhone}
                      keyboardType="phone-pad"
                    />
                  </View>

                  {/* E-SIGN consent — required before the signature pad becomes active */}
                  <TouchableOpacity style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 }} onPress={() => setConsentChecked(c => !c)}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: consentChecked ? primaryColor : theme.lineColor, backgroundColor: consentChecked ? primaryColor : "transparent", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                      {consentChecked && <Feather name="check" size={14} color={B.white} />}
                    </View>
                    <Text style={{ flex: 1, color: theme.valueColor, fontSize: 12, lineHeight: 18, fontFamily: "DMSans_400Regular" }}>{CONSENT_TEXT}</Text>
                  </TouchableOpacity>
                  <View style={{ height: 170, borderRadius: 10, overflow: "hidden", backgroundColor: B.white, opacity: canSign ? 1 : 0.5 }} pointerEvents={canSign ? "auto" : "none"}>
                    <SignaturePad
                      ref={sigRef}
                      onOK={handleSignatureOK}
                      onEmpty={() => Alert.alert("Add a signature", "Please sign in the box first.")}
                      onBegin={() => setScrollEnabled(false)}
                      onEnd={() => setScrollEnabled(true)}
                      autoClear={false}
                      descriptionText=""
                      penColor="#0A0E1A"
                      backgroundColor="#FFFFFF"
                      webStyle={`.m-signature-pad--footer{display:none;margin:0;}.m-signature-pad{box-shadow:none;border:none;}.m-signature-pad--body{border:none;}body,html{width:100%;height:100%;}`}
                    />
                  </View>
                  {hasTerms && !agreed && (
                    <Text style={{ color: theme.lineColor, fontSize: 12, fontFamily: "DMSans_400Regular" }}>Agree to the terms above to enable signing.</Text>
                  )}
                  {(!hasTerms || agreed) && !consentChecked && (
                    <Text style={{ color: theme.lineColor, fontSize: 12, fontFamily: "DMSans_400Regular" }}>Check the consent box above to enable signing.</Text>
                  )}
                  {(!hasTerms || agreed) && consentChecked && !hasContact && (
                    <Text style={{ color: theme.lineColor, fontSize: 12, fontFamily: "DMSans_400Regular" }}>Add an email or mobile so we can send the signed copy.</Text>
                  )}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TouchableOpacity style={[s.btnSecondary, { flex: 1, borderColor: theme.dividerColor }]} onPress={() => sigRef.current?.clearSignature()} disabled={signingBusy}>
                      <Text style={[s.btnSecondaryText, { color: theme.lineColor }]}>Clear</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn, { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: primaryColor, opacity: canSign ? 1 : 0.5 }]} onPress={handleConfirmSign} disabled={!canSign}>
                      {signingBusy ? <ActivityIndicator color={B.white} size="small" /> : <Feather name="edit-3" size={16} color={B.white} />}
                      <Text style={s.btnText}>{signingBusy ? "Saving…" : "Confirm & Sign"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Accepted payment methods (admin sets once in Settings; shown on every quote — FIX 11). */}
            {paymentMethods && paymentMethods.length > 0 && (
              <View style={{ gap: 4 }}>
                <View style={[s.closingDivider, { backgroundColor: theme.dividerColor }]} />
                <Text style={[s.ccTerms, { color: theme.lineColor, fontWeight: "700" }]}>We Accept</Text>
                <Text style={{ color: theme.valueColor, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{paymentMethods.join(", ")}</Text>
              </View>
            )}

            {docPrefs.showContact && (business.brand.phone || business.brand.email || business.brand.address) && (
              <View style={[s.contactFooter, { borderTopColor: theme.dividerColor }]}>
                {business.brand.phone ? <ContactRow icon="phone" text={business.brand.phone} color={theme.lineColor} /> : null}
                {business.brand.email ? <ContactRow icon="mail" text={business.brand.email} color={theme.lineColor} /> : null}
                {business.brand.address ? <ContactRow icon="map-pin" text={business.brand.address} color={theme.lineColor} /> : null}
              </View>
            )}

            <TouchableOpacity
              style={[s.btnSecondary, { borderColor: primaryColor, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }]}
              onPress={onPreview}
            >
              <Feather name="eye" size={18} color={primaryColor} />
              <Text style={[s.btnSecondaryText, { color: primaryColor }]}>Preview as Client</Text>
            </TouchableOpacity>

            {/* "Send Quote" → email/SMS modal that uses /quote/send-link (proxy delivers via Resend
                + Twilio with a hosted link in the body; never an HTML/PDF attachment). The legacy
                "Share Quote" path via the OS share sheet stays available as a secondary action for
                contractors who want to paste the link into a custom message themselves. */}
            {!signature && (
              <TouchableOpacity
                style={[s.btn, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: primaryColor, marginTop: 8 }]}
                onPress={() => { setSendModalEmail(""); setSendModalPhone(""); setSendModalResult(null); setSendModalOpen(true); }}
              >
                <Feather name="send" size={18} color={B.white} />
                <Text style={s.btnText}>Send Quote</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.btnSecondary, { borderColor: primaryColor, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }]}
              onPress={onShare}
              disabled={sharing}
            >
              {sharing ? <ActivityIndicator color={primaryColor} size="small" /> : <Feather name="share" size={18} color={primaryColor} />}
              <Text style={[s.btnSecondaryText, { color: primaryColor }]}>{sharing ? "Preparing…" : "Or share via Messages"}</Text>
            </TouchableOpacity>

            {/* After signing, an always-visible exit so the card is never a dead end (incl. after the share sheet closes). */}
            {signature && (
              <TouchableOpacity style={[s.btnSecondary, { borderColor: primaryColor, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]} onPress={onClose}>
                <Feather name="check" size={16} color={primaryColor} />
                <Text style={[s.btnSecondaryText, { color: primaryColor }]}>Done — Back to Quote</Text>
              </TouchableOpacity>
            )}

            {/* Quote a similar job — same config, blank client. */}
            {onDuplicate && (
              <TouchableOpacity style={[s.btnSecondary, { borderColor: primaryColor, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]} onPress={onDuplicate}>
                <Feather name="copy" size={16} color={primaryColor} />
                <Text style={[s.btnSecondaryText, { color: primaryColor }]}>Quote a similar job →</Text>
              </TouchableOpacity>
            )}

            {/* Save this configuration as a reusable template. */}
            {onSaveTemplate && (
              <TouchableOpacity style={[s.btnSecondary, { borderColor: theme.dividerColor, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]} onPress={() => { setTemplateName(""); setTemplateSaved(false); setTemplateModalOpen(true); }}>
                <Feather name="bookmark" size={16} color={theme.lineColor} />
                <Text style={[s.btnSecondaryText, { color: theme.lineColor }]}>Save as Template</Text>
              </TouchableOpacity>
            )}

            {/* Start a fresh quote for a new client (FIX 17). */}
            {onNewQuote && (
              <TouchableOpacity style={[s.btnSecondary, { borderColor: theme.dividerColor, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]} onPress={onNewQuote}>
                <Feather name="plus" size={16} color={theme.lineColor} />
                <Text style={[s.btnSecondaryText, { color: theme.lineColor }]}>New Quote</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Animated.View>

      {/* Send Quote modal — pre-sign delivery via /quote/send-link. Email/SMS body contains a
          hosted URL the customer taps to open the quote in their browser (no file attachment).
          Stays open after sending so the contractor sees the confirmation; Done closes it. */}
      <Modal visible={sendModalOpen} transparent animationType="fade" onRequestClose={() => setSendModalOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }} onPress={() => setSendModalOpen(false)}>
          <Pressable style={{ backgroundColor: B.card, borderRadius: 18, borderWidth: 1, borderColor: B.border, padding: 22, gap: 14 }} onPress={() => {}}>
            <Text style={{ color: B.white, fontSize: 17, fontWeight: "800", fontFamily: "Syne_700Bold" }}>Send Quote</Text>
            {sendModalResult?.ok ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="check-circle" size={18} color={primaryColor} />
                  <Text style={{ color: B.gray1, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>Sent — your customer will receive a tap-to-open link.</Text>
                </View>
                <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, marginTop: 6 }]} onPress={() => setSendModalOpen(false)}>
                  <Text style={s.btnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={{ color: B.muted, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 19 }}>The customer gets a hosted link they can tap to review and sign — no files attached.</Text>
                <TextInput
                  style={{ backgroundColor: B.midnight, color: B.white, borderColor: B.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "DMSans_400Regular", fontSize: 15 }}
                  placeholder="Customer email" placeholderTextColor={B.gray3} value={sendModalEmail} onChangeText={setSendModalEmail} autoCapitalize="none" keyboardType="email-address"
                />
                <TextInput
                  style={{ backgroundColor: B.midnight, color: B.white, borderColor: B.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "DMSans_400Regular", fontSize: 15 }}
                  placeholder="Customer mobile (optional if email above)" placeholderTextColor={B.gray3} value={sendModalPhone} onChangeText={setSendModalPhone} keyboardType="phone-pad"
                />
                {sendModalResult && !sendModalResult.ok && (
                  <Text style={{ color: B.red, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{sendModalResult.error || "Couldn't send. Try again."}</Text>
                )}
                <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, opacity: sendModalBusy ? 0.6 : 1 }]} disabled={sendModalBusy} onPress={handleSendUnsigned}>
                  {sendModalBusy ? <ActivityIndicator color={B.white} size="small" /> : <Text style={s.btnText}>Send</Text>}
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Save-as-template name prompt */}
      <Modal visible={templateModalOpen} transparent animationType="fade" onRequestClose={() => setTemplateModalOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 28 }} onPress={() => setTemplateModalOpen(false)}>
          <Pressable style={{ backgroundColor: B.card, borderRadius: 18, borderWidth: 1, borderColor: B.border, padding: 22, gap: 14 }} onPress={() => {}}>
            <Text style={{ color: B.white, fontSize: 17, fontWeight: "800", fontFamily: "Syne_700Bold" }}>Save as Template</Text>
            {templateSaved ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="check-circle" size={18} color={primaryColor} />
                <Text style={{ color: B.gray1, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>Saved — find it at the top of a new quote.</Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={{ backgroundColor: B.midnight, color: B.white, borderColor: B.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "DMSans_400Regular", fontSize: 15 }}
                  placeholder="e.g. Standard 300sqft Deck" placeholderTextColor={B.gray3} value={templateName} onChangeText={setTemplateName} autoFocus
                />
                <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, opacity: templateName.trim() ? 1 : 0.4 }]} disabled={!templateName.trim()} onPress={() => { onSaveTemplate?.(templateName.trim()); setTemplateSaved(true); setTimeout(() => setTemplateModalOpen(false), 900); }}>
                  <Text style={s.btnText}>Save Template</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Legal details modal — opened from the post-signing trust badge */}
      <Modal visible={legalModalOpen} transparent animationType="fade" onRequestClose={() => setLegalModalOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 28 }} onPress={() => setLegalModalOpen(false)}>
          <Pressable style={{ backgroundColor: B.card, borderRadius: 18, borderWidth: 1, borderColor: B.border, padding: 22, gap: 12 }} onPress={() => {}}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="shield" size={18} color={primaryColor} />
              <Text style={{ color: B.white, fontSize: 17, fontWeight: "800", fontFamily: "Syne_700Bold" }}>Legally binding e-signature</Text>
            </View>
            {[
              ["Signed by", customerName || "Customer"],
              ["Date & time", formatLongDate(signedAt ?? Date.now())],
              ["Identity", "Signed in person"],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 16 }}>
                <Text style={{ color: B.muted, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{k}</Text>
                <Text style={{ color: B.gray1, fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold", flexShrink: 1, textAlign: "right" }}>{v}</Text>
              </View>
            ))}
            <Text style={{ color: B.muted, fontSize: 12, lineHeight: 18, fontFamily: "DMSans_400Regular", marginTop: 4 }}>
              This signature is legally binding under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 2000) and the Uniform Electronic Transactions Act (UETA).
            </Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, marginTop: 4 }]} onPress={() => setLegalModalOpen(false)}>
              <Text style={s.btnText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ContactRow({ icon, text, color }: { icon: any; text: string; color: string }) {
  return (
    <View style={s.ccContactRow}>
      <Feather name={icon} size={13} color={color} />
      <Text style={[s.contactText, { color }]}>{text}</Text>
    </View>
  );
}
