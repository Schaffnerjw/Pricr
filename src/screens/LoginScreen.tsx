import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { PinKeypad } from "../components/PinKeypad";
import { B } from "../constants/brand";
import { s } from "../styles";

// Primary login is Username + PIN. A Business-ID fallback covers legacy accounts created before
// usernames existed (they're then prompted to set a username on the next screen).
export function LoginScreen({ username, code, pin, error, onUsernameChange, onCodeChange, onPinChange, onBack, onSignIn }: {
  username: string; code: string; pin: string; error: string;
  onUsernameChange: (v: string) => void; onCodeChange: (v: string) => void; onPinChange: (v: string) => void;
  onBack: () => void; onSignIn: (mode: "username" | "code") => void;
}) {
  const [mode, setMode] = useState<"username" | "code">("username");
  const idOk = mode === "username" ? !!username.trim() : !!code.trim();
  const disabled = !idOk || pin.length < 4;

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 60, gap: 8 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 8 }}>
            <Feather name="chevron-left" size={20} color={B.blue} />
            <Text style={{ color: B.blue, fontSize: 16, fontFamily: "DMSans_400Regular" }}>Back</Text>
          </TouchableOpacity>
          <PricrLogo />
          <Text style={[s.h2, { marginTop: 8 }]}>Sign In</Text>
          <Text style={[s.body, { marginBottom: 24 }]}>{mode === "username" ? "Enter your username and PIN." : "Enter your Business ID and PIN."}</Text>

          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>{mode === "username" ? "Username" : "Business ID"}</Text>
            {mode === "username" ? (
              <TextInput style={s.input} placeholder="Your username" placeholderTextColor={B.gray3} value={username} onChangeText={onUsernameChange} autoCapitalize="none" autoCorrect={false} />
            ) : (
              <TextInput style={s.input} placeholder="e.g. ABC123" placeholderTextColor={B.gray3} value={code} onChangeText={onCodeChange} autoCapitalize="characters" />
            )}
          </View>

          <View style={{ gap: 10, marginBottom: 20 }}>
            <Text style={s.formLabel}>PIN</Text>
            <PinKeypad value={pin} onChange={onPinChange} />
          </View>

          {error ? <Text style={{ color: B.red, fontSize: 14, marginBottom: 8, fontFamily: "DMSans_400Regular" }}>{error}</Text> : null}

          <TouchableOpacity style={[s.btn, disabled && { opacity: 0.4 }]} onPress={() => onSignIn(mode)} disabled={disabled}>
            <Text style={s.btnText}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ marginTop: 14, alignItems: "center" }} onPress={() => { setMode(m => m === "username" ? "code" : "username"); onPinChange(""); }}>
            <Text style={{ color: B.blue, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>
              {mode === "username" ? "Sign in with Business ID instead" : "Sign in with username instead"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
