import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { DemoPickerModal } from "../components/DemoPickerModal";
import { B, MASTER_CODE, SIGN_BASE } from "../constants/brand";
import { s } from "../styles";
import { Business, DemoBusiness } from "../types";
import { formatDate } from "../utils/helpers";

// Cross-platform alert (web prompt() can't show multi-line nicely, so use window.alert there).
const notify = (title: string, msg: string) => { if (Platform.OS === "web") window.alert(`${title}\n\n${msg}`); else Alert.alert(title, msg); };
const confirmAction = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === "web") { if (window.confirm(`${title}\n\n${msg}`)) onYes(); }
  else Alert.alert(title, msg, [{ text: "Cancel", style: "cancel" }, { text: "Confirm", style: "destructive", onPress: onYes }]);
};

// All cross-tenant reads/writes go through the Railway proxy (service role) — never the anon key.
async function adminFetch(action: string, body?: any): Promise<any> {
  const res = await fetch(`${SIGN_BASE}/admin/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-master-code": MASTER_CODE },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Request failed");
  return json;
}

interface SearchResult { code: string; name: string; trade: string; username: string; quoteCount: number; lastActive: number | null; schemaStatus: string; suspended: boolean; }
interface BizDetail { code: string; name: string; config: any; brand: any; schema: any; schemaStatus: string; members: any[]; quotes: any[]; recentQuotes: any[]; quoteCount: number; signedCount: number; suspended: boolean; }
interface Stats { businesses: number; quotes: number; signed: number; blankSchemas: number; zeroQuoteBusinesses: number; }

export function MasterDashboard({ onSignOut, onStartDemo, onOpenAnalytics, onViewAs }: { onSignOut: () => void; onStartDemo: (demo: DemoBusiness) => void; onOpenAnalytics?: () => void; onViewAs?: (business: Business, quotes: any[]) => void }) {
  const [showDemoPicker, setShowDemoPicker] = useState(false);
  // Hidden gesture: 5 taps on the logo within 3s opens the super-admin analytics. No UI hint.
  const tapTimes = useRef<number[]>([]);
  const flash = useRef(new Animated.Value(0)).current;
  const handleLogoTap = () => {
    const now = Date.now();
    tapTimes.current = [...tapTimes.current.filter(t => now - t < 3000), now];
    if (tapTimes.current.length >= 5) {
      tapTimes.current = [];
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.7, duration: 120, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => onOpenAnalytics?.());
    }
  };
  const [stats, setStats] = useState<Stats | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState<BizDetail | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [deleteName, setDeleteName] = useState(""); // typed confirmation before delete
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => { loadStats(); }, []);
  const loadStats = async () => { try { setStats(await adminFetch("stats")); } catch (e) { setErr(e instanceof Error ? e.message : "stats failed"); } };

  const ping = async () => {
    try {
      const t0 = Date.now();
      const r = await fetch(`${SIGN_BASE}/health`);
      await r.json();
      setPingMs(Date.now() - t0);
    } catch { setPingMs(-1); }
  };

  const search = async () => {
    setSearching(true); setErr("");
    try { setResults((await adminFetch("search", { query })).results || []); }
    catch (e) { setErr(e instanceof Error ? e.message : "search failed"); }
    setSearching(false);
  };

  const openBusiness = async (code: string) => {
    setBusy(true); setErr(""); setConfirmingDelete(false); setDeleteName("");
    try { setDetail(await adminFetch("business", { code })); setSchemaOpen(false); }
    catch (e) { setErr(e instanceof Error ? e.message : "load failed"); }
    setBusy(false);
  };

  const resetPassword = async (code: string, username?: string) => {
    try { const r = await adminFetch("reset-password", { code, username }); notify("Temp password generated", `Username: ${r.username}\nTemporary password: ${r.tempPassword}\n\nShare this with them. They can change it after signing in.`); }
    catch (e) { notify("Couldn't reset", e instanceof Error ? e.message : "failed"); }
  };

  const businessAction = async (code: string, action: string, after?: () => void) => {
    setBusy(true);
    try { await adminFetch("business-action", { code, action }); after?.(); }
    catch (e) { notify("Action failed", e instanceof Error ? e.message : "failed"); }
    setBusy(false);
  };

  const userAction = async (code: string, userId: string, action: string, role?: string) => {
    setBusy(true);
    try { await adminFetch("user", { code, userId, action, role }); await openBusiness(code); }
    catch (e) { notify("Action failed", e instanceof Error ? e.message : "failed"); }
    setBusy(false);
  };

  const sendNotification = async (code: string) => {
    if (!notifyMsg.trim()) return;
    try { const r = await adminFetch("notify", { code, message: notifyMsg.trim() }); setNotifyMsg(""); notify("Sent", `Message sent to ${r.sentTo}`); }
    catch (e) { notify("Couldn't send", e instanceof Error ? e.message : "failed"); }
  };

  const exportCsv = async () => {
    try {
      const res = await fetch(`${SIGN_BASE}/admin/export`, { method: "POST", headers: { "x-master-code": MASTER_CODE } });
      const csv = await res.text();
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "pricr-businesses.csv"; a.click(); URL.revokeObjectURL(url);
      } else { notify("Export ready", "CSV export downloads on the web app."); }
    } catch (e) { notify("Export failed", e instanceof Error ? e.message : "failed"); }
  };

  // ── BUSINESS DETAIL ──
  if (detail) {
    const d = detail;
    const statusColor = d.schemaStatus === "ok" ? B.green : d.schemaStatus === "blank" || d.schemaStatus === "placeholder" ? B.red : "#F59E0B";
    return (
      <SafeAreaView style={s.container}>
        <View style={s.navBar}>
          <TouchableOpacity onPress={() => setDetail(null)} style={[s.navBack, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
            <Feather name="chevron-left" size={18} color={B.blue} /><Text style={s.navBackText}>Back</Text>
          </TouchableOpacity>
          <Text style={s.navTitle}>{d.name}</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>BUSINESS ID</Text>
            <Text style={[s.infoCode, { color: B.cyan }]}>{d.code}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <View style={{ backgroundColor: statusColor + "22", borderColor: statusColor, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: statusColor, fontSize: 11, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>SCHEMA: {d.schemaStatus.toUpperCase()}</Text>
              </View>
              {d.suspended && <View style={{ backgroundColor: B.red + "22", borderColor: B.red, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: B.red, fontSize: 11, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>SUSPENDED</Text></View>}
            </View>
            <Text style={[s.configValue, { marginTop: 8 }]}>Trade: {d.schema?.trade || "Not configured"}</Text>
            <Text style={[s.configValue, { marginTop: 2 }]}>Quotes: {d.quoteCount} · Signed: {d.signedCount} · Team: {d.members.length}</Text>
            {d.brand && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {(["primaryColor", "secondaryColor", "backgroundColor"] as const).map(k => d.brand[k] ? (
                  <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: d.brand[k], borderWidth: 1, borderColor: B.border }} />
                    <Text style={{ color: B.gray2, fontSize: 11, fontFamily: "DMSans_400Regular" }}>{d.brand[k]}</Text>
                  </View>
                ) : null)}
              </View>
            )}
          </View>

          {/* View as (read-only impersonation) */}
          {onViewAs && (
            <TouchableOpacity style={[s.btn, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: B.blue }]} onPress={() => onViewAs(d.config, d.quotes)}>
              <Feather name="eye" size={16} color={B.white} /><Text style={s.btnText}>View as {d.name}</Text>
            </TouchableOpacity>
          )}

          {/* Schema debug */}
          <TouchableOpacity onPress={() => setSchemaOpen(o => !o)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={s.sectionTitle}>SCHEMA (DEBUG)</Text>
            <Feather name={schemaOpen ? "chevron-up" : "chevron-down"} size={18} color={B.gray2} />
          </TouchableOpacity>
          {schemaOpen && (
            <ScrollView horizontal style={{ maxHeight: 240, backgroundColor: B.card, borderRadius: 12, borderWidth: 1, borderColor: B.border, padding: 12 }}>
              <Text style={{ color: B.gray2, fontSize: 11, fontFamily: "DMSans_400Regular" }}>{JSON.stringify(d.schema, null, 2)}</Text>
            </ScrollView>
          )}

          {/* Users */}
          <Text style={s.sectionTitle}>USERS ({d.members.length})</Text>
          {d.members.map((u: any) => (
            <View key={u.id} style={[s.userCard, { flexWrap: "wrap" }]}>
              <View style={[s.userAvatar, { backgroundColor: B.blue }]}><Text style={s.userAvatarText}>{(u.name || "?").charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1, minWidth: 120 }}>
                <Text style={s.userName}>{u.name} {u.username ? `· ${u.username}` : ""}</Text>
                <Text style={s.userRole}>{u.role}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {u.username && <TouchableOpacity onPress={() => resetPassword(d.code, u.username)}><Text style={{ color: B.blue, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>Reset PW</Text></TouchableOpacity>}
                {u.role !== "admin" && <TouchableOpacity onPress={() => userAction(d.code, u.id, "role", u.role === "rep" ? "admin" : "rep")}><Text style={{ color: B.blue, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{u.role === "rep" ? "Make admin" : "Make rep"}</Text></TouchableOpacity>}
                {u.role !== "admin" && <TouchableOpacity onPress={() => confirmAction("Remove user", `Remove ${u.name}?`, () => userAction(d.code, u.id, "remove"))}><Text style={{ color: B.red, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>Remove</Text></TouchableOpacity>}
              </View>
            </View>
          ))}

          {/* All quotes */}
          <Text style={s.sectionTitle}>QUOTES ({d.quoteCount})</Text>
          {(d.quotes || []).slice(0, 100).map((q: any, i: number) => (
            <View key={i} style={s.historyCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={s.historyName}>{q.customer_name || "No name"}</Text>
                <Text style={[s.historyTotal, { color: B.blue }]}>${Number(q.total || 0).toLocaleString()}</Text>
              </View>
              <Text style={s.historyMeta}>{formatDate(new Date(q.created_at).getTime())} · {q.status || "draft"}{q.signed_at ? " · signed" : ""}</Text>
            </View>
          ))}
          {d.quoteCount > 100 && <Text style={[s.historyMeta, { textAlign: "center" }]}>Showing first 100 of {d.quoteCount}</Text>}

          {/* Actions */}
          <View style={s.masterActionCard}>
            <Text style={s.sectionTitle}>ACTIONS</Text>
            <TouchableOpacity style={[s.btn, { marginTop: 12 }]} onPress={() => resetPassword(d.code)}>
              <Text style={s.btnText}>Reset Admin Password</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { marginTop: 10, borderColor: "#F59E0B" }]} onPress={() => confirmAction("Force rebuild", "Clear this schema so they re-onboard? Their pricing will be wiped.", () => businessAction(d.code, "clear-schema", () => openBusiness(d.code)))}>
              <Text style={[s.btnSecondaryText, { color: "#F59E0B" }]}>Force Schema Rebuild</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { marginTop: 10 }]} onPress={() => businessAction(d.code, d.suspended ? "unsuspend" : "suspend", () => openBusiness(d.code))}>
              <Text style={s.btnSecondaryText}>{d.suspended ? "Unsuspend Business" : "Suspend Business"}</Text>
            </TouchableOpacity>
            {!confirmingDelete ? (
              <TouchableOpacity style={[s.btnSecondary, { marginTop: 10, borderColor: B.red }]} onPress={() => { setConfirmingDelete(true); setDeleteName(""); }}>
                <Text style={[s.btnSecondaryText, { color: B.red }]}>Delete Business</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ marginTop: 10, gap: 8, borderWidth: 1, borderColor: B.red, borderRadius: 12, padding: 12 }}>
                <Text style={{ color: B.red, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>Permanently deletes the business and ALL its quotes, team, and brand config. This cannot be undone.</Text>
                <Text style={{ color: B.gray2, fontSize: 13, fontFamily: "DMSans_400Regular" }}>Type the business name (<Text style={{ fontFamily: "DMSans_700Bold", color: B.gray1 }}>{d.name}</Text>) to confirm:</Text>
                <TextInput style={s.input} value={deleteName} onChangeText={setDeleteName} placeholder={d.name} placeholderTextColor={B.gray3} autoCapitalize="none" autoCorrect={false} />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={() => { setConfirmingDelete(false); setDeleteName(""); }}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity disabled={deleteName.trim() !== d.name} style={[s.btn, { flex: 1, backgroundColor: B.red }, deleteName.trim() !== d.name && { opacity: 0.4 }]} onPress={() => businessAction(d.code, "delete", () => { setConfirmingDelete(false); setDetail(null); setResults(rs => rs.filter(r => r.code !== d.code)); })}>
                    <Text style={s.btnText}>Delete forever</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <View style={{ marginTop: 14, gap: 8 }}>
              <Text style={s.formLabel}>Send notification</Text>
              <TextInput style={[s.input, { minHeight: 60, textAlignVertical: "top" }]} value={notifyMsg} onChangeText={setNotifyMsg} placeholder="Message to send to this business…" placeholderTextColor={B.gray3} multiline />
              <TouchableOpacity style={[s.btnSecondary, { borderColor: B.blue }]} onPress={() => sendNotification(d.code)}><Text style={[s.btnSecondaryText, { color: B.blue }]}>Send</Text></TouchableOpacity>
            </View>
          </View>
          {busy && <ActivityIndicator color={B.blue} />}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── HOME ──
  return (
    <SafeAreaView style={s.container}>
      <View style={s.navBar}>
        <View style={{ width: 60 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity activeOpacity={1} onPress={handleLogoTap}>
            <Image source={require("../../assets/images/logo-horizontal.png")} style={{ width: 73, height: 22 }} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={s.navTitle}>Support</Text>
        </View>
        <TouchableOpacity onPress={onSignOut} style={{ width: 60, alignItems: "flex-end" }}>
          <Text style={{ color: B.gray3, fontSize: 13, fontFamily: "DMSans_400Regular" }}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <TouchableOpacity style={[s.btn, { backgroundColor: B.cyan }]} onPress={() => setShowDemoPicker(true)}>
          <Text style={[s.btnText, { color: B.midnight }]}>Demo Mode</Text>
        </TouchableOpacity>

        {/* PLATFORM HEALTH */}
        <Text style={s.sectionTitle}>PLATFORM HEALTH</Text>
        <View style={s.infoCard}>
          {stats ? (
            <View style={{ gap: 6 }}>
              <Stat label="Total businesses" value={stats.businesses} />
              <Stat label="Total quotes" value={stats.quotes} />
              <Stat label="Signed quotes" value={stats.signed} />
              <Stat label="Blank / broken schemas" value={stats.blankSchemas} warn={stats.blankSchemas > 0} />
              <Stat label="Businesses with 0 quotes" value={stats.zeroQuoteBusinesses} />
            </View>
          ) : <Text style={s.emptyText}>{err || "Loading platform stats…"}</Text>}
          <TouchableOpacity style={[s.btnSecondary, { marginTop: 12, borderColor: B.blue }]} onPress={ping}>
            <Text style={[s.btnSecondaryText, { color: B.blue }]}>{pingMs == null ? "Ping proxy" : pingMs < 0 ? "Proxy unreachable" : `Proxy OK · ${pingMs}ms`}</Text>
          </TouchableOpacity>
        </View>

        {/* BUSINESS MANAGEMENT */}
        <Text style={s.sectionTitle}>BUSINESS MANAGEMENT</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Search name, username, or ID" placeholderTextColor={B.gray3} value={query} onChangeText={setQuery} onSubmitEditing={search} autoCapitalize="none" />
          <TouchableOpacity style={[s.btn, { paddingHorizontal: 20, justifyContent: "center" }]} onPress={search}>
            {searching ? <ActivityIndicator color={B.white} /> : <Text style={s.btnText}>Search</Text>}
          </TouchableOpacity>
        </View>
        {results.map(r => (
          <TouchableOpacity key={r.code} style={s.historyCard} onPress={() => openBusiness(r.code)}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={s.historyName}>{r.name}{r.suspended ? " (suspended)" : ""}</Text>
                <Text style={s.historyMeta}>{r.code} · {r.trade || "no trade"} · {r.quoteCount} quotes</Text>
                <Text style={[s.historyMeta, { marginTop: 2 }]}>{r.lastActive ? `Last active ${formatDate(r.lastActive)}` : "No activity"} · schema: {r.schemaStatus}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={B.blue} />
            </View>
          </TouchableOpacity>
        ))}

        {/* TOOLS */}
        <Text style={s.sectionTitle}>TOOLS</Text>
        <TouchableOpacity style={s.btnSecondary} onPress={exportCsv}>
          <Text style={s.btnSecondaryText}>Export All Businesses (CSV)</Text>
        </TouchableOpacity>
      </ScrollView>

      <DemoPickerModal visible={showDemoPicker} onClose={() => setShowDemoPicker(false)} onSelect={demo => { setShowDemoPicker(false); onStartDemo(demo); }} />
      <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: B.white, opacity: flash }} />
    </SafeAreaView>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: B.gray2, fontSize: 14, fontFamily: "DMSans_400Regular" }}>{label}</Text>
      <Text style={{ color: warn ? B.red : B.white, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{value}</Text>
    </View>
  );
}
