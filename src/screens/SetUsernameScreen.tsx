import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { PasswordField } from "../components/PasswordField";
import { B } from "../constants/brand";
import { s } from "../styles";

// Shown after a legacy (Business-ID) login when the account has no username yet — they pick a
// username + password now so future sign-ins are username + password.
export function SetUsernameScreen({ username, pin, confirm, error, onUsernameChange, onPinChange, onConfirmChange, onSave }: {
  username: string; pin: string; confirm: string; error: string;
  onUsernameChange: (v: string) => void; onPinChange: (v: string) => void; onConfirmChange: (v: string) => void; onSave: () => void;
}) {
  const disabled = !username.trim() || pin.length < 8 || pin !== confirm;
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 60, gap: 8 }} keyboardShouldPersistTaps="handled">
          <PricrLogo />
          <Text style={[s.h2, { marginTop: 8 }]}>Set Up Your Login</Text>
          <Text style={[s.body, { marginBottom: 24 }]}>Choose a username and PIN. You’ll use these to sign in from now on.</Text>
          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Username</Text>
            <TextInput style={s.input} placeholder="Choose a username" placeholderTextColor={B.gray3} value={username} onChangeText={onUsernameChange} autoCapitalize="none" autoCorrect={false} />
          </View>
          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Create a Password</Text>
            <Text style={s.formHint}>At least 8 characters.</Text>
            <PasswordField value={pin} onChange={onPinChange} placeholder="Create a password" />
          </View>
          <View style={{ gap: 6, marginBottom: 24 }}>
            <Text style={s.formLabel}>Confirm Password</Text>
            <PasswordField value={confirm} onChange={onConfirmChange} placeholder="Re-enter your password" onSubmitEditing={() => { if (!disabled) onSave(); }} />
          </View>
          {error ? <Text style={{ color: B.red, fontSize: 14, marginBottom: 8, fontFamily: "DMSans_400Regular" }}>{error}</Text> : null}
          <TouchableOpacity style={[s.btn, disabled && { opacity: 0.4 }]} onPress={onSave} disabled={disabled}><Text style={s.btnText}>Save & Continue</Text></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
