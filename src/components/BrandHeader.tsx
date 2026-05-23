import { StatusBar } from "expo-status-bar";
import { Image, Text, View } from "react-native";
import { B } from "../constants/brand";
import { wl } from "../styles";
import { Business } from "../types";

export function BrandHeader({ business, right }: { business: Business; right?: React.ReactNode }) {
  const brand = business.brand;
  return (
    <View style={[wl.header, { borderBottomColor: B.border }]}>
      {/* App background is always B.midnight (dark), so the status bar is always light. */}
      <StatusBar style="light" />
      <View style={wl.headerLeft}>
        {brand.logoUri ? (
          <Image source={{ uri: brand.logoUri }} style={wl.logo} resizeMode="contain" />
        ) : (
          <Text style={[wl.bizName, { color: brand.primaryColor }]}>{business.name}</Text>
        )}
        {brand.tagline ? <Text style={wl.tagline}>{brand.tagline}</Text> : null}
      </View>
      {right && <View style={wl.headerRight}>{right}</View>}
    </View>
  );
}
