import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { getImportProgress } from "../storage";
import { s } from "../styles";
import { getContrastColor, ON_PRIMARY } from "../utils/colorUtils";

// First onboarding/rebuild screen: route the contractor to either Kit (chat-built schema) or Import
// (paste an existing price sheet). A contractor with a custom trade ("property management",
// "photography", "pool service") handles it inside Kit — they tell Kit what they do and Kit builds
// the tool from scratch via the same SCHEMA_DIFF pipeline that powers all other edits.
export function SetupChoiceScreen({ primaryColor, backgroundColor, onChooseWizard, onChooseImport, onResume, isReconfiguring, onCancel }: {
  primaryColor: string; backgroundColor?: string;
  onChooseWizard: () => void; onChooseImport: () => void; onResume?: () => void;
  isReconfiguring?: boolean; onCancel?: () => void;
}) {
  const txt = getContrastColor(backgroundColor || "#0A0E1A");
  const onPrimary = ON_PRIMARY;
  const [hasProgress, setHasProgress] = useState(false);

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
        </View>

        <Text style={{ color: txt, opacity: 0.6, fontSize: 13, textAlign: "center", fontFamily: "DMSans_400Regular" }}>
          You can always update your pricing later in Settings
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
