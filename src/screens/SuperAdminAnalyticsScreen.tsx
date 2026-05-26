import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { B, MASTER_CODE, SIGN_BASE } from "../constants/brand";
import { PlatformBiz, usePlatformAnalytics } from "../hooks/usePlatformAnalytics";
import { isSupabaseConfigured } from "../lib/supabase";
import { s } from "../styles";
import { formatDate, formatMoney } from "../utils/helpers";

export function SuperAdminAnalyticsScreen({ onBack }: { onBack: () => void }) {
  const { data, error, loading } = usePlatformAnalytics();
  const [pingMs, setPingMs] = useState<number | null>(null);

  const ping = async () => {
    try { const t0 = Date.now(); await (await fetch(`${SIGN_BASE}/health`)).json(); setPingMs(Date.now() - t0); }
    catch { setPingMs(-1); }
  };

  const exportCsv = async () => {
    try {
      const res = await fetch(`${SIGN_BASE}/admin/export`, { method: "POST", headers: { "x-master-code": MASTER_CODE } });
      const csv = await res.text();
      if (Platform.OS === "web") { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "pricr-businesses.csv"; link.click(); }
      else Alert.alert("Export ready", "CSV export downloads on the web app.");
    } catch { Alert.alert("Export failed", "Try again."); }
  };

  const bizDetail = (b: PlatformBiz) => Alert.alert(b.name, `Trade: ${b.trade || "Not set"}\nTotal quotes: ${b.totalQuotes}\nThis month: ${b.quotesThisMonth}\nLast active: ${b.lastActive ? formatDate(b.lastActive) : "Never"}\nJoined: ${formatDate(new Date(b.joined).getTime())}`);

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flex: 1, minWidth: "45%", backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 2 }}>
      <Text style={{ color: B.cyan, fontSize: 22, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={{ color: B.muted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{label}</Text>
    </View>
  );
  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 }}>
      <Text style={{ color: B.gray2, fontSize: 14, fontFamily: "DMSans_400Regular", flexShrink: 1 }}>{label}</Text>
      <Text style={{ color: color || B.white, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{value}</Text>
    </View>
  );
  const HealthList = ({ title, items, empty, color }: { title: string; items: PlatformBiz[]; empty: string; color?: string }) => (
    <View style={{ gap: 8 }}>
      <Text style={[s.sectionTitle, color ? { color } : null]}>{title} ({items.length})</Text>
      {items.length === 0 ? <Text style={s.emptyText}>{empty}</Text> : items.map(b => (
        <TouchableOpacity key={b.code} style={s.historyCard} onPress={() => bizDetail(b)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={s.historyName}>{b.name}</Text>
              <Text style={s.historyMeta}>{b.trade || "no trade"} · {b.totalQuotes} quotes{b.quotesThisMonth ? ` · ${b.quotesThisMonth} this month` : ""}</Text>
              <Text style={[s.historyMeta, { marginTop: 2 }]}>{b.lastActive ? `Last active ${formatDate(b.lastActive)}` : `Joined ${formatDate(new Date(b.joined).getTime())}`}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={B.gray3} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={onBack} style={[s.navBack, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
          <Feather name="chevron-left" size={18} color={B.blue} /><Text style={s.navBackText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Platform Analytics</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={B.blue} /></View>
      ) : error || !data ? (
        <View style={s.centered}><Text style={s.emptyText}>Couldn&apos;t load platform analytics: {error || "no data"}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          <Text style={s.sectionTitle}>PLATFORM OVERVIEW</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Stat label="Businesses" value={String(data.totalBusinesses)} />
            <Stat label="Quotes (all time)" value={String(data.totalQuotes)} />
            <Stat label="Signed (all time)" value={String(data.totalSigned)} />
            <Stat label="Close rate" value={`${data.platformCloseRate}%`} />
            <Stat label="Contract value" value={formatMoney(data.contractValue)} />
            <Stat label="Active this month" value={String(data.activeThisMonth)} />
          </View>

          <Text style={s.sectionTitle}>GROWTH</Text>
          <View style={{ backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 12, padding: 14 }}>
            <Row label="New businesses this month" value={String(data.newThisMonth)} />
            <Row label="New businesses last month" value={String(data.newLastMonth)} />
            <Row label="Month-over-month growth" value={`${data.growthPct}%`} color={data.growthPct >= 0 ? B.green : B.red} />
            <Row label="Avg quotes / business / month" value={String(data.avgQuotesPerBizPerMonth)} />
          </View>

          <Text style={s.sectionTitle}>BUSINESS HEALTH</Text>
          <HealthList title="Most Active" items={data.mostActive} empty="No active businesses yet." />
          <HealthList title="At Risk (14+ days idle)" items={data.atRisk} empty="None at risk." color="#F59E0B" />
          <HealthList title="Never Used" items={data.neverUsed} empty="Everyone has quoted." color={B.red} />
          <HealthList title="Broken Schema" items={data.brokenSchema} empty="All schemas healthy." color={B.red} />

          <Text style={s.sectionTitle}>PLATFORM SIGNATURES</Text>
          <View style={{ backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 12, padding: 14 }}>
            <Row label="Total signatures collected" value={String(data.totalSigned)} />
            <Row label="Signatures this month" value={String(data.signaturesThisMonth)} />
            <Row label="Avg time quote → signed" value={data.avgTimeToSignHours > 0 ? `${data.avgTimeToSignHours} hrs` : "—"} />
          </View>

          <Text style={s.sectionTitle}>REVENUE INTELLIGENCE</Text>
          <View style={{ backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 12, padding: 14 }}>
            <Row label="Avg quote value (platform)" value={formatMoney(data.avgQuoteValue)} />
            <Row label="Highest single quote" value={formatMoney(data.highestQuote)} />
            <Row label="Most popular trade" value={`${data.popularTrade.trade} (${data.popularTrade.count})`} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[s.sectionTitle, { marginBottom: 4 }]}>TRADE BREAKDOWN</Text>
            {data.tradeBreakdown.slice(0, 12).map(t => <Row key={t.trade} label={t.trade} value={String(t.count)} />)}
          </View>

          <Text style={s.sectionTitle}>SYSTEM HEALTH</Text>
          <View style={{ backgroundColor: B.card, borderColor: B.border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 }}>
            <TouchableOpacity onPress={ping} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: B.gray2, fontSize: 14, fontFamily: "DMSans_400Regular" }}>Proxy status (tap to ping)</Text>
              <Text style={{ color: pingMs == null ? B.blue : pingMs < 0 ? B.red : B.green, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{pingMs == null ? "Ping" : pingMs < 0 ? "Unreachable" : `${pingMs}ms`}</Text>
            </TouchableOpacity>
            <Row label="Supabase" value={isSupabaseConfigured ? "Connected" : "Disconnected"} color={isSupabaseConfigured ? B.green : B.red} />
            <Row label="Last deploy (version)" value={String(Constants.expoConfig?.version || "—")} />
          </View>

          <Text style={s.sectionTitle}>EXPORT TOOLS</Text>
          <TouchableOpacity style={s.btnSecondary} onPress={exportCsv}>
            <Text style={s.btnSecondaryText}>Export All Businesses (CSV)</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
