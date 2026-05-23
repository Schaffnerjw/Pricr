import { ActivityIndicator, SafeAreaView, Text, View } from "react-native";
import PricrLogo from "../components/PricrLogo";
import { s } from "../styles";

export function BuildingScreen({ primaryColor }: { primaryColor: string }) {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.centered}>
        <PricrLogo />
        <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 40 }} />
        <Text style={[s.h2, { marginTop: 24 }]}>Give us just a second.</Text>
        <Text style={[s.body, { textAlign: "center", marginTop: 8 }]}>Kit is building your custom tool right now.</Text>
      </View>
    </SafeAreaView>
  );
}
