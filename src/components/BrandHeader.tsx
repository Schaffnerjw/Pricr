import { StatusBar } from "expo-status-bar";
import { Image, Text, View } from "react-native";
import { B } from "../constants/brand";
import { wl } from "../styles";
import { Business } from "../types";
import { getBrandPalette, isReadable } from "../utils/colorUtils";

export function BrandHeader({ business, right }: { business: Business; right?: React.ReactNode }) {
  const brand = business.brand;
  // FIX 14: keep the brand name readable regardless of background. Prefer the brand's primary color,
  // but if it doesn't contrast with this screen's background, fall back to the auto-contrast text color.
  const pal = getBrandPalette(business);
  const nameColor = isReadable(brand.primaryColor || pal.primary, pal.background) ? (brand.primaryColor || pal.primary) : pal.text;
  return (
    <View style={[wl.header, { borderBottomColor: B.border }]}>
      {/* App background is always dark by default, so the status bar is light. */}
      <StatusBar style="light" />
      <View style={wl.headerLeft}>
        {brand.logoUri ? (
          <Image source={{ uri: brand.logoUri }} style={wl.logo} resizeMode="contain" />
        ) : (
          <Text style={[wl.bizName, { color: nameColor }]}>{business.name}</Text>
        )}
        {brand.tagline ? <Text style={[wl.tagline, { color: pal.textMuted }]}>{brand.tagline}</Text> : null}
      </View>
      {right && <View style={wl.headerRight}>{right}</View>}
    </View>
  );
}
