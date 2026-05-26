import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, LayoutAnimation, Platform, ScrollView, Text, TouchableOpacity, UIManager, View } from "react-native";
import { B } from "../constants/brand";
import { QuoteSchema } from "../types";
import { fieldRate } from "../utils/quote";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Compact, collapsible card shown below the Kit chat during onboarding. Updates in real time as the
// schema builds so the user watches their quote tool come to life. Dark card, primary-color accents.
export function SchemaPreviewCard({ schema, primaryColor, extracting }: {
  schema: QuoteSchema;
  primaryColor: string;
  extracting?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const pulse = useRef(new Animated.Value(0)).current;
  const fields = schema?.fields || [];
  const addOns = schema?.addOns || [];
  const pricing = schema?.pricing || {};
  const deposit = pricing.depositPercent || 0;
  const itemCount = fields.length + addOns.length;

  // "building…" pulse while an extraction is in flight.
  useEffect(() => {
    if (!extracting) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [extracting]);

  // Animate layout when new items arrive.
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
  }, [itemCount, schema?.trade, deposit]);

  const rateText = (f: any): string => {
    if (f.type === "selector" && f.options?.length) return f.options.join(" / ");
    const r = fieldRate(f, pricing);
    return r || "rate pending";
  };

  return (
    <View style={{ backgroundColor: B.card, borderTopWidth: 1, borderColor: B.border, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="tool" size={14} color={primaryColor} />
          <Text style={{ color: B.gray1, fontSize: 13, fontWeight: "800", fontFamily: "Syne_700Bold" }}>
            {schema?.trade ? schema.trade : "Your quote tool"}
          </Text>
          {extracting && (
            <Animated.View style={{ flexDirection: "row", alignItems: "center", gap: 5, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: primaryColor }} />
              <Text style={{ color: B.muted, fontSize: 11, fontFamily: "DMSans_400Regular" }}>building…</Text>
            </Animated.View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {itemCount > 0 && <Text style={{ color: B.muted, fontSize: 11, fontFamily: "DMSans_400Regular" }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</Text>}
          <Feather name={open ? "chevron-down" : "chevron-up"} size={18} color={B.gray2} />
        </View>
      </TouchableOpacity>

      {open && (
        <ScrollView style={{ maxHeight: 190, marginTop: 10 }} contentContainerStyle={{ gap: 8 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {itemCount === 0 ? (
            <Text style={{ color: B.muted, fontSize: 12.5, lineHeight: 18, fontFamily: "DMSans_400Regular" }}>
              Tell Kit your services and prices — your quote tool will build here as you talk.
            </Text>
          ) : (
            <>
              {fields.map((f: any) => (
                <View key={f.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <Text style={{ color: B.gray1, fontSize: 13, fontFamily: "DMSans_400Regular", flexShrink: 1 }}>{f.label}</Text>
                  <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold", textAlign: "right" }}>{rateText(f)}</Text>
                </View>
              ))}
              {addOns.map((a: any) => (
                <View key={a.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <Text style={{ color: B.gray2, fontSize: 13, fontFamily: "DMSans_400Regular", flexShrink: 1 }}>+ {a.label}</Text>
                  <Text style={{ color: primaryColor, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>${Number(a.price || 0).toLocaleString()}</Text>
                </View>
              ))}
              {deposit > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: B.border, paddingTop: 8, marginTop: 2 }}>
                  <Text style={{ color: B.gray2, fontSize: 13, fontFamily: "DMSans_400Regular" }}>Deposit</Text>
                  <Text style={{ color: B.gray1, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{deposit}%</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
