import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { PinKeypad } from "../components/PinKeypad";
import { B } from "../constants/brand";
import { s } from "../styles";

export function RepJoinScreen({ name, code, username, pin, error, onNameChange, onCodeChange, onUsernameChange, onPinChange, onBack, onJoin }: {
  name: string; code: string; username: string; pin: string; error: string;
  onNameChange: (v: string) => void; onCodeChange: (v: string) => void; onUsernameChange: (v: string) => void; onPinChange: (v: string) => void;
  onBack: () => void; onJoin: () => void;
}) {
  const disabled = !name.trim() || !code.trim() || !username.trim() || pin.length < 4;
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 60, gap: 8 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 8 }}>
            <Feather name="chevron-left" size={20} color={B.blue} />
            <Text style={{ color: B.blue, fontSize: 16, fontFamily: "DMSans_400Regular" }}>Back</Text>
          </TouchableOpacity>
          <PricrLogo />
          <Text style={[s.h2, { marginTop: 8 }]}>Join Your Team</Text>
          <Text style={[s.body, { marginBottom: 24 }]}>Enter the Business ID your admin gave you, then create your own login.</Text>
          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Business ID</Text>
            <TextInput style={s.input} placeholder="Get this from your admin" placeholderTextColor={B.gray3} value={code} onChangeText={onCodeChange} autoCapitalize="characters" />
          </View>
          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Your Name</Text>
            <TextInput style={s.input} placeholder="First and last name" placeholderTextColor={B.gray3} value={name} onChangeText={onNameChange} />
          </View>
          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Choose a Username</Text>
            <TextInput style={s.input} placeholder="You'll use this to sign in" placeholderTextColor={B.gray3} value={username} onChangeText={onUsernameChange} autoCapitalize="none" autoCorrect={false} />
          </View>
          <View style={{ gap: 10, marginBottom: 24 }}>
            <Text style={s.formLabel}>Create a PIN</Text>
            <Text style={s.formHint}>4–6 digits.</Text>
            <PinKeypad value={pin} onChange={onPinChange} />
          </View>
          {error ? <Text style={{ color: B.red, fontSize: 14, marginBottom: 8, fontFamily: "DMSans_400Regular" }}>{error}</Text> : null}
          <TouchableOpacity style={[s.btn, disabled && { opacity: 0.4 }]} onPress={onJoin} disabled={disabled}><Text style={s.btnText}>Join</Text></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
