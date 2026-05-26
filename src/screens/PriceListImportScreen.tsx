import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { API_URL, B } from "../constants/brand";
import { PRICE_LIST_IMPORT_PROMPT } from "../constants/prompts";
import { s } from "../styles";
import { QuoteSchema } from "../types";
import { ON_PRIMARY } from "../utils/colorUtils";
import { parseSchemaFromResponse } from "../utils/helpers";
import { quoteSchemaFromImport } from "../utils/schemaExtractor";

const TIPS = ["Reading your price list...", "Building your fields...", "Setting up your pricing...", "Organizing your services...", "Almost ready..."];

const PLACEHOLDER = `Paste your prices here...

Examples of what works:
- Pressure treated deck: $20/sq ft
- Composite: $28/sq ft
- Railing: $25/lf
- Permit: $200 flat

Or paste a full price sheet — product tables, categories, everything.`;

export function PriceListImportScreen({ primaryColor, backgroundColor, initialText, onComplete, onBack }: {
  primaryColor: string; backgroundColor?: string; initialText?: string;
  onComplete: (schema: QuoteSchema, rawText: string) => void; onBack: () => void;
}) {
  const onPrimary = ON_PRIMARY;
  const [text, setText] = useState(initialText || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tip, setTip] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  // Rotating tips while the AI processes.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setTip(t => (t + 1) % TIPS.length);
        Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, 3000);
    return () => clearInterval(id);
  }, [loading]);

  const build = async () => {
    if (!text.trim() || loading) return;
    setLoading(true); setError(""); setTip(0);
    try {
      console.log("[Import] sending price list, length:", text.length);
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, system: PRICE_LIST_IMPORT_PROMPT, messages: [{ role: "user", content: `Price list:\n\n${text}` }] }),
      });
      const data = await response.json();
      const raw = data?.content?.[0]?.text;
      console.log("[Import] raw response:", typeof raw === "string" ? raw.substring(0, 500) : JSON.stringify(data));
      if (typeof raw !== "string") throw new Error("no response");
      const parsed = parseSchemaFromResponse(raw); // strips ```json fences + extracts the {...} block
      console.log("[Import] parsed:", JSON.stringify(parsed)?.substring(0, 400));
      const schema = quoteSchemaFromImport(parsed);
      if (!schema || schema.fields.length === 0) throw new Error("could not build a tool from that");
      console.log("[Import] built schema with", schema.fields.length, "fields,", schema.addOns.length, "add-ons");
      setLoading(false);
      onComplete(schema, text);
    } catch (e) {
      console.error("[Import] error:", e instanceof Error ? e.message : String(e));
      setLoading(false);
      setError("We couldn't read that price list. Check it and try again, or use Chat with Kit instead.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, backgroundColor ? { backgroundColor } : null]}>
        <View style={s.centered}>
          <PricrLogo />
          <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 36 }} />
          <Animated.Text style={{ opacity: fade, color: primaryColor, fontSize: 16, marginTop: 24, fontFamily: "DMSans_600SemiBold", textAlign: "center" }}>{TIPS[tip]}</Animated.Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, backgroundColor ? { backgroundColor } : null]}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={onBack} style={[s.navBack, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
          <Feather name="chevron-left" size={18} color={primaryColor} />
          <Text style={[s.navBackText, { color: primaryColor }]}>Back</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Import Prices</Text>
        <View style={{ width: 60 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View style={[s.kitAvatar, { backgroundColor: primaryColor }]}><Text style={[s.kitAvatarText, { color: onPrimary }]}>K</Text></View>
            <Text style={{ flex: 1, color: B.gray1, fontSize: 15, lineHeight: 22, fontFamily: "DMSans_400Regular" }}>
              Paste your price list below — any format works. Tables, bullet points, spreadsheet text — I&apos;ll figure it out and build your complete quote tool.
            </Text>
          </View>

          <TextInput
            style={{ minHeight: 280, backgroundColor: B.card, borderRadius: 12, borderWidth: 1, borderColor: B.border, padding: 14, color: B.white, fontSize: 15, lineHeight: 22, textAlignVertical: "top", fontFamily: "DMSans_400Regular" }}
            value={text} onChangeText={setText} placeholder={PLACEHOLDER} placeholderTextColor={B.gray3} multiline
          />
          <Text style={{ color: B.muted, fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "right" }}>{text.length} characters</Text>
          {error ? <Text style={{ color: B.red, fontSize: 14, fontFamily: "DMSans_400Regular" }}>{error}</Text> : null}

          <TouchableOpacity disabled={!text.trim()} style={[s.btn, { backgroundColor: primaryColor }, !text.trim() && { opacity: 0.4 }]} onPress={build}>
            <Text style={[s.btnText, { color: onPrimary }]}>Build My Tool →</Text>
          </TouchableOpacity>
          <Text style={{ color: B.muted, fontSize: 12, textAlign: "center", fontFamily: "DMSans_400Regular" }}>Your pricing stays private — it&apos;s only used to build your tool</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
