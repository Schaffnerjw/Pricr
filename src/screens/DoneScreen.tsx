import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Platform, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { BrandHeader } from "../components/BrandHeader";
import { KitIntroBubble } from "../components/KitIntroBubble";
import { B } from "../constants/brand";
import { getQuotes } from "../storage";
import { s } from "../styles";
import { Business, SavedQuote, User } from "../types";
import { getBrandPalette, ON_PRIMARY } from "../utils/colorUtils";
import { generateKitInsights } from "../utils/kitInsights";
import { getPushPermissionStatus, registerForPushNotifications } from "../utils/pushNotifications";

const PUSH_PROMPT_DISMISSED = "pricr_push_prompt_dismissed";
const DISMISSED_INSIGHTS = "pricr_dismissed_insights";

const DAY = 24 * 60 * 60 * 1000;

interface DashStats { realCount: number; monthCount: number; weekCount: number; accepted: number; pending: number; lastDaysAgo: number | null; }

function computeStats(qs: SavedQuote[]): DashStats {
  const now = new Date();
  const real = (qs || []).filter(q => !q.isSample);
  const monthCount = real.filter(q => { const d = new Date(q.timestamp); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const weekCount = real.filter(q => Date.now() - q.timestamp < 7 * DAY).length;
  const accepted = real.filter(q => q.status === "won").length;
  const pending = real.filter(q => !q.status || q.status === "open").length;
  const lastTs = real.reduce((m, q) => Math.max(m, q.timestamp), 0);
  const lastDaysAgo = lastTs > 0 ? Math.floor((Date.now() - lastTs) / DAY) : null;
  return { realCount: real.length, monthCount, weekCount, accepted, pending, lastDaysAgo };
}

// Greeting subtext that reflects real quote activity (FIX 24).
function subtextFor(st: DashStats | null): string {
  if (!st || st.realCount === 0) return "Ready to build your first quote.";
  if (st.accepted > 0) return `${st.accepted} quote${st.accepted !== 1 ? "s" : ""} accepted this month. Great work.`;
  if (st.weekCount > 0) return `You've quoted ${st.weekCount} job${st.weekCount !== 1 ? "s" : ""} this week. Keep closing.`;
  if (st.lastDaysAgo !== null && st.lastDaysAgo > 7) return `Last quote was ${st.lastDaysAgo} days ago — time to close some jobs.`;
  return "You're all set — let's close some jobs.";
}

export function DoneScreen({ business, currentUser, primaryColor, secondaryColor, showTestPrompt, isDemoMode, onOpenQuoteTool, onQuoteHistory, onQuotePipeline, onManageTeam, onReconfigure, onTestQuote, onDismissTestPrompt, onOpenSettings, onSetupTerms, schemaWarning, onFixSchema, onStats, quotesOverride, viewOnly, trialDaysLeft, onChoosePlan, hasPushToken, onPushToken }: {
  business: Business; currentUser: User; primaryColor: string; secondaryColor: string; showTestPrompt: boolean; isDemoMode?: boolean;
  onOpenQuoteTool: () => void; onQuoteHistory: () => void; onQuotePipeline?: () => void; onManageTeam: () => void; onReconfigure: () => void;
  onTestQuote: () => void; onDismissTestPrompt: () => void; onOpenSettings: () => void; onSetupTerms?: () => void;
  schemaWarning?: { ok: boolean; isPlaceholder: boolean; reason?: string } | null; onFixSchema?: () => void; onStats?: () => void;
  // View-as (super admin, read-only): inject the business's quotes (cross-tenant fetch happens via the
  // proxy, not the local RLS session) and hide the interactive Kit bubble.
  quotesOverride?: SavedQuote[]; viewOnly?: boolean;
  // Trial countdown banner (admin, non-demo) — shown when 1 day or less remains.
  trialDaysLeft?: number; onChoosePlan?: () => void;
  // Push notifications: whether a token is stored + a callback when one is obtained via the banner.
  hasPushToken?: boolean; onPushToken?: (token: string) => void;
}) {
  const isAdmin = currentUser.role === "admin" || currentUser.role === "superadmin";
  const pal = getBrandPalette(business);
  const onPrimary = ON_PRIMARY; // brand look: always white on the primary color
  const bg = pal.background;
  const [stats, setStats] = useState<DashStats | null>(quotesOverride ? computeStats(quotesOverride) : null);
  const [rawQuotes, setRawQuotes] = useState<SavedQuote[]>(quotesOverride ?? []);
  const [dismissed, setDismissed] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [dismissedInsights, setDismissedInsights] = useState<string[]>([]);

  useEffect(() => {
    if (quotesOverride) { setStats(computeStats(quotesOverride)); setRawQuotes(quotesOverride); return; }
    let mounted = true;
    getQuotes(business.code).then(qs => { if (mounted) { setStats(computeStats(qs)); setRawQuotes(qs); } });
    return () => { mounted = false; };
  }, [business.code, quotesOverride]);

  // Kit proactive insights — never in demo / view-only. One at a time, highest priority first;
  // dismissing rotates to the next. Dismissed ids persist in AsyncStorage.
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(DISMISSED_INSIGHTS).then(raw => {
      if (!mounted || !raw) return;
      try { const arr = JSON.parse(raw); if (Array.isArray(arr)) setDismissedInsights(arr); } catch { /* ignore */ }
    });
    return () => { mounted = false; };
  }, []);
  const insights = useMemo(
    () => (isDemoMode || viewOnly ? [] : generateKitInsights(rawQuotes, business.schema, business)),
    [rawQuotes, business, isDemoMode, viewOnly],
  );
  const activeInsight = insights.find(i => !dismissedInsights.includes(i.id)) || null;
  const dismissInsight = async (id: string) => {
    const next = [...dismissedInsights, id];
    setDismissedInsights(next);
    try { await AsyncStorage.setItem(DISMISSED_INSIGHTS, JSON.stringify(next.slice(-50))); } catch { /* ignore */ }
  };

  // Decide whether to offer the notifications opt-in: admin, not view-only/demo, no token yet,
  // permission still undetermined, and not previously dismissed.
  useEffect(() => {
    if (!isAdmin || viewOnly || isDemoMode || hasPushToken || !onPushToken) return;
    let mounted = true;
    (async () => {
      try {
        const dismissedPrompt = await AsyncStorage.getItem(PUSH_PROMPT_DISMISSED);
        if (dismissedPrompt) return;
        const status = await getPushPermissionStatus();
        if (mounted && (status === "undetermined" || status === "unknown")) setShowPushBanner(true);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [isAdmin, viewOnly, isDemoMode, hasPushToken, onPushToken]);

  const enablePush = async () => {
    setShowPushBanner(false);
    try { await AsyncStorage.setItem(PUSH_PROMPT_DISMISSED, "1"); } catch { /* ignore */ }
    const token = await registerForPushNotifications();
    if (token) onPushToken?.(token);
  };
  const dismissPush = async () => {
    setShowPushBanner(false);
    try { await AsyncStorage.setItem(PUSH_PROMPT_DISMISSED, "1"); } catch { /* ignore */ }
  };

  // Onboarding summary card: visible only until the first quote exists, then hidden permanently (FIX 19).
  const showOnboardingCard = !!business.schema && !business.hasGeneratedQuote && (stats?.realCount ?? 0) === 0;
  const hasQuotes = (stats?.realCount ?? 0) > 0;

  const StatCard = ({ label, value }: { label: string; value: number }) => (
    <View style={{ flex: 1, backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 12, gap: 4, alignItems: "center" }}>
      <Text style={{ fontSize: 26, fontWeight: "800", color: primaryColor, fontFamily: "Syne_800ExtraBold" }}>{value}</Text>
      <Text style={{ fontSize: 11, fontWeight: "700", color: pal.textMuted, letterSpacing: 0.5, fontFamily: "DMSans_700Bold", textAlign: "center" }}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: bg }]}>
      <BrandHeader business={business} right={
        isDemoMode ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: primaryColor }} />
            <Text style={{ color: pal.textMuted, fontSize: 11, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Demo Mode</Text>
          </View>
        ) : undefined
      } />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingTop: 24, paddingBottom: 96 }}>
        {/* Trial countdown — last day(s) of the 3-day trial. Tapping opens the plan chooser. */}
        {isAdmin && typeof trialDaysLeft === "number" && trialDaysLeft <= 1 && onChoosePlan && (
          <TouchableOpacity style={[s.brandBanner, { borderColor: primaryColor, backgroundColor: primaryColor + "1A", flexDirection: "row", alignItems: "center", gap: 10 }]} onPress={onChoosePlan}>
            <Feather name="clock" size={18} color={primaryColor} />
            <Text style={[s.brandBannerText, { color: pal.text, flex: 1 }]}>
              Your 3-day trial ends {trialDaysLeft <= 0 ? "today" : "tomorrow"} — <Text style={{ color: primaryColor, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Choose your plan →</Text>
            </Text>
          </TouchableOpacity>
        )}
        {/* Notifications opt-in — a Pricr SYSTEM notification, so it uses Pricr's own dark palette
            (never the business brand) to stay readable on ANY custom background. */}
        {showPushBanner && (
          <View style={{ backgroundColor: "#0A0E1A", borderLeftWidth: 3, borderLeftColor: "#2979FF", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, ...(Platform.OS === "web" ? { backdropFilter: "blur(8px)" } as any : {}) }}>
            <Feather name="bell" size={18} color="#2979FF" />
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "DMSans_600SemiBold", flex: 1 }}>Enable notifications to know when clients sign ✓</Text>
            <TouchableOpacity onPress={enablePush}><Text style={{ color: "#2979FF", fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Enable</Text></TouchableOpacity>
            <TouchableOpacity onPress={dismissPush}><Text style={{ color: "#94A3B8", fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>Not now</Text></TouchableOpacity>
          </View>
        )}
        {/* Schema validation banner (Parts 6/10) — urgent styling for the $100/placeholder case. */}
        {isAdmin && schemaWarning && !schemaWarning.ok && onFixSchema && (
          <TouchableOpacity
            style={[s.brandBanner, { borderColor: schemaWarning.isPlaceholder ? B.red : primaryColor + "60", backgroundColor: schemaWarning.isPlaceholder ? B.red + "1A" : undefined }]}
            onPress={onFixSchema}
          >
            <Feather name="alert-triangle" size={18} color={schemaWarning.isPlaceholder ? B.red : primaryColor} />
            <Text style={[s.brandBannerText, { color: pal.text }]}>
              {schemaWarning.isPlaceholder
                ? "Your quote tool is using a placeholder — your real pricing wasn't saved. Tap to fix in 2 minutes."
                : "Your quote tool needs attention — tap here to fix it."}
            </Text>
            <Feather name="chevron-right" size={18} color={pal.textMuted} />
          </TouchableOpacity>
        )}

        {pal.adjusted && (
          <TouchableOpacity style={[s.brandBanner, { borderColor: primaryColor + "60" }]} onPress={onOpenSettings}>
            <Feather name="alert-triangle" size={18} color={primaryColor} />
            <Text style={[s.brandBannerText, { color: pal.text }]}>Your brand colors need adjustment — visit Settings to fix</Text>
            <Feather name="chevron-right" size={18} color={pal.textMuted} />
          </TouchableOpacity>
        )}

        {/* Greeting + dynamic subtext */}
        <View>
          <Text style={[s.h1, { color: pal.text }]}>Hey, {currentUser.name}.</Text>
          <Text style={[s.body, { marginTop: 4, color: pal.textMuted }]}>{subtextFor(stats)}</Text>
        </View>

        {isAdmin && business.brandConfigured === false && (
          <TouchableOpacity style={[s.brandBanner, { borderColor: primaryColor + "60" }]} onPress={onOpenSettings}>
            <Feather name="alert-circle" size={18} color={primaryColor} />
            <Text style={s.brandBannerText}>Brand setup incomplete — finish in Settings</Text>
            <Feather name="chevron-right" size={18} color={B.gray3} />
          </TouchableOpacity>
        )}

        {showTestPrompt && !dismissed && (
          <View style={[s.configCard, { backgroundColor: pal.surface, borderColor: primaryColor + "60", gap: 10 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Feather name="check-circle" size={18} color={primaryColor} />
                <Text style={{ fontSize: 16, fontWeight: "800", color: pal.text, fontFamily: "Syne_700Bold" }}>Your tool is ready</Text>
              </View>
              <TouchableOpacity onPress={() => { setDismissed(true); onDismissTestPrompt(); }}>
                <Feather name="x" size={20} color={pal.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[s.body, { color: pal.textMuted }]}>Want to run a test quote to see it in action?</Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor }]} onPress={() => { setDismissed(true); onTestQuote(); }}>
              <Text style={[s.btnText, { color: onPrimary }]}>Run a test quote</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Onboarding summary — collapsible, only before the first quote (no deposit row; FIX 18/19/21) */}
        {showOnboardingCard && business.schema && (
          <View style={[s.configCard, { backgroundColor: pal.surface, borderColor: pal.border, gap: summaryOpen ? 8 : 0 }]}>
            <TouchableOpacity onPress={() => setSummaryOpen(o => !o)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: pal.text, fontFamily: "Syne_700Bold" }}>What Kit set up for you</Text>
              <Feather name={summaryOpen ? "chevron-up" : "chevron-down"} size={20} color={pal.textMuted} />
            </TouchableOpacity>
            {summaryOpen && [
              ["TRADE", business.schema.trade],
              ["CUSTOM INPUTS", `${business.schema.fields?.length} field${business.schema.fields?.length !== 1 ? "s" : ""} built for your trade`],
              ["ADD-ONS", business.schema.addOns?.length > 0 ? business.schema.addOns.map((a: any) => a.label).join(", ") : "None set up"],
            ].map(([label, value], i, arr) => (
              <View key={label}>
                <View style={{ gap: 4, paddingVertical: 4 }}>
                  <Text style={[s.configLabel, { color: pal.textMuted }]}>{label}</Text>
                  <Text style={[s.configValue, { color: pal.text }]}>{value}</Text>
                </View>
                {i < arr.length - 1 && <View style={[s.sep, { backgroundColor: pal.border }]} />}
              </View>
            ))}
          </View>
        )}

        {/* Stats — hidden entirely at 0 quotes; replaced with an encouragement that opens the tool (FIX 20) */}
        {hasQuotes ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard label="THIS MONTH" value={stats!.monthCount} />
            <StatCard label="ACCEPTED" value={stats!.accepted} />
            <StatCard label="PENDING" value={stats!.pending} />
          </View>
        ) : !showOnboardingCard && (
          <TouchableOpacity onPress={onOpenQuoteTool} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
            <Text style={{ color: primaryColor, fontSize: 16, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Ready to build your first quote</Text>
            <Feather name="arrow-right" size={18} color={primaryColor} />
          </TouchableOpacity>
        )}

        {/* Primary CTA */}
        <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor }]} onPress={onOpenQuoteTool}>
          <Text style={[s.btnText, { color: onPrimary }]}>Open My Quote Tool</Text>
        </TouchableOpacity>

        {/* Kit noticed something — one proactive insight at a time (highest priority). */}
        {isAdmin && activeInsight && (
          <View style={[s.configCard, { backgroundColor: pal.surface, borderColor: primaryColor + "55", gap: 10 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: primaryColor, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="zap" size={14} color={onPrimary} />
                </View>
                <Text style={{ fontSize: 14, fontWeight: "800", color: pal.text, fontFamily: "Syne_700Bold" }}>Kit noticed something</Text>
              </View>
              <TouchableOpacity onPress={() => dismissInsight(activeInsight.id)} hitSlop={8}>
                <Feather name="x" size={18} color={pal.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[s.body, { color: pal.text }]}>{activeInsight.message}</Text>
            {activeInsight.action && onReconfigure && (
              <TouchableOpacity style={[s.btnSecondary, { borderColor: primaryColor, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]} onPress={() => { dismissInsight(activeInsight.id); onReconfigure(); }}>
                <Feather name="message-circle" size={15} color={primaryColor} />
                <Text style={[s.btnSecondaryText, { color: primaryColor }]}>{activeInsight.action.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* My Stats — prominent, admin only (shareable brag card + deep dive). */}
        {isAdmin && onStats && (
          <TouchableOpacity style={[s.btnSecondary, { borderColor: primaryColor, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]} onPress={onStats}>
            <Feather name="award" size={17} color={primaryColor} />
            <Text style={[s.btnSecondaryText, { color: primaryColor }]}>My Stats</Text>
          </TouchableOpacity>
        )}

        {/* Secondary actions — medium, outlined */}
        <View style={{ gap: 12 }}>
          {hasQuotes && (
            <TouchableOpacity style={[s.btnSecondary, { borderColor: secondaryColor + "80", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]} onPress={onOpenQuoteTool}>
              <Feather name="plus" size={16} color={secondaryColor} />
              <Text style={[s.btnSecondaryText, { color: secondaryColor }]}>New Quote</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.btnSecondary, { borderColor: secondaryColor + "80" }]} onPress={onQuoteHistory}>
            <Text style={[s.btnSecondaryText, { color: secondaryColor }]}>Quote History</Text>
          </TouchableOpacity>
          {isAdmin && onQuotePipeline && (
            <TouchableOpacity style={[s.btnSecondary, { borderColor: secondaryColor + "80" }]} onPress={onQuotePipeline}>
              <Text style={[s.btnSecondaryText, { color: secondaryColor }]}>Quote Pipeline</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity style={[s.btnSecondary, { borderColor: secondaryColor + "80" }]} onPress={onManageTeam}>
              <Text style={[s.btnSecondaryText, { color: secondaryColor }]}>Manage Team</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Admin-only tertiary — small text links */}
        {isAdmin && (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 4 }}>
            <TouchableOpacity onPress={onReconfigure}>
              <Text style={{ color: pal.textMuted, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>Reconfigure with Kit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onOpenSettings}>
              <Text style={{ color: pal.textMuted, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>Settings</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {isAdmin && !viewOnly && <KitIntroBubble business={business} onSetupTerms={onSetupTerms ?? onOpenSettings} />}
    </SafeAreaView>
  );
}
