import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { PasswordField } from "../components/PasswordField";
import { B } from "../constants/brand";
import { s } from "../styles";
import { resolveBusinessCodeByUsername } from "../storage";
import { logger } from "../utils/logger";

declare const __DEV__: boolean;

// Primary login is Username + password. A Business-ID fallback covers legacy accounts created before
// usernames existed (they're then prompted to set a username on the next screen).
export function LoginScreen({ username, code, pin, error, staySignedIn, onToggleStay, onUsernameChange, onCodeChange, onPinChange, onBack, onSignIn }: {
  username: string; code: string; pin: string; error: string;
  staySignedIn: boolean; onToggleStay: (v: boolean) => void;
  onUsernameChange: (v: string) => void; onCodeChange: (v: string) => void; onPinChange: (v: string) => void;
  onBack: () => void; onSignIn: (mode: "username" | "code") => void;
}) {
  const [mode, setMode] = useState<"username" | "code">("username");
  const idOk = mode === "username" ? !!username.trim() : !!code.trim();
  const disabled = !idOk || !pin;

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
          <Text style={[s.body, { marginBottom: 24 }]}>{mode === "username" ? "Enter your username and password." : "Enter your Business ID and password."}</Text>

          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>{mode === "username" ? "Username" : "Business ID"}</Text>
            {mode === "username" ? (
              <TextInput style={s.input} placeholder="Your username" placeholderTextColor={B.gray3} value={username} onChangeText={onUsernameChange} autoCapitalize="none" autoCorrect={false} />
            ) : (
              <TextInput style={s.input} placeholder="e.g. ABC123" placeholderTextColor={B.gray3} value={code} onChangeText={onCodeChange} autoCapitalize="characters" />
            )}
          </View>

          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Password</Text>
            <PasswordField value={pin} onChange={onPinChange} placeholder="Your password" onSubmitEditing={() => { if (idOk && pin) onSignIn(mode); }} />
          </View>

          {/* Stay signed in on this device — default ON (FIX 8) */}
          <TouchableOpacity onPress={() => onToggleStay(!staySignedIn)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, marginBottom: 16 }}>
            <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: staySignedIn ? B.blue : B.gray3, backgroundColor: staySignedIn ? B.blue : "transparent", alignItems: "center", justifyContent: "center" }}>
              {staySignedIn && <Feather name="check" size={15} color={B.white} />}
            </View>
            <Text style={{ color: B.gray1, fontSize: 15, fontFamily: "DMSans_400Regular" }}>Stay signed in on this device</Text>
          </TouchableOpacity>

          {error ? <Text style={{ color: B.red, fontSize: 14, marginBottom: 8, fontFamily: "DMSans_400Regular" }}>{error}</Text> : null}

          <TouchableOpacity style={[s.btn, disabled && { opacity: 0.4 }]} onPress={() => onSignIn(mode)} disabled={disabled}>
            <Text style={s.btnText}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ marginTop: 14, alignItems: "center" }} onPress={() => { setMode(m => m === "username" ? "code" : "username"); onPinChange(""); }}>
            <Text style={{ color: B.blue, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>
              {mode === "username" ? "Sign in with Business ID instead" : "Sign in with username instead"}
            </Text>
          </TouchableOpacity>

          {/* Dev-only RPC diagnostic — logs the resolve result without exposing anything in the UI. */}
          {__DEV__ && (
            <TouchableOpacity
              style={{ marginTop: 18, alignItems: "center" }}
              onPress={async () => {
                try { const r = await resolveBusinessCodeByUsername(username || ""); logger.debug("[Login] Test RPC result:", r ? "resolved" : "null"); }
                catch (e) { logger.error("[Login] Test RPC error:", e instanceof Error ? e.message : String(e)); }
              }}
            >
              <Text style={{ color: B.gray3, fontSize: 12, fontFamily: "DMSans_400Regular" }}>Test RPC (dev)</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
