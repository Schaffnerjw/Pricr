import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { B } from "../constants/brand";
import { s } from "../styles";
import { ON_PRIMARY } from "../utils/colorUtils";
import { getBillingStatus, openCheckout, PlanId, validatePromoCode } from "../utils/billing";

const FEATURES = [
  "Unlimited quotes & instant PDFs",
  "Your branding on every estimate",
  "In-person + remote e-signatures",
  "Kit, your AI quoting assistant",
  "Team logins for your crew",
];

// Shown between signup_brand and choose_setup (and on trial expiry / from the dashboard banner). A
// valid Veraa partner code skips the paywall entirely (Pricr is included in the client's Veraa plan).
export function PaywallScreen({ businessCode, primaryColor, mode = "signup", trialDays, onStartTrial, onSelectPlan, onVeraaApplied, onContinue, onPaid }: {
  businessCode: string;
  primaryColor: string;
  mode?: "signup" | "expired";              // "signup" continues into setup; "expired" requires subscribe/Veraa
  trialDays?: number;                        // when set (>0) the user is mid-trial → offer "Continue"
  onStartTrial: (plan: PlanId) => void;      // begin the 3-day trial and continue into the app
  onSelectPlan?: (plan: PlanId) => void;     // persist the chosen plan to the business config
  onVeraaApplied: (code: string) => void;    // valid Veraa code → mark veraa + continue
  onContinue?: () => void;                   // continue mid-trial without paying yet
  onPaid?: () => void;                       // status flipped to active (payment confirmed) → leave the gate
}) {
  const [showPromo, setShowPromo] = useState(false);
  const [promo, setPromo] = useState("");
  const [checking, setChecking] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [launching, setLaunching] = useState<PlanId | null>(null);
  const [annualAvailable, setAnnualAvailable] = useState(true); // hidden if STRIPE_ANNUAL_PRICE_ID unset
  const [polling, setPolling] = useState(false);                // verifying payment after Stripe returns
  const [processing, setProcessing] = useState(false);          // poll timed out — payment may still be processing

  useEffect(() => {
    let live = true;
    getBillingStatus(businessCode).then(st => { if (live) setAnnualAvailable(st.annualAvailable !== false); }).catch(() => {});
    return () => { live = false; };
  }, [businessCode]);

  // HARD GATE: block the Android hardware back button while the paywall is shown — it cannot be
  // dismissed; the only exits are completing payment or entering a valid Veraa code. (No-op on web.)
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  // Option B: after Stripe Checkout returns (in-app browser closes), the webhook flips the subscription
  // to active server-side. Poll for that for ~30s; on success leave the gate, else show a wait message.
  const pollForActivation = async () => {
    setPolling(true); setProcessing(false); setPromoError("");
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const st = await getBillingStatus(businessCode);
        if (st.status === "active" || st.status === "veraa") { setPolling(false); onPaid?.(); return; }
      } catch { /* keep polling */ }
    }
    setPolling(false); setProcessing(true);
  };

  const applyPromo = async () => {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    setChecking(true); setPromoError("");
    const r = await validatePromoCode(code);
    setChecking(false);
    if (r.valid && r.type === "veraa") { onVeraaApplied(code); return; }
    setPromoError(r.message || "That code isn't valid.");
  };

  // Pick a plan: record it, open Stripe Checkout (3-day trial collected there). In signup mode we then
  // continue into the app (the webhook flips the subscription to active on payment). In expired mode we
  // stay put — the user must complete payment before regaining access.
  const choosePlan = async (plan: PlanId) => {
    setPromoError("");
    onSelectPlan?.(plan);
    setLaunching(plan);
    const opened = await openCheckout(businessCode, plan);
    setLaunching(null);
    if (mode === "expired") {
      if (!opened) { setPromoError("Billing isn't available right now. Try again shortly or use a partner code."); return; }
      // Stripe returned — verify activation (Option B). Web also catches it via the redirect (Option A).
      pollForActivation();
      return;
    }
    onStartTrial(plan); // signup: continue into setup (trial active)
  };

  const PlanCard = ({ plan, price, per, billed, recommended, badge }: { plan: PlanId; price: string; per: string; billed: string; recommended?: boolean; badge?: string }) => (
    <View style={{ flex: 1, backgroundColor: B.card, borderRadius: 16, borderWidth: recommended ? 2 : 1, borderColor: recommended ? primaryColor : B.border, padding: 16, gap: 10 }}>
      {recommended && (
        <View style={{ position: "absolute", top: -11, alignSelf: "center", backgroundColor: primaryColor, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 12 }}>
          <Text style={{ color: ON_PRIMARY, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, fontFamily: "DMSans_700Bold" }}>MOST POPULAR</Text>
        </View>
      )}
      <View style={{ alignItems: "center", marginTop: recommended ? 6 : 0 }}>
        <Text style={{ color: B.white, fontSize: 30, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>{price}<Text style={{ fontSize: 14, color: B.gray2 }}>{per}</Text></Text>
        <Text style={{ color: B.gray3, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{billed}</Text>
      </View>
      {badge && (
        <View style={{ backgroundColor: B.green + "22", borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8 }}>
          <Text style={{ color: B.green, fontSize: 11, fontWeight: "700", textAlign: "center", fontFamily: "DMSans_700Bold" }}>{badge}</Text>
        </View>
      )}
      <TouchableOpacity style={[s.btn, { backgroundColor: recommended ? primaryColor : "transparent", borderWidth: recommended ? 0 : 1, borderColor: primaryColor, paddingVertical: 11, alignItems: "center" }]} onPress={() => choosePlan(plan)} disabled={launching !== null}>
        {launching === plan ? <ActivityIndicator color={recommended ? ON_PRIMARY : primaryColor} size="small" />
          : <Text style={{ color: recommended ? ON_PRIMARY : primaryColor, fontWeight: "700", fontSize: 13, fontFamily: "DMSans_700Bold", textAlign: "center" }}>{mode === "expired" ? "Subscribe" : "Start 3-day free trial"}</Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: B.midnight }]}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 22, paddingBottom: 48 }}>
        <View style={{ alignItems: "center", marginTop: 12 }}><PricrLogo size={30} /></View>

        <View style={{ gap: 6, alignItems: "center" }}>
          <Text style={{ color: B.white, fontSize: 26, fontWeight: "800", fontFamily: "Syne_800ExtraBold", textAlign: "center" }}>{mode === "expired" ? "Your trial has ended" : "Start your 3-day free trial"}</Text>
          <Text style={{ color: B.gray2, fontSize: 15, fontFamily: "DMSans_400Regular", textAlign: "center" }}>{mode === "expired" ? "Choose a plan to keep using Pricr — or enter your partner code." : "Pick a plan to begin. Cancel anytime during your trial."}</Text>
        </View>

        <View style={{ backgroundColor: B.card, borderRadius: 16, borderWidth: 1, borderColor: B.border, padding: 20, gap: 12 }}>
          {FEATURES.map(f => (
            <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name="check-circle" size={18} color={primaryColor} />
              <Text style={{ color: B.gray1, fontSize: 15, fontFamily: "DMSans_400Regular", flex: 1 }}>{f}</Text>
            </View>
          ))}
        </View>

        {/* Plan cards */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: annualAvailable ? 6 : 0 }}>
          <PlanCard plan="monthly" price="$49" per="/month" billed="Billed monthly" />
          {annualAvailable && <PlanCard plan="annual" price="$490" per="/year" billed="Billed annually" recommended badge="Save $98 — 2 months free" />}
        </View>

        {/* Promo / partner code */}
        {!showPromo ? (
          <TouchableOpacity onPress={() => setShowPromo(true)} style={{ alignItems: "center", paddingVertical: 4 }}>
            <Text style={{ color: B.gray2, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>Have a promo code?</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={{ color: B.gray2, fontSize: 12, fontWeight: "700", letterSpacing: 1, fontFamily: "DMSans_700Bold" }}>PROMO OR PARTNER CODE</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput style={[s.input, { flex: 1, backgroundColor: B.card, color: B.white, borderColor: B.border }]} placeholder="VERAA-XXXX-0000" placeholderTextColor={B.gray3} value={promo} onChangeText={v => setPromo(v.toUpperCase())} autoCapitalize="characters" />
              <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, paddingHorizontal: 18, justifyContent: "center" }]} onPress={applyPromo} disabled={checking}>
                {checking ? <ActivityIndicator color={ON_PRIMARY} size="small" /> : <Text style={[s.btnText, { color: ON_PRIMARY }]}>Apply</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!!promoError && <Text style={{ color: B.red, fontSize: 13, textAlign: "center", fontFamily: "DMSans_400Regular" }}>{promoError}</Text>}

        {polling && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 4 }}>
            <ActivityIndicator color={primaryColor} size="small" />
            <Text style={{ color: B.gray2, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>Confirming your payment…</Text>
          </View>
        )}
        {processing && (
          <View style={{ backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 }}>
            <Text style={{ color: B.gray1, fontSize: 14, fontFamily: "DMSans_400Regular", textAlign: "center" }}>Payment processing… If you completed payment, give it a moment, then tap below to re-check.</Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor }]} onPress={pollForActivation}>
              <Text style={[s.btnText, { color: ON_PRIMARY }]}>I&apos;ve paid — check again</Text>
            </TouchableOpacity>
          </View>
        )}

        {trialDays != null && trialDays > 0 && onContinue && (
          <TouchableOpacity onPress={onContinue} style={{ alignItems: "center", paddingVertical: 6 }}>
            <Text style={{ color: B.gray2, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>Continue — {trialDays} day{trialDays === 1 ? "" : "s"} left in trial</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
