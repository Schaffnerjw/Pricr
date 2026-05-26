import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { B } from "../constants/brand";
import { s } from "../styles";
import { ON_PRIMARY } from "../utils/colorUtils";
import { openCheckout, validatePromoCode } from "../utils/billing";

const FEATURES = [
  "Unlimited quotes & instant PDFs",
  "Your branding on every estimate",
  "In-person + remote e-signatures",
  "Kit, your AI quoting assistant",
  "Team logins for your crew",
];

// Shown between signup_brand and choose_setup (and on trial expiry). A valid Veraa partner code skips
// the paywall entirely (Pricr is included in the client's Veraa plan).
export function PaywallScreen({ businessCode, primaryColor, mode = "signup", trialDays, onStartTrial, onVeraaApplied, onContinue }: {
  businessCode: string;
  primaryColor: string;
  mode?: "signup" | "expired";   // "signup" offers a free trial; "expired" requires subscribe/Veraa
  trialDays?: number;            // when set (>0) the user is mid-trial → offer "Continue"
  onStartTrial: () => void;      // begin the 14-day trial (no card) and continue to setup
  onVeraaApplied: (code: string) => void; // valid Veraa code → mark veraa + continue
  onContinue?: () => void;       // continue mid-trial without paying yet
}) {
  const [showPromo, setShowPromo] = useState(false);
  const [promo, setPromo] = useState("");
  const [checking, setChecking] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [launching, setLaunching] = useState(false);

  const applyPromo = async () => {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    setChecking(true); setPromoError("");
    const r = await validatePromoCode(code);
    setChecking(false);
    if (r.valid && r.type === "veraa") { onVeraaApplied(code); return; }
    setPromoError(r.message || "That code isn't valid.");
  };

  const startCheckout = async () => {
    setLaunching(true);
    const opened = await openCheckout(businessCode);
    setLaunching(false);
    if (!opened) setPromoError("Billing isn't available right now — start your free trial and add a card later.");
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: B.midnight }]}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 22, paddingBottom: 48 }}>
        <View style={{ alignItems: "center", marginTop: 12 }}><PricrLogo size={30} /></View>

        <View style={{ gap: 6, alignItems: "center" }}>
          <Text style={{ color: B.white, fontSize: 26, fontWeight: "800", fontFamily: "Syne_800ExtraBold", textAlign: "center" }}>{mode === "expired" ? "Your trial has ended" : "Start your 14-day free trial"}</Text>
          <Text style={{ color: B.gray2, fontSize: 15, fontFamily: "DMSans_400Regular", textAlign: "center" }}>{mode === "expired" ? "Subscribe to keep using Pricr — or enter your partner code." : "No card required to start. $49/month after your trial."}</Text>
        </View>

        <View style={{ backgroundColor: B.card, borderRadius: 16, borderWidth: 1, borderColor: B.border, padding: 20, gap: 12 }}>
          {FEATURES.map(f => (
            <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name="check-circle" size={18} color={primaryColor} />
              <Text style={{ color: B.gray1, fontSize: 15, fontFamily: "DMSans_400Regular", flex: 1 }}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={{ alignItems: "center", gap: 2 }}>
          <Text style={{ color: B.white, fontSize: 34, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>$49<Text style={{ fontSize: 16, color: B.gray2 }}>/month</Text></Text>
          <Text style={{ color: B.gray3, fontSize: 12, fontFamily: "DMSans_400Regular" }}>Cancel anytime.</Text>
        </View>

        {mode === "signup" && (
          <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }]} onPress={onStartTrial}>
            <Text style={[s.btnText, { color: ON_PRIMARY }]}>Start Free Trial →</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[s.btnSecondary, { borderColor: primaryColor, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }]} onPress={startCheckout} disabled={launching}>
          {launching ? <ActivityIndicator color={primaryColor} size="small" /> : <Feather name="credit-card" size={16} color={primaryColor} />}
          <Text style={[s.btnSecondaryText, { color: primaryColor }]}>Subscribe now ($49/mo)</Text>
        </TouchableOpacity>

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

        {trialDays != null && trialDays > 0 && onContinue && (
          <TouchableOpacity onPress={onContinue} style={{ alignItems: "center", paddingVertical: 6 }}>
            <Text style={{ color: B.gray2, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>Continue — {trialDays} day{trialDays === 1 ? "" : "s"} left in trial</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
