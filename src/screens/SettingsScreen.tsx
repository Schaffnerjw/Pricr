import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Image, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { B, DEFAULT_BRAND } from "../constants/brand";
import { s } from "../styles";
import { BrandConfig, Business } from "../types";
import { isValidHex } from "../utils/color";

const BG_PRESETS = [
  { label: "Dark Navy", hex: "#0A0E1A" },
  { label: "Deep Charcoal", hex: "#1C1C1E" },
  { label: "Pure Black", hex: "#000000" },
];

// Admin-only brand customization. Edits a local copy, previews live, and saves to the business config.
export function SettingsScreen({ business, onSave, onBack, onPickLogo }: {
  business: Business;
  onSave: (update: { name: string; brand: BrandConfig }) => void;
  onBack: () => void;
  onPickLogo: () => Promise<string | null>;
}) {
  const [name, setName] = useState(business.name);
  const [logoUri, setLogoUri] = useState<string | null>(business.brand.logoUri);
  const [primary, setPrimary] = useState(business.brand.primaryColor || DEFAULT_BRAND.primaryColor);
  const [secondary, setSecondary] = useState(business.brand.secondaryColor || DEFAULT_BRAND.secondaryColor);
  const [background, setBackground] = useState(business.brand.backgroundColor || DEFAULT_BRAND.backgroundColor);
  const [toast, setToast] = useState(false);

  const pc = isValidHex(primary) ? primary : DEFAULT_BRAND.primaryColor;
  const sc = isValidHex(secondary) ? secondary : DEFAULT_BRAND.secondaryColor;
  const bg = isValidHex(background) ? background : DEFAULT_BRAND.backgroundColor;
  const norm = (v: string) => v.startsWith("#") ? v : "#" + v;

  const pickLogo = async () => { const uri = await onPickLogo(); if (uri) setLogoUri(uri); };
  const resetDefaults = () => { setPrimary(DEFAULT_BRAND.primaryColor); setSecondary(DEFAULT_BRAND.secondaryColor); setBackground(DEFAULT_BRAND.backgroundColor); };
  const save = () => {
    onSave({ name: name.trim() || business.name, brand: { ...business.brand, logoUri, primaryColor: pc, secondaryColor: sc, backgroundColor: bg } });
    setToast(true);
    setTimeout(() => setToast(false), 1600);
  };

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

      <ScrollView contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
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
              <Text style={{ color: B.gray3, fontSize: 11, fontFamily: "DMSans_400Regular" }}>Preview</Text>
            </View>
            <Text style={{ color: B.white, fontSize: 26, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }}>$2,400</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: pc, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                <Text style={{ color: B.white, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Primary</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: sc }}>
                <Text style={{ color: sc, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Secondary</Text>
              </View>
            </View>
          </View>
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

        <TouchableOpacity style={[s.btn, { backgroundColor: pc }]} onPress={save}>
          <Text style={s.btnText}>Save</Text>
        </TouchableOpacity>
      </ScrollView>

      {toast && (
        <View style={s.toast}>
          <Feather name="check" size={16} color={B.white} />
          <Text style={s.toastText}>Brand updated</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
