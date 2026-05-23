import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { B } from "../constants/brand";
import { s } from "../styles";

export function LoginScreen({ code, pin, error, onCodeChange, onPinChange, onBack, onSignIn }: {
  code: string; pin: string; error: string;
  onCodeChange: (v: string) => void; onPinChange: (v: string) => void;
  onBack: () => void; onSignIn: () => void;
}) {
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 60, gap: 8 }}>
          <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 8 }}>
            <Feather name="chevron-left" size={20} color={B.blue} />
            <Text style={{ color: B.blue, fontSize: 16, fontFamily: "DMSans_400Regular" }}>Back</Text>
          </TouchableOpacity>
          <PricrLogo />
          <Text style={[s.h2, { marginTop: 8 }]}>Admin Sign In</Text>
          <Text style={[s.body, { marginBottom: 24 }]}>Enter your Business ID and PIN.</Text>
          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Business ID</Text>
            <TextInput style={s.input} placeholder="e.g. ABC123" placeholderTextColor={B.gray3} value={code} onChangeText={onCodeChange} autoCapitalize="characters" />
          </View>
          <View style={{ gap: 6, marginBottom: 24 }}>
            <Text style={s.formLabel}>PIN</Text>
            <TextInput style={s.input} placeholder="Your admin PIN" placeholderTextColor={B.gray3} value={pin} onChangeText={onPinChange} secureTextEntry keyboardType="numeric" />
          </View>
          {error ? <Text style={{ color: B.red, fontSize: 14, marginBottom: 8, fontFamily: "DMSans_400Regular" }}>{error}</Text> : null}
          <TouchableOpacity style={s.btn} onPress={onSignIn}><Text style={s.btnText}>Sign In</Text></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
