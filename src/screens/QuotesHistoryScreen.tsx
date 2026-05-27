import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Linking, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { B, SIGN_BASE } from "../constants/brand";
import { QuoteRow, QuoteStatus, useQuotes } from "../hooks/useQuotes";
import { s } from "../styles";
import { LostReason, QuoteOutcome } from "../types";
import { getBrandPalette, ON_PRIMARY } from "../utils/colorUtils";
import { filterQuotes, HistorySort, HistoryStatusFilter } from "../utils/quoteFilter";
import { formatDate, formatMoney } from "../utils/helpers";
import { shareQuotePDF } from "../utils/shareQuotePDF";

// A quote is "expired" if its validity window passed and it was never signed/accepted.
const isExpiredRow = (q: QuoteRow): boolean => {
  const exp = q.quote_data?.expiresAt as number | undefined;
  return !!exp && exp < Date.now() && !q.signed_at && q.status !== "accepted";
};

// Non-intrusive win/loss prompt shown under declined/expired quotes with no recorded outcome.
const LOSS_OPTIONS: { label: string; outcome: QuoteOutcome; reason: LostReason }[] = [
  { label: "Too expensive", outcome: "lost", reason: "too_expensive" },
  { label: "Went with competitor", outcome: "lost", reason: "competitor" },
  { label: "Project cancelled", outcome: "cancelled", reason: "project_cancelled" },
  { label: "No response", outcome: "lost", reason: "no_response" },
];
function OutcomePrompt({ pal, accent, onRecord }: { pal: { surface: string; border: string; text: string; textMuted: string }; accent: string; onRecord: (patch: { outcome: QuoteOutcome; lostReason: LostReason; lostNote?: string }) => void }) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: pal.border, paddingTop: 10, gap: 8 }}>
      <Text style={{ color: pal.textMuted, fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>What happened with this quote?</Text>
      {otherOpen ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput style={{ flex: 1, backgroundColor: pal.surface, color: pal.text, borderColor: pal.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: "DMSans_400Regular", fontSize: 14 }} placeholder="What happened?" placeholderTextColor={pal.textMuted} value={note} onChangeText={t => setNote(t.slice(0, 200))} autoFocus />
          <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }} onPress={() => onRecord({ outcome: "lost", lostReason: "other", lostNote: note.trim() || undefined })}>
            <Text style={{ color: ON_PRIMARY, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Save</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {LOSS_OPTIONS.map(o => (
            <TouchableOpacity key={o.reason} style={{ borderWidth: 1, borderColor: pal.border, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 11 }} onPress={() => onRecord({ outcome: o.outcome, lostReason: o.reason })}>
              <Text style={{ color: pal.text, fontSize: 12, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>{o.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={{ borderWidth: 1, borderColor: pal.border, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 11 }} onPress={() => setOtherOpen(true)}>
            <Text style={{ color: pal.textMuted, fontSize: 12, fontWeight: "600", fontFamily: "DMSans_600SemiBold" }}>Other</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: B.gray3, sent: B.blue, accepted: B.green, declined: B.red,
};

// True if the quote was signed within the last 24h (drives the "NEW SIGNATURE" badge).
const isNewSignature = (q: QuoteRow) => !!q.signed_at && (Date.now() - new Date(q.signed_at).getTime() < 24 * 60 * 60 * 1000);
const hasSignature = (q: QuoteRow) => !!(q.signature_data || q.quote_data?.signatureData);
// Privacy-preserving IP for the inline summary: show the first three octets, mask the last.
const maskIp = (ip?: string | null) => {
  if (!ip) return null;
  const parts = ip.split(".");
  return parts.length >= 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.*` : ip;
};
const relTime = (ts: number): string => {
  const h = Math.floor((Date.now() - ts) / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
// Expiry pill: green "Valid until", amber "Expires in N days" (<=3), red "Expired". Hidden once signed.
const expiryPill = (q: QuoteRow): { label: string; color: string } | null => {
  const exp = q.quote_data?.expiresAt as number | undefined;
  if (!exp || q.signed_at) return null;
  const days = Math.ceil((exp - Date.now()) / 86400000);
  if (days < 0) return { label: "Expired", color: B.red };
  if (days <= 3) return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, color: "#F59E0B" };
  return { label: `Valid until ${formatDate(exp)}`, color: B.green };
};
const viewPill = (q: QuoteRow): { label: string; color: string } => {
  if (!q.first_viewed_at) return { label: "Not yet opened", color: B.gray3 };
  const vc = q.view_count || 1;
  return vc > 1 ? { label: `Viewed ${vc} times`, color: B.blue } : { label: `Viewed ${relTime(new Date(q.first_viewed_at).getTime())}`, color: B.blue };
};

// Supabase-backed quote history. Admins can mark accepted/declined from the detail view; reps are read-only.
export function QuotesHistoryScreen({ businessId, isAdmin, onBack, accentColor, backgroundColor, termsAndConditions, onDuplicate }: {
  businessId?: string; isAdmin: boolean; onBack: () => void; accentColor?: string; backgroundColor?: string; termsAndConditions?: string;
  // Start a new quote pre-filled with this quote's field values (client/notes cleared).
  onDuplicate?: (fieldValues: Record<string, any>) => void;
}) {
  const { quotes, updateQuoteStatus, updateQuoteData, loading, error } = useQuotes(businessId);
  const [selected, setSelected] = useState<QuoteRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [sort, setSort] = useState<HistorySort>("newest");
  const accent = accentColor || B.blue;
  const pal = getBrandPalette({ brand: { primaryColor: accent, secondaryColor: accent, backgroundColor: backgroundColor || "#0A0E1A", logoUri: null, tagline: "", phone: "", email: "", address: "" } });

  const downloadSignedPDF = async (q: QuoteRow) => {
    const pres = q.quote_data?.presentation;
    if (!pres) return;
    await shareQuotePDF({
      ...pres,
      signatureData: q.quote_data?.signatureData || q.signature_data || undefined,
      signedAt: q.signed_at ? new Date(q.signed_at).getTime() : undefined,
      termsAndConditions,
      // Electronic signature record (audit) for the PDF block.
      signingToken: q.signing_token || undefined,
      signerIp: q.signer_ip || undefined,
      documentHash: q.document_hash || undefined,
      phoneVerified: !!q.phone_verified,
      certificateUrl: q.signing_token ? `${SIGN_BASE}/sign/${encodeURIComponent(q.signing_token)}/certificate` : undefined,
    });
  };

  // Open the public Certificate of Completion (audit trail) in the device browser. Token-gated.
  const openCertificate = (q: QuoteRow) => {
    if (!q.signing_token) return;
    Linking.openURL(`${SIGN_BASE}/sign/${encodeURIComponent(q.signing_token)}/certificate`).catch(() => {});
  };

  const NewBadge = () => (
    <View style={{ backgroundColor: accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: ON_PRIMARY, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, fontFamily: "DMSans_700Bold" }}>NEW SIGNATURE</Text>
    </View>
  );

  const Badge = ({ status }: { status: QuoteStatus }) => (
    <View style={{ backgroundColor: STATUS_COLOR[status] + "22", borderColor: STATUS_COLOR[status], borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: STATUS_COLOR[status], fontSize: 11, fontWeight: "700", letterSpacing: 0.5, fontFamily: "DMSans_700Bold" }}>{status.toUpperCase()}</Text>
    </View>
  );

  const SmsBadge = () => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: B.green + "22", borderColor: B.green, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Feather name="check" size={10} color={B.green} />
      <Text style={{ color: B.green, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, fontFamily: "DMSans_700Bold" }}>SMS VERIFIED</Text>
    </View>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: pal.background }]}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={selected ? () => setSelected(null) : onBack} style={[s.navBack, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
          <Feather name="chevron-left" size={18} color={accent} />
          <Text style={[s.navBackText, { color: accent }]}>{selected ? "Back" : "Done"}</Text>
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: pal.text }]}>{selected ? "Quote" : "Quote History"}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={accent} /></View>
      ) : error ? (
        <View style={s.centered}><Text style={[s.emptyText, { color: pal.textMuted }]}>Couldn&apos;t load quotes: {error}</Text></View>
      ) : selected ? (
        // ── Detail (read-only; admin can change status) ──
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={[s.infoCard, { backgroundColor: pal.surface, borderColor: pal.border }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[s.historyName, { color: pal.text }]}>{selected.customer_name || "No name"}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {isNewSignature(selected) && <NewBadge />}
                {selected.phone_verified && <SmsBadge />}
                <Badge status={selected.status} />
              </View>
            </View>
            <Text style={[s.historyMeta, { color: pal.textMuted }]}>{formatDate(new Date(selected.created_at).getTime())}</Text>
            <Text style={[s.totalAmount, { color: pal.text, marginTop: 8 }]}>{formatMoney(selected.total || 0)}</Text>
            {selected.signed_at && (
              <Text style={[s.historyMeta, { color: B.green, marginTop: 6 }]}>
                Signed by {selected.customer_name || "client"} on {formatDate(new Date(selected.signed_at).getTime())}
                {selected.phone_verified ? " · SMS verified" : ""}
                {maskIp(selected.signer_ip) ? ` · IP: ${maskIp(selected.signer_ip)}` : ""}
              </Text>
            )}
          </View>

          {hasSignature(selected) && (
            <TouchableOpacity style={[s.btn, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: accent }]} onPress={() => downloadSignedPDF(selected)}>
              <Feather name="download" size={16} color={ON_PRIMARY} />
              <Text style={[s.btnText, { color: ON_PRIMARY }]}>Download Signed PDF</Text>
            </TouchableOpacity>
          )}
          {selected.signed_at && selected.signing_token && (
            <TouchableOpacity style={[s.btnSecondary, { borderColor: accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]} onPress={() => openCertificate(selected)}>
              <Feather name="award" size={16} color={accent} />
              <Text style={[s.btnSecondaryText, { color: accent }]}>View Certificate</Text>
            </TouchableOpacity>
          )}
          {onDuplicate && selected.quote_data?.fieldValues && (
            <TouchableOpacity style={[s.btnSecondary, { borderColor: accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]} onPress={() => onDuplicate(selected.quote_data.fieldValues as Record<string, any>)}>
              <Feather name="copy" size={16} color={accent} />
              <Text style={[s.btnSecondaryText, { color: accent }]}>Duplicate this quote</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <View style={{ gap: 10 }}>
              <Text style={[s.sectionTitle, { color: pal.textMuted }]}>UPDATE STATUS</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: B.green }]} onPress={() => updateQuoteStatus(selected.id, "accepted")}>
                  <Text style={[s.btnText, { color: ON_PRIMARY }]}>Accepted</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: B.red }]} onPress={() => updateQuoteStatus(selected.id, "declined")}>
                  <Text style={[s.btnText, { color: ON_PRIMARY }]}>Declined</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      ) : quotes.length === 0 ? (
        <View style={s.centered}><Text style={[s.emptyText, { color: pal.textMuted }]}>No quotes yet.</Text></View>
      ) : (() => {
        const visible = filterQuotes(quotes, { search, status: statusFilter, sort });
        const STATUSES: { key: HistoryStatusFilter; label: string }[] = [
          { key: "all", label: "All" }, { key: "pending", label: "Pending" }, { key: "sent", label: "Sent" }, { key: "signed", label: "Signed" }, { key: "expired", label: "Expired" },
        ];
        const SORTS: { key: HistorySort; label: string }[] = [
          { key: "newest", label: "Newest" }, { key: "oldest", label: "Oldest" }, { key: "highest", label: "Highest" }, { key: "lowest", label: "Lowest" },
        ];
        return (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 96 }}>
          {/* Search */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: pal.surface, borderColor: pal.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 }}>
            <Feather name="search" size={16} color={pal.textMuted} />
            <TextInput style={{ flex: 1, color: pal.text, paddingVertical: 10, fontFamily: "DMSans_400Regular", fontSize: 15 }} placeholder="Search by client name or amount" placeholderTextColor={pal.textMuted} value={search} onChangeText={setSearch} />
            {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}><Feather name="x" size={16} color={pal.textMuted} /></TouchableOpacity>}
          </View>
          {/* Status filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {STATUSES.map(f => { const on = statusFilter === f.key; return (
              <TouchableOpacity key={f.key} onPress={() => setStatusFilter(f.key)} style={{ borderWidth: 1, borderColor: on ? accent : pal.border, backgroundColor: on ? accent : "transparent", borderRadius: 18, paddingVertical: 6, paddingHorizontal: 13 }}>
                <Text style={{ color: on ? ON_PRIMARY : pal.textMuted, fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{f.label}</Text>
              </TouchableOpacity>
            ); })}
          </ScrollView>
          {/* Sort + count */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: pal.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{visible.length === quotes.length ? `${quotes.length} quotes` : `${visible.length} of ${quotes.length} quotes`}</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {SORTS.map(so => { const on = sort === so.key; return (
                <TouchableOpacity key={so.key} onPress={() => setSort(so.key)}><Text style={{ color: on ? accent : pal.textMuted, fontSize: 12, fontWeight: on ? "800" : "600", fontFamily: "DMSans_600SemiBold" }}>{so.label}</Text></TouchableOpacity>
              ); })}
            </View>
          </View>

          {visible.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
              <Text style={{ color: pal.textMuted, fontSize: 15, fontFamily: "DMSans_400Regular", textAlign: "center" }}>No quotes matching {search ? `"${search}"` : "these filters"}</Text>
              <TouchableOpacity onPress={() => { setSearch(""); setStatusFilter("all"); }}><Text style={{ color: accent, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Clear filters</Text></TouchableOpacity>
            </View>
          ) : visible.map(q => {
            const notes = (q.quote_data?.notes as string | undefined) || (q.quote_data?.presentation?.notes as string | undefined);
            const outcome = q.quote_data?.outcome as QuoteOutcome | undefined;
            const showOutcomePrompt = !outcome && (q.status === "declined" || isExpiredRow(q));
            return (
            <View key={q.id} style={[s.historyCard, { backgroundColor: pal.surface, borderColor: pal.border }]}>
              <TouchableOpacity onPress={() => setSelected(q)}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Text style={[s.historyName, { color: pal.text }]}>{q.customer_name || "No name"}</Text>
                      <Badge status={q.status} />
                      {q.phone_verified && <SmsBadge />}
                      {isNewSignature(q) && <NewBadge />}
                    </View>
                    <Text style={[s.historyMeta, { marginTop: 4, color: pal.textMuted }]}>{formatDate(new Date(q.created_at).getTime())}</Text>
                    {notes ? <Text numberOfLines={1} style={{ color: pal.textMuted, fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 4 }}>📝 {notes}</Text> : null}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {(() => { const ep = expiryPill(q); return ep ? <View style={{ borderWidth: 1, borderColor: ep.color, borderRadius: 20, paddingVertical: 2, paddingHorizontal: 8 }}><Text style={{ color: ep.color, fontSize: 11, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{ep.label}</Text></View> : null; })()}
                      {(() => { const vp = viewPill(q); return <View style={{ borderWidth: 1, borderColor: vp.color, borderRadius: 20, paddingVertical: 2, paddingHorizontal: 8 }}><Text style={{ color: vp.color, fontSize: 11, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{vp.label}</Text></View>; })()}
                    </View>
                  </View>
                  <Text style={[s.historyTotal, { color: accent }]}>{formatMoney(q.total || 0)}</Text>
                </View>
              </TouchableOpacity>
              {showOutcomePrompt && (
                <OutcomePrompt pal={pal} accent={accent} onRecord={patch => updateQuoteData(q.id, patch)} />
              )}
            </View>
            );
          })}
        </ScrollView>
        );
      })()}
    </SafeAreaView>
  );
}
