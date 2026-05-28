import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { getImportProgress } from "../storage";
import { s } from "../styles";
import { getContrastColor, ON_PRIMARY } from "../utils/colorUtils";

// First onboarding/rebuild screen: route the contractor to the right setup path for their pricing.
export function SetupChoiceScreen({ primaryColor, backgroundColor, onChooseWizard, onChooseImport, onChooseGeneric, onResume, isReconfiguring, onCancel }: {
  primaryColor: string; backgroundColor?: string;
  onChooseWizard: () => void; onChooseImport: () => void; onResume?: () => void;
  // ADDITIVE: a free-text "Other / Generic" entry — loads the agnostic Generic engine with the typed trade name.
  onChooseGeneric?: (tradeName: string) => void;
  isReconfiguring?: boolean; onCancel?: () => void;
}) {
  const txt = getContrastColor(backgroundColor || "#0A0E1A");
  const onPrimary = ON_PRIMARY;
  const [hasProgress, setHasProgress] = useState(false);
  const [genericOpen, setGenericOpen] = useState(false);
  const [genericName, setGenericName] = useState("");

  // Surface a "Resume setup" option if a half-finished import exists.
  useEffect(() => {
    getImportProgress<any>().then(p => setHasProgress(!!(p && p.phase && p.phase !== "paste")));
  }, []);

  const Card = ({ icon, title, subtitle, tag, onPress }: { icon: any; title: string; subtitle: string; tag: string; onPress: () => void }) => (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ backgroundColor: B.card, borderRadius: 18, borderWidth: 1.5, borderColor: primaryColor + "55", padding: 20, gap: 10 }}>
      <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: primaryColor, alignItems: "center", justifyContent: "center" }}>
        <Feather name={icon} size={22} color={onPrimary} />
      </View>
      <Text style={{ color: B.gray1, fontSize: 18, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{title}</Text>
      <Text style={{ color: B.gray2, fontSize: 14, lineHeight: 20, fontFamily: "DMSans_400Regular" }}>{subtitle}</Text>
      <View style={{ flexDirection: "row" }}>
        <View style={{ backgroundColor: primaryColor + "22", borderColor: primaryColor + "66", borderWidth: 1, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 11 }}>
          <Text style={{ color: primaryColor, fontSize: 11, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{tag}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[s.container, backgroundColor ? { backgroundColor } : null]}>
      {isReconfiguring && onCancel && (
        <TouchableOpacity onPress={onCancel} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingTop: 12, alignSelf: "flex-start" }}>
          <Feather name="chevron-left" size={20} color={primaryColor} />
          <Text style={{ color: primaryColor, fontSize: 16, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Cancel</Text>
        </TouchableOpacity>
      )}
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40, gap: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[s.kitAvatar, { backgroundColor: primaryColor }]}><Text style={[s.kitAvatarText, { color: onPrimary }]}>K</Text></View>
          <Text style={{ flex: 1, color: txt, fontSize: 18, fontWeight: "700", lineHeight: 25, fontFamily: "Syne_700Bold" }}>
            Let&apos;s build your quote tool. How would you like to set it up?
          </Text>
        </View>

        {hasProgress && onResume && (
          <TouchableOpacity onPress={onResume} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: primaryColor + "1A", borderColor: primaryColor, borderWidth: 1, borderRadius: 14, padding: 14 }}>
            <Feather name="rotate-ccw" size={18} color={primaryColor} />
            <Text style={{ flex: 1, color: txt, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Resume setup where you left off</Text>
            <Feather name="chevron-right" size={18} color={primaryColor} />
          </TouchableOpacity>
        )}

        <View style={{ gap: 14 }}>
          <Card icon="message-circle" title="Chat with Kit" subtitle="Answer a few quick questions and I'll build it for you" tag="~2 min" onPress={onChooseWizard} />
          <Card icon="upload-cloud" title="Import My Price Sheet" subtitle="Paste or upload your existing price list and I'll do the rest" tag="Recommended for detailed pricing" onPress={onChooseImport} />
          {onChooseGeneric && (
            <Card icon="grid" title="Other — set up a generic tool" subtitle="Tell me what you do and I'll start you with a flexible blank tool you can shape." tag="Fastest" onPress={() => { setGenericName(""); setGenericOpen(true); }} />
          )}
        </View>

        <Text style={{ color: txt, opacity: 0.6, fontSize: 13, textAlign: "center", fontFamily: "DMSans_400Regular" }}>
          You can always update your pricing later in Settings
        </Text>
      </ScrollView>

      {/* Custom-trade entry modal — feeds the agnostic Generic engine. */}
      <Modal visible={genericOpen} transparent animationType="fade" onRequestClose={() => setGenericOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }} onPress={() => setGenericOpen(false)}>
          <Pressable style={{ backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 18, padding: 22, gap: 14 }} onPress={() => {}}>
            <Text style={{ color: B.white, fontSize: 18, fontWeight: "800", fontFamily: "Syne_700Bold" }}>What kind of work do you do?</Text>
            <Text style={{ color: B.muted, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 19 }}>I&apos;ll start you with a blank tool you can shape — add line items, set rates, save your setup as a template anytime.</Text>
            <TextInput
              value={genericName} onChangeText={setGenericName} autoFocus
              placeholder="e.g. Property Management, Photography, Pool Service"
              placeholderTextColor={B.gray3}
              style={[s.input, { backgroundColor: B.midnight, color: B.white, borderColor: B.border }]}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[s.btnSecondary, { flex: 1, borderColor: B.border }]} onPress={() => setGenericOpen(false)}>
                <Text style={[s.btnSecondaryText, { color: B.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, { flex: 2, backgroundColor: primaryColor, opacity: genericName.trim() ? 1 : 0.4 }]}
                disabled={!genericName.trim()}
                onPress={() => { const v = genericName.trim(); setGenericOpen(false); onChooseGeneric?.(v); }}
              >
                <Text style={[s.btnText, { color: onPrimary }]}>Continue →</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
