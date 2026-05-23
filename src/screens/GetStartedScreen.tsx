import { Feather } from "@expo/vector-icons";
import { SafeAreaView, Text, TouchableOpacity, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { B } from "../constants/brand";
import { s } from "../styles";

export function GetStartedScreen({ onCreateBusiness, onJoinAsRep, onBack }: {
  onCreateBusiness: () => void; onJoinAsRep: () => void; onBack: () => void;
}) {
  return (
    <SafeAreaView style={s.container}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40 }}>
        <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 8 }}>
          <Feather name="chevron-left" size={20} color={B.blue} />
          <Text style={{ color: B.blue, fontSize: 16, fontFamily: "DMSans_400Regular" }}>Back</Text>
        </TouchableOpacity>
        <PricrLogo />
        <Text style={[s.h2, { marginTop: 8 }]}>Get started</Text>
        <Text style={[s.body, { marginBottom: 32 }]}>Setting up your own business, or joining one you were invited to?</Text>

        <TouchableOpacity style={[s.configCard, { marginBottom: 16 }]} onPress={onCreateBusiness}>
          <Text style={s.configLabel}>BUSINESS OWNER</Text>
          <Text style={[s.h2, { marginTop: 4 }]}>Create a business</Text>
          <Text style={[s.body, { marginTop: 4 }]}>Set up your business and let Kit build your quote tool. You&apos;ll get a unique Business ID to invite your team.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.configCard} onPress={onJoinAsRep}>
          <Text style={s.configLabel}>TEAM MEMBER</Text>
          <Text style={[s.h2, { marginTop: 4 }]}>Join as a rep</Text>
          <Text style={[s.body, { marginTop: 4 }]}>Enter the Business ID your admin gave you to start quoting on their account.</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
