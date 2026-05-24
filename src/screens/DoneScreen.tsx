import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { BrandHeader } from "../components/BrandHeader";
import { KitIntroBubble } from "../components/KitIntroBubble";
import { B } from "../constants/brand";
import { getQuotes } from "../storage";
import { s } from "../styles";
import { Business, User } from "../types";
import { monthlyQuoteTotal } from "../utils/quote";

export function DoneScreen({ business, currentUser, primaryColor, secondaryColor, showTestPrompt, onSignOut, onOpenQuoteTool, onQuoteHistory, onQuotePipeline, onManageTeam, onReconfigure, onTestQuote, onDismissTestPrompt, onOpenSettings, onSetupTerms }: {
  business: Business; currentUser: User; primaryColor: string; secondaryColor: string; showTestPrompt: boolean;
  onSignOut: () => void; onOpenQuoteTool: () => void; onQuoteHistory: () => void; onQuotePipeline?: () => void; onManageTeam: () => void; onReconfigure: () => void;
  onTestQuote: () => void; onDismissTestPrompt: () => void; onOpenSettings: () => void; onSetupTerms?: () => void;
}) {
  const isAdmin = currentUser.role === "admin" || currentUser.role === "superadmin";
  const bg = business.brand.backgroundColor || B.midnight;
  const [monthTotal, setMonthTotal] = useState<number | null>(null);
  const [allTimeCount, setAllTimeCount] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    getQuotes(business.code).then(qs => { if (mounted) { setMonthTotal(monthlyQuoteTotal(qs)); setAllTimeCount(qs.filter(q => !q.isSample).length); } });
    return () => { mounted = false; };
  }, [business.code]);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: bg }]}>
      <BrandHeader business={business} right={
        <TouchableOpacity onPress={onSignOut}>
          <Text style={{ color: B.gray3, fontSize: 13, fontFamily: "DMSans_400Regular" }}>Sign out</Text>
        </TouchableOpacity>
      } />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingTop: 24 }}>
        <View>
          <Text style={s.h1}>Hey, {currentUser.name}.</Text>
          <Text style={[s.body, { marginTop: 4 }]}>{business.name} is configured and ready to quote.</Text>
        </View>

        {isAdmin && business.brandConfigured === false && (
          <TouchableOpacity style={[s.brandBanner, { borderColor: primaryColor + "60" }]} onPress={onOpenSettings}>
            <Feather name="alert-circle" size={18} color={primaryColor} />
            <Text style={s.brandBannerText}>Brand setup incomplete — finish in Settings</Text>
            <Feather name="chevron-right" size={18} color={B.gray3} />
          </TouchableOpacity>
        )}

        {showTestPrompt && !dismissed && (
          <View style={[s.configCard, { borderColor: primaryColor + "60", gap: 10 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Feather name="check-circle" size={18} color={primaryColor} />
                <Text style={{ fontSize: 16, fontWeight: "800", color: B.white, fontFamily: "Syne_700Bold" }}>Your tool is ready</Text>
              </View>
              <TouchableOpacity onPress={() => { setDismissed(true); onDismissTestPrompt(); }}>
                <Feather name="x" size={20} color={B.gray3} />
              </TouchableOpacity>
            </View>
            <Text style={s.body}>Want to run a test quote to see it in action?</Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor }]} onPress={() => { setDismissed(true); onTestQuote(); }}>
              <Text style={s.btnText}>Run a test quote</Text>
            </TouchableOpacity>
          </View>
        )}

        {business.kitSummary && (
          <View style={[s.configCard, { flexDirection: "row", gap: 12, alignItems: "flex-start" }]}>
            <View style={[s.kitAvatar, { backgroundColor: primaryColor }]}><Text style={s.kitAvatarText}>K</Text></View>
            <Text style={[s.body, { flex: 1, color: B.gray1 }]}>{business.kitSummary}</Text>
          </View>
        )}

        {business.schema && (
          <View style={s.configCard}>
            {[
              ["TRADE", business.schema.trade],
              ["CUSTOM INPUTS", `${business.schema.fields?.length} field${business.schema.fields?.length !== 1 ? "s" : ""} built for your trade`],
              ["ADD-ONS", business.schema.addOns?.length > 0 ? business.schema.addOns.map((a: any) => a.label).join(", ") : "None set up"],
              ...(business.schema.pricing?.depositPercent > 0 ? [["DEPOSIT", `${business.schema.pricing.depositPercent}% upfront`]] : []),
            ].map(([label, value], i, arr) => (
              <View key={label}>
                <View style={{ gap: 4, paddingVertical: 4 }}>
                  <Text style={s.configLabel}>{label}</Text>
                  <Text style={s.configValue}>{value}</Text>
                </View>
                {i < arr.length - 1 && <View style={s.sep} />}
              </View>
            ))}
          </View>
        )}

        {/* Monthly quoted total */}
        <View style={[s.infoCard, { gap: 4 }]}>
          <Text style={s.infoLabel}>QUOTED THIS MONTH</Text>
          {monthTotal === null ? (
            <Text style={[s.infoCode, { color: B.gray3, fontSize: 20 }]}>—</Text>
          ) : monthTotal > 0 ? (
            <Text style={[s.infoCode, { color: primaryColor, fontSize: 28 }]}>${monthTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
          ) : (
            <Text style={[s.configValue, { color: B.gray2 }]}>No quotes yet this month.</Text>
          )}
          {allTimeCount !== null && <Text style={[s.configValue, { color: B.gray2, marginTop: 6 }]}>Total quotes all time: {allTimeCount}</Text>}
        </View>

        <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor }]} onPress={onOpenQuoteTool}>
          <Text style={s.btnText}>Open My Quote Tool</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={onQuoteHistory}>
          <Text style={[s.btnSecondaryText, { color: secondaryColor }]}>Quote History</Text>
        </TouchableOpacity>
        {isAdmin && (
          <>
            {onQuotePipeline && (
              <TouchableOpacity style={s.btnSecondary} onPress={onQuotePipeline}>
                <Text style={[s.btnSecondaryText, { color: secondaryColor }]}>Quote Pipeline</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.btnSecondary} onPress={onManageTeam}>
              <Text style={[s.btnSecondaryText, { color: secondaryColor }]}>Manage Team</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnSecondary} onPress={onReconfigure}>
              <Text style={[s.btnSecondaryText, { color: secondaryColor }]}>Reconfigure with Kit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnSecondary} onPress={onOpenSettings}>
              <Text style={[s.btnSecondaryText, { color: secondaryColor }]}>Settings</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {isAdmin && <KitIntroBubble business={business} onSetupTerms={onSetupTerms ?? onOpenSettings} />}
    </SafeAreaView>
  );
}
