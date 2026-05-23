import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { B } from "../constants/brand";
import { s } from "../styles";

export function RepJoinScreen({ name, code, error, onNameChange, onCodeChange, onBack, onJoin }: {
  name: string; code: string; error: string;
  onNameChange: (v: string) => void; onCodeChange: (v: string) => void;
  onBack: () => void; onJoin: () => void;
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
          <Text style={[s.h2, { marginTop: 8 }]}>Join Your Team</Text>
          <Text style={[s.body, { marginBottom: 24 }]}>Enter your name and the Business ID your admin gave you.</Text>
          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={s.formLabel}>Your Name</Text>
            <TextInput style={s.input} placeholder="First and last name" placeholderTextColor={B.gray3} value={name} onChangeText={onNameChange} />
          </View>
          <View style={{ gap: 6, marginBottom: 24 }}>
            <Text style={s.formLabel}>Business ID</Text>
            <TextInput style={s.input} placeholder="Get this from your admin" placeholderTextColor={B.gray3} value={code} onChangeText={onCodeChange} autoCapitalize="characters" />
          </View>
          {error ? <Text style={{ color: B.red, fontSize: 14, marginBottom: 8, fontFamily: "DMSans_400Regular" }}>{error}</Text> : null}
          <TouchableOpacity style={s.btn} onPress={onJoin}><Text style={s.btnText}>Join</Text></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
