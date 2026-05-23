import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { B } from "../constants/brand";
import { s } from "../styles";

export function SignupScreen({ bizName, name, pin, error, onBizNameChange, onNameChange, onPinChange, onBack, onContinue }: {
  bizName: string; name: string; pin: string; error: string;
  onBizNameChange: (v: string) => void; onNameChange: (v: string) => void; onPinChange: (v: string) => void;
  onBack: () => void; onContinue: () => void;
}) {
  const disabled = !bizName || !name || !pin;
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 60, gap: 8 }}>
          <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 8 }}>
            <Feather name="chevron-left" size={20} color={B.blue} />
            <Text style={{ color: B.blue, fontSize: 16, fontFamily: "DMSans_400Regular" }}>Back</Text>
          </TouchableOpacity>
          <PricrLogo />
          <Text style={[s.h2, { marginTop: 8 }]}>Create Your Account</Text>
          <Text style={[s.body, { marginBottom: 24 }]}>Set up your business on Pricr. Takes about 2 minutes.</Text>

          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Business Name</Text>
            <TextInput style={s.input} placeholder="Your company name" placeholderTextColor={B.gray3} value={bizName} onChangeText={onBizNameChange} />
          </View>
          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Your Name</Text>
            <TextInput style={s.input} placeholder="First and last name" placeholderTextColor={B.gray3} value={name} onChangeText={onNameChange} />
          </View>
          <View style={{ gap: 6, marginBottom: 24 }}>
            <Text style={s.formLabel}>Admin PIN</Text>
            <Text style={s.formHint}>You will use this to sign in. Keep it somewhere safe.</Text>
            <TextInput style={s.input} placeholder="Create a 4+ digit PIN" placeholderTextColor={B.gray3} value={pin} onChangeText={onPinChange} secureTextEntry keyboardType="numeric" />
          </View>

          {error ? <Text style={{ color: B.red, fontSize: 14, marginBottom: 8, fontFamily: "DMSans_400Regular" }}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.btn, disabled && { opacity: 0.4 }]}
            onPress={onContinue}
            disabled={disabled}
          >
            <Text style={s.btnText}>Continue</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
