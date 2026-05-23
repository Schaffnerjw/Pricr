import { Feather } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Dimensions, Image, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { s, wl } from "../styles";
import { Business } from "../types";
import { getCardTheme } from "../utils/color";
import { evaluateCondition, evaluateFormula } from "../utils/formula";
import { formatLongDate, formatMoney } from "../utils/helpers";

const SCREEN_H = Dimensions.get("window").height;

type Totals = { ctx: Record<string, any>; taxRate: number; tax: number; total: number; depositPct: number; deposit: number };

// The slide-up "proposal" sheet shown when reviewing a quote. Owns its own entrance animation.
export function ClosingCard({ schema, business, primaryColor, customerName, totals, selectedAddOns, saved, onSave, onClose }: {
  schema: any; business: Business; primaryColor: string; customerName: string;
  totals: Totals; selectedAddOns: string[]; saved: boolean; onSave: () => void; onClose: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const theme = getCardTheme(primaryColor);
  const slide = useRef(new Animated.Value(0)).current;
  const depositScale = useRef(new Animated.Value(1)).current;
  const t = totals;

  useEffect(() => {
    if (reduceMotion) { slide.setValue(1); return; }
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 9, tension: 65 }).start();
    Animated.sequence([
      Animated.delay(250),
      Animated.timing(depositScale, { toValue: 1.08, duration: 200, useNativeDriver: true }),
      Animated.timing(depositScale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [reduceMotion]);

  const balanceDue = Math.max(0, t.total - t.deposit);
  const validThrough = formatLongDate(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return (
    <View style={s.qFill}>
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", opacity: slide }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "90%", transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0] }) }] }}>
        <View style={[s.closingCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder, borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>
          <ScrollView contentContainerStyle={{ gap: 16 }} showsVerticalScrollIndicator={false}>
            <View style={s.closingCardHeader}>
              {business.brand.logoUri ? (
                <Image source={{ uri: business.brand.logoUri }} style={wl.quoteLogo} resizeMode="contain" />
              ) : (
                <Text style={[wl.bizName, { color: theme.bizColor, fontSize: 16 }]}>{business.name}</Text>
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TouchableOpacity style={[s.saveBtn, { flexDirection: "row", alignItems: "center", gap: 4, borderColor: primaryColor, backgroundColor: saved ? primaryColor : "transparent" }]} onPress={onSave}>
                  {saved && <Feather name="check" size={14} color={B.white} />}
                  <Text style={[s.saveBtnText, { color: saved ? B.white : primaryColor }]}>{saved ? "Saved" : "Save"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose}><Feather name="chevron-down" size={24} color={theme.lineColor} /></TouchableOpacity>
              </View>
            </View>

            <Text style={[s.ccFixedPrice, { color: primaryColor, textTransform: "uppercase" }]}>Fixed price estimate</Text>
            <Text style={[s.closingCustomer, { color: theme.customerColor }]}>{customerName || "Customer"}</Text>

            <View style={[s.closingDivider, { backgroundColor: theme.dividerColor }]} />

            <View style={{ gap: 10 }}>
              {schema?.summaryLines?.map((line: any, i: number) => {
                if (line.showIf && !evaluateCondition(line.showIf, t.ctx, schema.pricing || {})) return null;
                const label = line.label.replace(/\{(\w+)\}/g, (_: string, key: string) => t.ctx[key] ?? schema.pricing?.[key] ?? key);
                const value = evaluateFormula(line.value, t.ctx, schema.pricing || {});
                if (!value) return null;
                return (
                  <View key={i} style={s.lineItem}>
                    <Text style={[s.lineLabel, { color: theme.lineColor }]}>{label}</Text>
                    <Text style={[s.lineValue, { color: theme.valueColor }]}>{formatMoney(value)}</Text>
                  </View>
                );
              })}
              {selectedAddOns.map(id => {
                const ao = schema?.addOns?.find((a: any) => a.id === id);
                if (!ao) return null;
                return (
                  <View key={id} style={s.lineItem}>
                    <Text style={[s.lineLabel, { color: theme.lineColor }]}>{ao.label}</Text>
                    <Text style={[s.lineValue, { color: theme.valueColor }]}>${ao.price?.toLocaleString()}</Text>
                  </View>
                );
              })}
              {t.taxRate > 0 && (
                <View style={s.lineItem}>
                  <Text style={[s.lineLabel, { color: theme.lineColor }]}>Tax ({t.taxRate}%)</Text>
                  <Text style={[s.lineValue, { color: theme.valueColor }]}>{formatMoney(t.tax)}</Text>
                </View>
              )}
            </View>

            <View style={[s.closingDivider, { backgroundColor: theme.dividerColor }]} />
            <View style={s.totalRow}>
              <Text style={[s.totalLabel, { color: theme.totalColor }]}>Total</Text>
              <Text style={[s.totalAmount, { color: theme.totalColor }]}>{formatMoney(t.total)}</Text>
            </View>

            {t.depositPct > 0 && t.total > 0 && (
              <Animated.View style={[s.depositBadge, { backgroundColor: theme.depositBg, borderColor: theme.depositBorder, transform: [{ scale: depositScale }] }]}>
                <View>
                  <Text style={[s.depositLabel, { color: theme.depositLabelColor }]}>{t.depositPct}% Deposit Due Today</Text>
                  <Text style={[s.depositSub, { color: theme.lineColor }]}>Balance due upon completion</Text>
                </View>
                <Text style={[s.depositAmount, { color: theme.depositAmountColor }]}>{formatMoney(t.deposit)}</Text>
              </Animated.View>
            )}

            {t.total > 0 && (
              <View style={{ gap: 2 }}>
                <Text style={[s.ccTerms, { color: theme.valueColor }]}>Balance of {formatMoney(balanceDue)} due upon completion</Text>
                <Text style={[s.ccValid, { color: theme.lineColor }]}>Valid through {validThrough}</Text>
              </View>
            )}

            {(business.brand.phone || business.brand.email || business.brand.address) && (
              <View style={[s.contactFooter, { borderTopColor: theme.dividerColor }]}>
                {business.brand.phone ? <ContactRow icon="phone" text={business.brand.phone} color={theme.lineColor} /> : null}
                {business.brand.email ? <ContactRow icon="mail" text={business.brand.email} color={theme.lineColor} /> : null}
                {business.brand.address ? <ContactRow icon="map-pin" text={business.brand.address} color={theme.lineColor} /> : null}
              </View>
            )}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

function ContactRow({ icon, text, color }: { icon: any; text: string; color: string }) {
  return (
    <View style={s.ccContactRow}>
      <Feather name={icon} size={13} color={color} />
      <Text style={[s.contactText, { color }]}>{text}</Text>
    </View>
  );
}
