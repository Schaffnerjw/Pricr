import { Feather } from "@expo/vector-icons";
import { SafeAreaView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { B } from "../constants/brand";
import { s } from "../styles";

export function WelcomeScreen({
  onLogoTap, onGetStarted, onSignIn,
  showMasterEntry, masterInput, masterError, onMasterInputChange, onMasterCancel, onMasterLogin,
}: {
  onLogoTap: () => void; onGetStarted: () => void; onSignIn: () => void;
  showMasterEntry: boolean; masterInput: string; masterError: string;
  onMasterInputChange: (v: string) => void; onMasterCancel: () => void; onMasterLogin: () => void;
}) {
  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40, justifyContent: "space-between" }}>
        <View style={{ gap: 12 }}>
          <TouchableOpacity onPress={onLogoTap} activeOpacity={1}>
            <PricrLogo />
          </TouchableOpacity>
          <Text style={s.hero}>Close the job.{"\n"}On the spot.</Text>
          <Text style={[s.body, { marginTop: 4 }]}>Your quote tool, built around your business. Ready in under 2 minutes.</Text>
          {/* Static social proof for now — will pull live counts from Supabase later. */}
          <Text style={{ color: B.gray3, fontSize: 13, marginTop: 8, fontFamily: "DMSans_400Regular" }}>Joined by 500+ contractors across 20 trades</Text>
        </View>

        <View style={{ gap: 16 }}>
          {([
            { icon: "zap", text: "Set up in under 2 minutes" },
            { icon: "target", text: "Built around your exact business" },
            { icon: "users", text: "Kit handles the setup for you" },
          ] as const).map(f => (
            <View key={f.text} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Feather name={f.icon} size={22} color={B.blue} />
              <Text style={{ fontSize: 16, color: B.gray2, fontWeight: "500", fontFamily: "DMSans_500Medium" }}>{f.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 12 }}>
          <TouchableOpacity style={s.btn} onPress={onGetStarted}>
            <Text style={s.btnText}>Get Started</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnSecondary} onPress={onSignIn}>
            <Text style={s.btnSecondaryText}>Sign In</Text>
          </TouchableOpacity>
          <Text style={{ textAlign: "center", color: B.gray3, fontSize: 13, fontFamily: "DMSans_400Regular" }}>No credit card required</Text>
        </View>
      </View>

      {showMasterEntry && (
        <View style={s.masterOverlay}>
          <View style={s.masterCard}>
            <Text style={[s.h2, { marginBottom: 8 }]}>Support Access</Text>
            <TextInput
              style={s.input}
              placeholder="Enter master code"
              placeholderTextColor={B.gray3}
              value={masterInput}
              onChangeText={onMasterInputChange}
              onSubmitEditing={onMasterLogin}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              autoFocus
            />
            {masterError ? <Text style={{ color: B.red, fontSize: 13, marginTop: 8, fontFamily: "DMSans_400Regular" }}>{masterError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={onMasterCancel}>
                <Text style={s.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={onMasterLogin}>
                <Text style={s.btnText}>Enter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
