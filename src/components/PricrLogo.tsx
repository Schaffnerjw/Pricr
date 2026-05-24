import { Text } from "react-native";
import { B } from "../constants/brand";

export default function PricrLogo({ size = 34 }: { size?: number }) {
  return (
    <Text style={{ fontSize: size, fontWeight: "800", fontFamily: "Syne_800ExtraBold", color: B.white, letterSpacing: -0.5 }}>
      Pricr<Text style={{ color: B.blue }}>.</Text>
    </Text>
  );
}
