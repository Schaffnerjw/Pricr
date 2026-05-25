import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { isSupabaseConfigured } from "../lib/supabase";
import { scanAllData } from "../storage";
import { s } from "../styles";

// Master analytics over all locally-stored businesses/quotes/users.
// NOTE: scans AsyncStorage directly — fine at demo scale; these metrics move to Supabase later.
const PRICE_PER_MO = 97;

interface Stats {
  totalActive: number; newThisMonth: number; withSchema: number; inSetup: number;
  totalQuotes: number; quotesThisMonth: number;
  leaderboard: { name: string; count: number }[]; neverQuoted: string[];
  mrr: number; arr: number; withTeam: number; withKitUpdate: number;
}

function compute(d: Awaited<ReturnType<typeof scanAllData>>): Stats {
  const now = new Date();
  const sameMonth = (ts: number) => { const x = new Date(ts); return x.getMonth() === now.getMonth() && x.getFullYear() === now.getFullYear(); };
  const real = d.businesses.filter(b => b.code !== "DEMO");
  const realQuotes = (code: string) => (d.quotesByCode[code] || []).filter(q => !q.isSample);
  const totalActive = real.length;
  const totalQuotes = real.reduce((sum, b) => sum + realQuotes(b.code).length, 0);
  const mrr = totalActive * PRICE_PER_MO;
  return {
    totalActive,
    newThisMonth: real.filter(b => sameMonth(b.createdAt)).length,
    withSchema: real.filter(b => !!b.schema).length,
    inSetup: real.filter(b => !b.schema).length,
    totalQuotes,
    quotesThisMonth: real.reduce((sum, b) => sum + realQuotes(b.code).filter(q => sameMonth(q.timestamp)).length, 0),
    leaderboard: real.map(b => ({ name: b.name, count: realQuotes(b.code).length })).sort((a, b) => b.count - a.count).slice(0, 3).filter(x => x.count > 0),
    neverQuoted: real.filter(b => realQuotes(b.code).length === 0).map(b => b.name),
    mrr, arr: mrr * 12,
    withTeam: real.filter(b => (d.usersByCode[b.code]?.length || 0) > 1).length,
    withKitUpdate: real.filter(b => (b.kitUpdates || 0) > 0).length,
  };
}

const money = (n: number) => `$${n.toLocaleString()}`;

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={s.configLabel}>{label}</Text>
      <Text style={[s.infoCode, { fontSize: 30, letterSpacing: 0, color: color || B.white }]}>{value}</Text>
    </View>
  );
}

export function MasterAnalytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (isSupabaseConfigured) { setLoading(false); return; } // local scan is meaningless in cloud mode
    setLoading(true);
    scanAllData().then(d => { setStats(compute(d)); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={s.sectionTitle}>PLATFORM ANALYTICS</Text>
        {!isSupabaseConfigured && (
          <TouchableOpacity onPress={load} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Feather name="refresh-cw" size={13} color={B.blue} />
            <Text style={{ color: B.blue, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>Refresh</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* In cloud mode the metrics live in Supabase, not local storage — show a placeholder instead
          of empty zeroes until cross-business analytics are wired server-side. */}
      {isSupabaseConfigured ? (
        <View style={[s.masterCard, { alignItems: "center", paddingVertical: 28, gap: 8 }]}>
          <Feather name="bar-chart-2" size={28} color={B.cyan} />
          <Text style={[s.configLabel, { textAlign: "center" }]}>ANALYTICS COMING SOON</Text>
          <Text style={[s.emptyText, { textAlign: "center" }]}>Your data is stored securely in the cloud. Cross-business analytics are coming soon.</Text>
        </View>
      ) : loading || !stats ? (
        <View style={[s.masterCard, { alignItems: "center", paddingVertical: 32 }]}><ActivityIndicator color={B.cyan} /></View>
      ) : (
        <>
          {/* SUBSCRIBERS */}
          <View style={[s.masterCard, { gap: 14 }]}>
            <Text style={s.configLabel}>SUBSCRIBERS</Text>
            <Stat label="ACTIVE BUSINESSES" value={stats.totalActive} color={B.cyan} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Stat label="NEW THIS MONTH" value={stats.newThisMonth} />
              <Stat label="LIVE / IN SETUP" value={`${stats.withSchema} / ${stats.inSetup}`} />
            </View>
          </View>

          {/* USAGE */}
          <View style={[s.masterCard, { gap: 14 }]}>
            <Text style={s.configLabel}>USAGE</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Stat label="TOTAL QUOTES" value={stats.totalQuotes} />
              <Stat label="THIS MONTH" value={stats.quotesThisMonth} />
            </View>
            <View style={s.sep} />
            <Text style={s.configLabel}>MOST ACTIVE</Text>
            {stats.leaderboard.length === 0 ? (
              <Text style={s.emptyText}>No quotes yet.</Text>
            ) : stats.leaderboard.map((b, i) => (
              <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={s.configValue}>{i + 1}. {b.name}</Text>
                <Text style={[s.configValue, { color: B.cyan }]}>{b.count}</Text>
              </View>
            ))}
            {stats.neverQuoted.length > 0 && (
              <>
                <View style={s.sep} />
                <Text style={[s.configLabel, { color: B.red }]}>CHURN RISK — NEVER QUOTED</Text>
                {stats.neverQuoted.map(name => <Text key={name} style={[s.configValue, { color: B.red }]}>{name}</Text>)}
              </>
            )}
          </View>

          {/* REVENUE */}
          <View style={[s.masterCard, { gap: 14 }]}>
            <Text style={s.configLabel}>REVENUE</Text>
            <Stat label={`MRR (× $${PRICE_PER_MO}/mo)`} value={money(stats.mrr)} color={B.green} />
            <Stat label="PROJECTED ARR" value={money(stats.arr)} color={B.green} />
          </View>

          {/* HEALTH */}
          <View style={[s.masterCard, { gap: 14 }]}>
            <Text style={s.configLabel}>HEALTH</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Stat label="ADDED A TEAMMATE" value={stats.withTeam} />
              <Stat label="USED KIT UPDATES" value={stats.withKitUpdate} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}
