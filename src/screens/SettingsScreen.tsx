import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { Alert, Image, SafeAreaView, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KitChatModal } from "../components/KitChatModal";
import { B, DEFAULT_BRAND } from "../constants/brand";
import { s } from "../styles";
import { BrandConfig, Business, DocPrefs, PaymentMethods, User } from "../types";
import { isValidHex } from "../utils/color";
import { getContrastColor, isReadable, ON_PRIMARY } from "../utils/colorUtils";
import { PAYMENT_OPTIONS, resolveDocPrefs } from "../utils/helpers";
import { fieldRate } from "../utils/quote";

const BG_PRESETS = [
  { label: "Dark Navy", hex: "#0A0E1A" },
  { label: "Deep Charcoal", hex: "#1C1C1E" },
  { label: "Pure Black", hex: "#000000" },
];

// Admin-only brand customization. Edits a local copy, previews live, and saves to the business config.
export function SettingsScreen({ business, currentUser, onSave, onBack, onPickLogo, onSignOut, onViewSigningActivity, onRebuildQuoteTool, scrollToTerms }: {
  business: Business;
  currentUser?: User;
  onSave: (update: { name: string; brand: BrandConfig; termsAndConditions?: string; docPrefs?: DocPrefs; paymentMethods?: PaymentMethods; notificationEmail?: string; requireSmsVerification?: boolean }) => void | Promise<void>;
  onBack: () => void;
  onPickLogo: () => Promise<string | null>;
  onSignOut?: () => void;
  onViewSigningActivity?: () => void;
  onRebuildQuoteTool?: () => void;
  scrollToTerms?: boolean;
}) {
  const [name, setName] = useState(business.name);
  const [logoUri, setLogoUri] = useState<string | null>(business.brand.logoUri);
  const [primary, setPrimary] = useState(business.brand.primaryColor || DEFAULT_BRAND.primaryColor);
  const [secondary, setSecondary] = useState(business.brand.secondaryColor || DEFAULT_BRAND.secondaryColor);
  const [background, setBackground] = useState(business.brand.backgroundColor || DEFAULT_BRAND.backgroundColor);
  const [terms, setTerms] = useState(business.termsAndConditions ?? "");
  const [editingTerms, setEditingTerms] = useState(false);
  const [payMethods, setPayMethods] = useState<string[]>(business.paymentMethods?.methods ?? []);
  const [payOther, setPayOther] = useState(business.paymentMethods?.other ?? "");
  const [notificationEmail, setNotificationEmail] = useState(business.notificationEmail ?? business.brand.email ?? "");
  const [requireSms, setRequireSms] = useState(business.requireSmsVerification !== false); // default ON
  const [dp, setDp] = useState<DocPrefs>(resolveDocPrefs(business.docPrefs));
  const [kitOpen, setKitOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false); // collapsible "current schema" debug view
  const [rawOpen, setRawOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const termsY = useRef(0);

  const setDocStyle = (style: DocPrefs["style"]) => setDp(resolveDocPrefs({ ...dp, style }));
  const toggleDoc = (key: keyof DocPrefs) => setDp(prev => resolveDocPrefs({ ...prev, style: "custom", [key]: !prev[key as "showLineItems"] }));
  const togglePay = (m: string) => setPayMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  const copyBusinessId = async () => { await Clipboard.setStringAsync(business.code); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const trade = business.schema?.trade || "contracting";
  const TC_SYSTEM = `You are Kit, helping the owner of "${business.name}" (a ${trade} business) write professional terms and conditions for their client quotes. Ask these questions ONE at a time, conversationally: (1) what trade/service they provide, (2) whether they carry liability insurance and what it covers, (3) what items or situations they are NOT responsible for, (4) their cancellation policy, (5) any deposit or payment terms. After you have enough, output the finished terms as plain text prefixed EXACTLY with "TERMS_READY:" on its own, then the full terms as short numbered clauses (no markdown headers). Keep it professional, fair, and concise.`;

  useEffect(() => {
    if (scrollToTerms) setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, termsY.current - 12), animated: true }), 350);
  }, [scrollToTerms]);

  const pc = isValidHex(primary) ? primary : DEFAULT_BRAND.primaryColor;
  const sc = isValidHex(secondary) ? secondary : DEFAULT_BRAND.secondaryColor;
  const bg = isValidHex(background) ? background : DEFAULT_BRAND.backgroundColor;
  const norm = (v: string) => v.startsWith("#") ? v : "#" + v;
  // Live contrast result for the chosen background — drives the preview + the unreadable warning.
  const previewText = getContrastColor(bg);
  const bgReadable = isReadable(previewText, bg);

  const doSave = () => { save(); };
  const onSavePress = () => {
    if (bgReadable) { doSave(); return; }
    Alert.alert(
      "Hard-to-read colors",
      "This background color makes text hard to read. Consider a darker background. Save anyway?",
      [{ text: "Keep editing", style: "cancel" }, { text: "Save anyway", style: "destructive", onPress: doSave }],
    );
  };

  const pickLogo = async () => { const uri = await onPickLogo(); if (uri) setLogoUri(uri); };
  const resetDefaults = () => { setPrimary(DEFAULT_BRAND.primaryColor); setSecondary(DEFAULT_BRAND.secondaryColor); setBackground(DEFAULT_BRAND.backgroundColor); };
  const save = async () => {
    try {
      await onSave({ name: name.trim() || business.name, brand: { ...business.brand, logoUri, primaryColor: pc, secondaryColor: sc, backgroundColor: bg }, termsAndConditions: terms.trim() || undefined, docPrefs: dp, paymentMethods: { methods: payMethods, other: payOther.trim() || undefined }, notificationEmail: notificationEmail.trim() || undefined, requireSmsVerification: requireSms });
      setEditingTerms(false);
      setToast(true);
      setTimeout(() => setToast(false), 1600);
    } catch {
      Alert.alert("Couldn't save", "We couldn't save your settings. Check your connection and try again.");
    }
  };

  const DebugRow = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: B.muted, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{label}</Text>
      <Text style={{ color: B.gray1, fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold", flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );

  const ColorRow = ({ label, value, valid, onChange }: { label: string; value: string; valid: string; onChange: (v: string) => void }) => (
    <View style={{ gap: 6 }}>
      <Text style={s.formLabel}>{label}</Text>
      <View style={s.setColorRow}>
        <View style={[s.setSwatch, { backgroundColor: valid }]} />
        <TextInput style={s.setHexInput} value={value} onChangeText={v => onChange(norm(v))} placeholder="#000000" placeholderTextColor={B.gray3} autoCapitalize="characters" maxLength={7} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={onBack} style={[s.navBack, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
          <Feather name="chevron-left" size={18} color={B.blue} />
          <Text style={s.navBackText}>Done</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 96 }} keyboardShouldPersistTaps="handled">
        {/* Live preview */}
        <View style={{ gap: 8 }}>
          <Text style={s.sectionTitle}>LIVE PREVIEW</Text>
          <View style={[s.setPreviewCard, { backgroundColor: bg, borderColor: pc + "40" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={{ height: 28, width: 110 }} resizeMode="contain" />
              ) : (
                <Text style={{ color: pc, fontWeight: "800", fontFamily: "Syne_700Bold", fontSize: 16 }}>{name || business.name}</Text>
              )}
              <Text style={{ color: previewText, opacity: 0.7, fontSize: 11, fontFamily: "DMSans_400Regular" }}>Preview</Text>
            </View>
            <Text style={{ color: previewText, fontSize: 26, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>$2,400</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: pc, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                <Text style={{ color: ON_PRIMARY, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Primary</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: sc }}>
                <Text style={{ color: sc, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Secondary</Text>
              </View>
            </View>
          </View>
          {!bgReadable && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: B.red + "1A", borderColor: B.red, borderWidth: 1, borderRadius: 10, padding: 12 }}>
              <Feather name="alert-triangle" size={16} color={B.red} />
              <Text style={{ flex: 1, color: B.red, fontSize: 13, fontFamily: "DMSans_400Regular" }}>This background color makes text hard to read. Consider a darker background.</Text>
            </View>
          )}
        </View>

        {/* Business info */}
        <View style={{ gap: 12 }}>
          <Text style={s.sectionTitle}>BUSINESS INFO</Text>
          <View style={{ gap: 6 }}>
            <Text style={s.formLabel}>Business Name</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Business name" placeholderTextColor={B.gray3} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={s.formLabel}>Logo</Text>
            <TouchableOpacity style={s.logoUploadBtn} onPress={pickLogo}>
              {logoUri ? <Image source={{ uri: logoUri }} style={{ height: 48, width: "100%" }} resizeMode="contain" /> : <Text style={s.logoUploadText}>Tap to upload logo</Text>}
            </TouchableOpacity>
            {logoUri && (
              <TouchableOpacity onPress={() => setLogoUri(null)}><Text style={{ color: B.red, fontSize: 13, marginTop: 4 }}>Remove logo</Text></TouchableOpacity>
            )}
          </View>

          {/* Business ID — share with new team members so they can join. Read-only + copy. */}
          <View style={{ gap: 6 }}>
            <Text style={s.formLabel}>Business ID</Text>
            <Text style={s.formHint}>Share this with new team members so they can join your account.</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: B.card, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14 }}>
              <Text style={{ flex: 1, color: B.white, fontSize: 18, fontWeight: "800", letterSpacing: 3, fontFamily: "Syne_700Bold" }}>{business.code}</Text>
              <TouchableOpacity onPress={copyBusinessId} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: pc }}>
                <Feather name={copied ? "check" : "copy"} size={14} color={pc} />
                <Text style={{ color: pc, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{copied ? "Copied" : "Copy"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Brand colors */}
        <View style={{ gap: 12 }}>
          <Text style={s.sectionTitle}>BRAND COLORS</Text>
          <ColorRow label="Primary" value={primary} valid={pc} onChange={setPrimary} />
          <ColorRow label="Secondary" value={secondary} valid={sc} onChange={setSecondary} />
          <ColorRow label="Background" value={background} valid={bg} onChange={setBackground} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {BG_PRESETS.map(p => {
              const active = bg.toUpperCase() === p.hex.toUpperCase();
              return (
                <TouchableOpacity key={p.hex} style={[s.setPreset, active && { borderColor: pc, backgroundColor: pc + "20" }]} onPress={() => setBackground(p.hex)}>
                  <Text style={[s.setPresetText, active && { color: B.white }]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={[s.setPreset, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
              <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: bg, borderWidth: 1, borderColor: B.border }} />
              <Text style={s.setPresetText}>Custom</Text>
            </View>
          </View>
          <TouchableOpacity onPress={resetDefaults}>
            <Text style={{ color: B.blue, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>Reset to brand defaults</Text>
          </TouchableOpacity>
        </View>

        {/* Terms & Conditions */}
        <View style={{ gap: 12 }} onLayout={e => { termsY.current = e.nativeEvent.layout.y; }}>
          <Text style={s.sectionTitle}>TERMS & CONDITIONS</Text>
          {editingTerms ? (
            <TextInput
              style={[s.input, { minHeight: 180, textAlignVertical: "top", paddingTop: 12 }]}
              value={terms} onChangeText={setTerms} multiline
              placeholder="Type or paste your terms and conditions…" placeholderTextColor={B.gray3}
            />
          ) : (
            <View style={{ borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, maxHeight: 220 }}>
              <ScrollView nestedScrollEnabled>
                <Text style={{ color: terms.trim() ? B.gray1 : B.gray3, fontSize: 13, lineHeight: 20, fontFamily: "DMSans_400Regular" }}>
                  {terms.trim() || "No terms set yet. Add them so clients agree before signing."}
                </Text>
              </ScrollView>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1, borderColor: pc }]} onPress={() => setEditingTerms(e => !e)}>
              <Text style={[s.btnSecondaryText, { color: pc }]}>{editingTerms ? "Preview" : "Edit Terms"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1, borderColor: pc, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]} onPress={() => setKitOpen(true)}>
              <Feather name="message-circle" size={15} color={pc} />
              <Text style={[s.btnSecondaryText, { color: pc }]}>Have Kit write them</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quote Document — control what the customer sees on the quote (PDF + in-app). */}
        <View style={{ gap: 12 }}>
          <Text style={s.sectionTitle}>QUOTE DOCUMENT</Text>
          <Text style={s.formHint}>Choose what your clients see on the quote.</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["detailed", "summary", "custom"] as const).map(st => {
              const active = dp.style === st;
              return (
                <TouchableOpacity key={st} onPress={() => setDocStyle(st)} style={[s.setPreset, { flex: 1, alignItems: "center" }, active && { borderColor: pc, backgroundColor: pc + "20" }]}>
                  <Text style={[s.setPresetText, active && { color: B.white }]}>{st.charAt(0).toUpperCase() + st.slice(1)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {([
            ["showLineItems", "Show line items"],
            ["showPricing", "Show individual pricing"],
            ["showSubtotal", "Show subtotal breakdown"],
            ["showContact", "Show business contact info"],
          ] as const).map(([key, label]) => (
            <View key={key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 }}>
              <Text style={{ color: B.gray1, fontSize: 15, flex: 1, fontFamily: "DMSans_400Regular" }}>{label}</Text>
              <Switch value={dp[key]} onValueChange={() => toggleDoc(key)} trackColor={{ true: pc, false: B.border }} thumbColor={B.white} />
            </View>
          ))}
          <Text style={{ color: B.muted, fontSize: 12, fontFamily: "DMSans_400Regular" }}>
            {dp.style === "summary" ? "Summary: just business, client, total, deposit & signature." : dp.style === "detailed" ? "Detailed: full line items, pricing & breakdown." : "Custom: your toggle choices above."}
          </Text>
        </View>

        {/* Payment Methods — admin sets accepted methods once; shown on every quote (FIX 11). */}
        <View style={{ gap: 12 }}>
          <Text style={s.sectionTitle}>PAYMENT METHODS</Text>
          <Text style={s.formHint}>What you accept. Shown on every quote, the signing page, and the PDF.</Text>
          {PAYMENT_OPTIONS.map(m => {
            const on = payMethods.includes(m);
            return (
              <TouchableOpacity key={m} onPress={() => togglePay(m)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
                <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: on ? pc : B.gray3, backgroundColor: on ? pc : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {on && <Feather name="check" size={15} color={ON_PRIMARY} />}
                </View>
                <Text style={{ color: B.gray1, fontSize: 15, fontFamily: "DMSans_400Regular" }}>{m}</Text>
              </TouchableOpacity>
            );
          })}
          {(() => {
            const on = payMethods.includes("Other");
            return (
              <>
                <TouchableOpacity onPress={() => togglePay("Other")} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: on ? pc : B.gray3, backgroundColor: on ? pc : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {on && <Feather name="check" size={15} color={ON_PRIMARY} />}
                  </View>
                  <Text style={{ color: B.gray1, fontSize: 15, fontFamily: "DMSans_400Regular" }}>Other</Text>
                </TouchableOpacity>
                {on && (
                  <TextInput style={s.input} value={payOther} onChangeText={setPayOther} placeholder="e.g. Apple Pay, Financing" placeholderTextColor={B.gray3} />
                )}
              </>
            );
          })()}
        </View>

        {/* Quote Tool — rebuild + a debug view of exactly what Kit captured (Part 7). */}
        <View style={{ gap: 12 }}>
          <Text style={s.sectionTitle}>QUOTE TOOL</Text>
          {onRebuildQuoteTool && (
            <TouchableOpacity style={[s.btnSecondary, { borderColor: pc, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]} onPress={onRebuildQuoteTool}>
              <Feather name="refresh-cw" size={15} color={pc} />
              <Text style={[s.btnSecondaryText, { color: pc }]}>Rebuild Quote Tool</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setSchemaOpen(o => !o)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
            <Text style={{ color: B.gray1, fontSize: 15, fontFamily: "DMSans_600SemiBold" }}>Current Schema</Text>
            <Feather name={schemaOpen ? "chevron-up" : "chevron-down"} size={18} color={B.gray2} />
          </TouchableOpacity>
          {schemaOpen && (
            <View style={{ backgroundColor: B.card, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, gap: 8 }}>
              <DebugRow label="Trade" value={business.schema?.trade || "(not set)"} />
              <DebugRow label="Fields" value={String(business.schema?.fields?.length || 0)} />
              {(business.schema?.fields || []).map((f: any) => (
                <View key={f.id} style={{ borderTopWidth: 1, borderTopColor: B.border, paddingTop: 6 }}>
                  <Text style={{ color: B.gray1, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{f.label}</Text>
                  <Text style={{ color: B.muted, fontSize: 12, fontFamily: "DMSans_400Regular" }}>
                    {f.type} · {f.unit || "—"}{fieldRate(f, business.schema?.pricing || {}) ? ` · ${fieldRate(f, business.schema?.pricing || {})}` : ""}
                  </Text>
                </View>
              ))}
              {(business.schema?.addOns || []).map((a: any) => (
                <View key={a.id} style={{ borderTopWidth: 1, borderTopColor: B.border, paddingTop: 6 }}>
                  <Text style={{ color: B.gray1, fontSize: 13, fontFamily: "DMSans_400Regular" }}>+ {a.label} — ${Number(a.price || 0).toLocaleString()}</Text>
                </View>
              ))}
              <DebugRow label="Deposit" value={`${business.schema?.pricing?.depositPercent || 0}%`} />
              <TouchableOpacity onPress={() => setRawOpen(o => !o)} style={{ paddingVertical: 4 }}>
                <Text style={{ color: pc, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{rawOpen ? "Hide" : "Show"} raw JSON</Text>
              </TouchableOpacity>
              {rawOpen && (
                <ScrollView horizontal style={{ maxHeight: 200 }}>
                  <Text style={{ color: B.gray2, fontSize: 11, fontFamily: "DMSans_400Regular" }}>{JSON.stringify(business.schema, null, 2)}</Text>
                </ScrollView>
              )}
              {onRebuildQuoteTool && (
                <TouchableOpacity onPress={onRebuildQuoteTool} style={{ paddingVertical: 4 }}>
                  <Text style={{ color: B.red, fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>Schema looks wrong? Rebuild</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Signing & Verification — enterprise e-signature settings. */}
        <View style={{ gap: 12 }}>
          <Text style={s.sectionTitle}>SIGNING & VERIFICATION</Text>
          <View style={{ gap: 6 }}>
            <Text style={s.formLabel}>Email for signing notifications</Text>
            <Text style={s.formHint}>Where we send a notification when a client signs a quote.</Text>
            <TextInput style={s.input} value={notificationEmail} onChangeText={setNotificationEmail} placeholder="you@yourbusiness.com" placeholderTextColor={B.gray3} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2, gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: B.gray1, fontSize: 15, fontFamily: "DMSans_400Regular" }}>Require SMS verification before signing</Text>
              <Text style={{ color: B.muted, fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2 }}>Recommended — verifies the signer&apos;s identity by text.</Text>
            </View>
            <Switch value={requireSms} onValueChange={setRequireSms} trackColor={{ true: pc, false: B.border }} thumbColor={B.white} />
          </View>
          <Text style={{ color: B.muted, fontSize: 12, fontFamily: "DMSans_400Regular" }}>Your signed documents are stored securely for a minimum of 7 years.</Text>
          <TouchableOpacity style={[s.btnSecondary, { borderColor: pc }]} onPress={() => Alert.alert("Coming soon", "Export of all signed records will be available here soon.")}>
            <Text style={[s.btnSecondaryText, { color: pc }]}>Export All Records</Text>
          </TouchableOpacity>
          {onViewSigningActivity && (
            <TouchableOpacity style={[s.btnSecondary, { borderColor: pc }]} onPress={onViewSigningActivity}>
              <Text style={[s.btnSecondaryText, { color: pc }]}>View Signing Activity</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={[s.btn, { backgroundColor: pc }]} onPress={onSavePress}>
          <Text style={[s.btnText, { color: ON_PRIMARY }]}>Save</Text>
        </TouchableOpacity>

        {/* Account — signed-in indicator + sign out at the very bottom (FIX 3 / FIX 8). */}
        {onSignOut && (
          <View style={{ gap: 10, alignItems: "center", marginTop: 8 }}>
            {currentUser?.username ? (
              <Text style={{ color: B.muted, fontSize: 13, fontFamily: "DMSans_400Regular" }}>Signed in as {currentUser.username}</Text>
            ) : null}
            <TouchableOpacity onPress={onSignOut} style={{ paddingVertical: 8 }}>
              <Text style={{ color: B.red, fontSize: 15, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>Sign out of {business.name}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <KitChatModal
        visible={kitOpen}
        onClose={() => setKitOpen(false)}
        primaryColor={pc}
        title="Kit"
        subtitle="Let's write your terms & conditions"
        systemPrompt={TC_SYSTEM}
        opener={`Hi! I'll help you write clear terms & conditions for ${name || business.name}. First — what trade or service do you provide?`}
        resultMarker="TERMS_READY:"
        onResult={(text) => { setTerms(text); setEditingTerms(true); setKitOpen(false); }}
      />

      {toast && (
        <View style={s.toast}>
          <Feather name="check" size={16} color={B.white} />
          <Text style={s.toastText}>Saved</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
