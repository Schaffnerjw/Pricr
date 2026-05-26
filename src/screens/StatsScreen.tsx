import { Feather } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, SafeAreaView, ScrollView, Share, Text, TouchableOpacity, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { B } from "../constants/brand";
import { useBusinessAnalytics } from "../hooks/useBusinessAnalytics";
import { s } from "../styles";
import { Business } from "../types";
import { getBrandPalette } from "../utils/colorUtils";
import { formatMoney } from "../utils/helpers";

const monthYear = () => new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

export function StatsScreen({ business, onBack }: { business: Business; onBack: () => void }) {
  const a = useBusinessAnalytics(business.code);
  const pal = getBrandPalette(business);
  const primary = pal.primary, secondary = pal.secondary, text = pal.text, muted = pal.textMuted;
  const cardRef = useRef<View>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ pipeline: true });

  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

  const shareStats = async () => {
    const msg = `I've quoted ${formatMoney(a.totalQuoted)} in jobs with @PricrApp — ${a.closeRate}% close rate, ${a.monthly.closed.now} jobs closed this month. The AI quote tool that pays for itself. 🔥 pricr.veraa.io`;
    try { await Share.share({ message: msg }); } catch { /* cancelled */ }
  };

  const saveImage = async () => {
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1, result: Platform.OS === "web" ? "data-uri" : "tmpfile" });
      if (Platform.OS === "web") {
        const link = document.createElement("a"); link.href = uri; link.download = "pricr-stats.png"; link.click();
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Save your stats" });
      }
    } catch {
      Alert.alert("Couldn't save image", "Try a screenshot instead.");
    }
  };

  const StatCard = ({ value, label }: { value: string; label: string }) => (
    <View style={{ flex: 1, backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 8, alignItems: "center", gap: 4 }}>
      <Text style={{ fontSize: 24, fontWeight: "800", color: primary, fontFamily: "Syne_800ExtraBold" }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={{ fontSize: 11, fontWeight: "700", color: muted, letterSpacing: 0.3, fontFamily: "DMSans_700Bold", textAlign: "center" }}>{label}</Text>
    </View>
  );

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <View style={{ backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 14, overflow: "hidden" }}>
      <TouchableOpacity onPress={() => toggle(id)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
        <Text style={{ color: text, fontSize: 15, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{title}</Text>
        <Feather name={open[id] ? "chevron-up" : "chevron-down"} size={20} color={muted} />
      </TouchableOpacity>
      {open[id] && <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>{children}</View>}
    </View>
  );

  const Row = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: muted, fontSize: 14, fontFamily: "DMSans_400Regular", flexShrink: 1 }}>{label}</Text>
      <Text style={{ color: valueColor || text, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold", textAlign: "right" }}>{value}</Text>
    </View>
  );

  const Delta = ({ label, now, prev, change, money }: { label: string; now: number; prev: number; change: number; money?: boolean }) => {
    const up = change >= 0;
    const fmt = (n: number) => (money ? formatMoney(n) : String(n));
    return (
      <View style={{ flex: 1, backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 }}>
        <Text style={{ color: muted, fontSize: 11, fontFamily: "DMSans_600SemiBold" }}>{label}</Text>
        <Text style={{ color: text, fontSize: 18, fontWeight: "800", fontFamily: "Syne_700Bold" }}>{fmt(now)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Feather name={up ? "arrow-up-right" : "arrow-down-right"} size={12} color={up ? B.green : B.red} />
          <Text style={{ color: up ? B.green : B.red, fontSize: 11, fontFamily: "DMSans_600SemiBold" }}>{Math.abs(change)}%</Text>
          <Text style={{ color: muted, fontSize: 11, fontFamily: "DMSans_400Regular" }}>vs {fmt(prev)}</Text>
        </View>
      </View>
    );
  };

  const pipeline = [
    { label: "Drafted", count: a.drafted, color: muted },
    { label: "Sent", count: Math.max(0, a.sent - a.accepted - a.declined), color: secondary },
    { label: "Accepted", count: a.accepted, color: B.green },
    { label: "Declined", count: a.declined, color: B.red },
  ];
  const pipelineTotal = pipeline.reduce((s2, p) => s2 + p.count, 0) || 1;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: pal.background }]}>
      <View style={[s.navBar, { borderBottomColor: pal.border }]}>
        <TouchableOpacity onPress={onBack} style={[s.navBack, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
          <Feather name="chevron-left" size={18} color={primary} /><Text style={[s.navBackText, { color: primary }]}>Done</Text>
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: text }]}>My Stats</Text>
        <View style={{ width: 60 }} />
      </View>

      {a.loading ? (
        <View style={s.centered}><ActivityIndicator color={primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
          {/* ── THE BRAG CARD (screenshot target) ── */}
          <View ref={cardRef} collapsable={false} style={{ backgroundColor: pal.background, borderColor: primary + "55", borderWidth: 1.5, borderRadius: 22, padding: 22, gap: 18 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              {business.brand.logoUri ? (
                <Image source={{ uri: business.brand.logoUri }} style={{ height: 30, width: 130 }} resizeMode="contain" />
              ) : (
                <Text style={{ color: text, fontSize: 20, fontWeight: "800", fontFamily: "Syne_800ExtraBold", flex: 1 }}>{business.name}</Text>
              )}
              <Text style={{ color: muted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{monthYear()}</Text>
            </View>

            {/* Hero */}
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <Text style={{ color: primary, fontSize: 46, fontWeight: "800", fontFamily: "Syne_800ExtraBold" }} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(a.totalQuoted)}</Text>
              <Text style={{ color: muted, fontSize: 13, fontFamily: "DMSans_600SemiBold", letterSpacing: 0.5, marginTop: 2 }}>Total quoted with Pricr</Text>
            </View>

            {/* Stat cards */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <StatCard value={String(a.accepted)} label="Jobs Closed" />
              <StatCard value={`${a.closeRate}%`} label="Close Rate" />
              <StatCard value={String(a.quotesThisMonth)} label="This Month" />
            </View>

            {/* Milestone badges */}
            {a.badges.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {a.badges.map(b => (
                  <View key={b.label} style={{ backgroundColor: primary, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 }}>
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{b.icon} {b.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Time saved */}
            <View style={{ alignItems: "center", borderTopWidth: 1, borderTopColor: pal.border, paddingTop: 14 }}>
              <Text style={{ color: secondary, fontSize: 22, fontWeight: "800", fontFamily: "Syne_700Bold" }}>~{a.hoursSaved} hours saved</Text>
              <Text style={{ color: muted, fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", marginTop: 2 }}>{a.quotesAllTime} quotes × 2 hrs manual = {a.hoursSaved} hrs back in your life</Text>
            </View>

            <Text style={{ color: muted, fontSize: 11, fontFamily: "DMSans_600SemiBold", textAlign: "right", opacity: 0.7 }}>Powered by Pricr.</Text>
          </View>

          {/* Share / Save */}
          <TouchableOpacity style={[s.btn, { backgroundColor: primary, flexDirection: "row", justifyContent: "center", gap: 8 }]} onPress={shareStats}>
            <Feather name="share-2" size={18} color="#fff" /><Text style={s.btnText}>Share My Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnSecondary, { borderColor: primary, flexDirection: "row", justifyContent: "center", gap: 8 }]} onPress={saveImage}>
            <Feather name="download" size={16} color={primary} /><Text style={[s.btnSecondaryText, { color: primary }]}>Save as Image</Text>
          </TouchableOpacity>

          {/* ── DEEP DIVE (collapsed by default) ── */}
          <TouchableOpacity onPress={() => setShowDetails(d => !d)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 }}>
            <Text style={{ color: primary, fontSize: 15, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{showDetails ? "Hide Details" : "View Details"}</Text>
            <Feather name={showDetails ? "chevron-up" : "chevron-down"} size={18} color={primary} />
          </TouchableOpacity>

          {showDetails && (
            <View style={{ gap: 12 }}>
              <Section id="pipeline" title="Quote Pipeline">
                <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: pal.border }}>
                  {pipeline.map(p => p.count > 0 ? <View key={p.label} style={{ flexGrow: p.count / pipelineTotal, backgroundColor: p.color }} /> : null)}
                </View>
                {pipeline.map(p => <Row key={p.label} label={p.label} value={String(p.count)} valueColor={p.color === muted ? text : p.color} />)}
              </Section>

              <Section id="month" title="This Month vs Last Month">
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Delta label="Quotes sent" {...a.monthly.sent} />
                  <Delta label="Revenue quoted" {...a.monthly.revenue} money />
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Delta label="Jobs closed" {...a.monthly.closed} />
                  <Delta label="Close rate" now={a.monthly.closeRate.now} prev={a.monthly.closeRate.prev} change={a.monthly.closeRate.change} />
                </View>
              </Section>

              <Section id="avg" title="Average Values">
                <Row label="Average quote value" value={formatMoney(a.avgQuoteValue)} />
                <Row label="Average time to sign" value={a.timeToSignHours > 0 ? `${a.timeToSignHours} hrs` : "—"} />
                <Row label="Largest quote ever" value={formatMoney(a.largestQuote)} />
                <Row label="Most common range" value={a.commonRange ? `${formatMoney(a.commonRange.low)} – ${formatMoney(a.commonRange.high)}` : "—"} />
              </Section>

              {a.topServices.length > 0 && (
                <Section id="services" title="Top Services">
                  {a.topServices.map(srv => <Row key={srv.name} label={srv.name} value={`${srv.count}× · avg ${formatMoney(srv.avg)}`} />)}
                </Section>
              )}

              {a.reps.length > 1 && (
                <Section id="team" title="Team Performance">
                  {a.reps.map(r => <Row key={r.name} label={`${r.name} · ${r.closeRate}% close`} value={`${r.sent} sent · ${formatMoney(r.total)}`} />)}
                </Section>
              )}

              <Section id="discount" title="Discount Usage">
                <Row label="Quotes with a discount" value={`${a.discountPctOfQuotes}%`} />
                <Row label="Average discount" value={a.avgDiscountPct > 0 ? `${a.avgDiscountPct}%` : "—"} />
                <Row label="Total discounted" value={formatMoney(a.totalDiscounted)} />
              </Section>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
