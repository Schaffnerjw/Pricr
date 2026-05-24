import { Dispatch, SetStateAction, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { B, DEFAULT_BRAND } from "../constants/brand";
import { s } from "../styles";
import { BrandConfig } from "../types";
import { isValidHex } from "../utils/color";

export function SignupBrandScreen({ brand, bizName, onBrandChange, onPickLogo, onCreateAccount, onBack }: {
  brand: BrandConfig; bizName: string;
  onBrandChange: Dispatch<SetStateAction<BrandConfig>>;
  onPickLogo: () => void; onCreateAccount: (brandConfigured: boolean) => void; onBack: () => void;
}) {
  const [logoSkipped, setLogoSkipped] = useState(false);
  const [colorsSkipped, setColorsSkipped] = useState(false);
  const previewColor = isValidHex(brand.primaryColor) ? brand.primaryColor : "#2979FF";
  const secondaryColor = isValidHex(brand.secondaryColor) ? brand.secondaryColor : "#00E5FF";
  // Branding counts as configured only if they added a logo and didn't skip colors.
  const brandConfigured = !!brand.logoUri && !colorsSkipped;
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 48, gap: 8 }}>
          <PricrLogo />
          <Text style={[s.h2, { marginTop: 8 }]}>Brand your quotes</Text>
          <Text style={[s.body, { marginBottom: 24 }]}>This is what your customers will see on their quote. Make it yours.</Text>

          <View style={{ gap: 6, marginBottom: 20 }}>
            <Text style={s.formLabel}>Logo</Text>
            <Text style={s.formHint}>Recommended: 400 x 120px PNG with transparent background. Wide format works best.</Text>
            <TouchableOpacity style={s.logoUploadBtn} onPress={() => { setLogoSkipped(false); onPickLogo(); }}>
              {brand.logoUri ? (
                <Image source={{ uri: brand.logoUri }} style={{ height: 48, width: "100%" }} resizeMode="contain" />
              ) : (
                <Text style={s.logoUploadText}>Tap to upload logo</Text>
              )}
            </TouchableOpacity>
            {brand.logoUri ? (
              <TouchableOpacity onPress={() => onBrandChange(b => ({ ...b, logoUri: null }))}>
                <Text style={{ color: B.red, fontSize: 13, marginTop: 4 }}>Remove logo</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setLogoSkipped(true)}>
                <Text style={{ color: logoSkipped ? B.gray3 : B.blue, fontSize: 13, marginTop: 4, fontFamily: "DMSans_600SemiBold" }}>
                  {logoSkipped ? "Skipped — add your logo later in Settings" : "Skip for now"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ gap: 10, marginBottom: 16 }}>
            <Text style={s.formLabel}>Brand Colors</Text>
            <Text style={s.formHint}>Primary drives buttons & headers; secondary is a supporting accent. Enter hex codes.</Text>
            <View style={s.setColorRow}>
              <View style={[s.setSwatch, { backgroundColor: previewColor }]} />
              <TextInput style={s.setHexInput} placeholder="#2979FF · Primary" placeholderTextColor={B.gray3} value={brand.primaryColor}
                onChangeText={v => { setColorsSkipped(false); onBrandChange(b => ({ ...b, primaryColor: v.startsWith("#") ? v : "#" + v })); }}
                autoCapitalize="characters" maxLength={7} />
            </View>
            <View style={s.setColorRow}>
              <View style={[s.setSwatch, { backgroundColor: secondaryColor }]} />
              <TextInput style={s.setHexInput} placeholder="#00E5FF · Secondary" placeholderTextColor={B.gray3} value={brand.secondaryColor}
                onChangeText={v => { setColorsSkipped(false); onBrandChange(b => ({ ...b, secondaryColor: v.startsWith("#") ? v : "#" + v })); }}
                autoCapitalize="characters" maxLength={7} />
            </View>
            <TouchableOpacity onPress={() => { setColorsSkipped(true); onBrandChange(b => ({ ...b, primaryColor: DEFAULT_BRAND.primaryColor, secondaryColor: DEFAULT_BRAND.secondaryColor, backgroundColor: DEFAULT_BRAND.backgroundColor })); }}>
              <Text style={{ color: colorsSkipped ? B.gray3 : B.blue, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>
                {colorsSkipped ? "Using Pricr colors — customize later in Settings" : "Skip for now (use Pricr colors)"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Tagline <Text style={s.formHint}>(optional)</Text></Text>
            <TextInput style={s.input} placeholder="e.g. Northeast Ohio's #1 Christmas Light Installer" placeholderTextColor={B.gray3} value={brand.tagline} onChangeText={v => onBrandChange(b => ({ ...b, tagline: v }))} />
          </View>

          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Business Phone <Text style={s.formHint}>(optional)</Text></Text>
            <TextInput style={s.input} placeholder="(330) 555-0100" placeholderTextColor={B.gray3} value={brand.phone} onChangeText={v => onBrandChange(b => ({ ...b, phone: v }))} keyboardType="phone-pad" />
          </View>

          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Business Email <Text style={s.formHint}>(optional)</Text></Text>
            <TextInput style={s.input} placeholder="hello@yourbusiness.com" placeholderTextColor={B.gray3} value={brand.email} onChangeText={v => onBrandChange(b => ({ ...b, email: v }))} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={{ gap: 6, marginBottom: 24 }}>
            <Text style={s.formLabel}>Business Address <Text style={s.formHint}>(optional)</Text></Text>
            <TextInput style={s.input} placeholder="123 Main St, Cleveland, OH 44101" placeholderTextColor={B.gray3} value={brand.address} onChangeText={v => onBrandChange(b => ({ ...b, address: v }))} />
          </View>

          <View style={[s.colorPreviewCard, { borderColor: previewColor + "40" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              {brand.logoUri ? (
                <Image source={{ uri: brand.logoUri }} style={{ height: 32, width: 120 }} resizeMode="contain" />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: "700", color: previewColor, fontFamily: "DMSans_700Bold" }}>{bizName || "Your Business"}</Text>
              )}
              <Text style={{ fontSize: 12, color: B.gray3, fontFamily: "DMSans_400Regular" }}>Quote Preview</Text>
            </View>
            <Text style={{ fontSize: 24, fontWeight: "800", color: previewColor, fontFamily: "DMSans_700Bold", marginTop: 8 }}>$2,400</Text>
            {brand.phone || brand.email ? (
              <Text style={{ fontSize: 11, color: B.gray3, marginTop: 4, fontFamily: "DMSans_400Regular" }}>{brand.phone}{brand.phone && brand.email ? " · " : ""}{brand.email}</Text>
            ) : null}
          </View>

          <TouchableOpacity style={[s.btn, { backgroundColor: previewColor, marginTop: 16 }]} onPress={() => onCreateAccount(brandConfigured)}>
            <Text style={s.btnText}>Create Account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnSecondary} onPress={onBack}>
            <Text style={s.btnSecondaryText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
