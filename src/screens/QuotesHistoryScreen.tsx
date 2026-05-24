import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { QuoteRow, QuoteStatus, useQuotes } from "../hooks/useQuotes";
import { s } from "../styles";
import { formatDate, formatMoney } from "../utils/helpers";
import { shareQuotePDF } from "../utils/shareQuotePDF";

const STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: B.gray3, sent: B.blue, accepted: B.green, declined: B.red,
};

// True if the quote was signed within the last 24h (drives the "NEW SIGNATURE" badge).
const isNewSignature = (q: QuoteRow) => !!q.signed_at && (Date.now() - new Date(q.signed_at).getTime() < 24 * 60 * 60 * 1000);
const hasSignature = (q: QuoteRow) => !!(q.signature_data || q.quote_data?.signatureData);

// Supabase-backed quote history. Admins can mark accepted/declined from the detail view; reps are read-only.
export function QuotesHistoryScreen({ businessId, isAdmin, onBack, accentColor, termsAndConditions }: {
  businessId?: string; isAdmin: boolean; onBack: () => void; accentColor?: string; termsAndConditions?: string;
}) {
  const { quotes, updateQuoteStatus, loading, error } = useQuotes(businessId);
  const [selected, setSelected] = useState<QuoteRow | null>(null);
  const accent = accentColor || B.blue;

  const downloadSignedPDF = async (q: QuoteRow) => {
    const pres = q.quote_data?.presentation;
    if (!pres) return;
    await shareQuotePDF({
      ...pres,
      signatureData: q.quote_data?.signatureData || q.signature_data || undefined,
      signedAt: q.signed_at ? new Date(q.signed_at).getTime() : undefined,
      termsAndConditions,
    });
  };

  const NewBadge = () => (
    <View style={{ backgroundColor: accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: B.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, fontFamily: "DMSans_700Bold" }}>NEW SIGNATURE</Text>
    </View>
  );

  const Badge = ({ status }: { status: QuoteStatus }) => (
    <View style={{ backgroundColor: STATUS_COLOR[status] + "22", borderColor: STATUS_COLOR[status], borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: STATUS_COLOR[status], fontSize: 11, fontWeight: "700", letterSpacing: 0.5, fontFamily: "DMSans_700Bold" }}>{status.toUpperCase()}</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={selected ? () => setSelected(null) : onBack} style={[s.navBack, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
          <Feather name="chevron-left" size={18} color={B.blue} />
          <Text style={s.navBackText}>{selected ? "Back" : "Done"}</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>{selected ? "Quote" : "Quote History"}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={B.blue} /></View>
      ) : error ? (
        <View style={s.centered}><Text style={s.emptyText}>Couldn&apos;t load quotes: {error}</Text></View>
      ) : selected ? (
        // ── Detail (read-only; admin can change status) ──
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={s.infoCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.historyName}>{selected.customer_name || "No name"}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {isNewSignature(selected) && <NewBadge />}
                <Badge status={selected.status} />
              </View>
            </View>
            <Text style={s.historyMeta}>{formatDate(new Date(selected.created_at).getTime())}</Text>
            <Text style={[s.totalAmount, { color: B.white, marginTop: 8 }]}>{formatMoney(selected.total || 0)}</Text>
            {selected.signed_at && (
              <Text style={[s.historyMeta, { color: B.green, marginTop: 6 }]}>Signed {formatDate(new Date(selected.signed_at).getTime())}</Text>
            )}
          </View>

          {hasSignature(selected) && (
            <TouchableOpacity style={[s.btn, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: accent }]} onPress={() => downloadSignedPDF(selected)}>
              <Feather name="download" size={16} color={B.white} />
              <Text style={s.btnText}>Download Signed PDF</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <View style={{ gap: 10 }}>
              <Text style={s.sectionTitle}>UPDATE STATUS</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: B.green }]} onPress={() => updateQuoteStatus(selected.id, "accepted")}>
                  <Text style={s.btnText}>Accepted</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: B.red }]} onPress={() => updateQuoteStatus(selected.id, "declined")}>
                  <Text style={s.btnText}>Declined</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      ) : quotes.length === 0 ? (
        <View style={s.centered}><Text style={s.emptyText}>No quotes yet.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          {quotes.map(q => (
            <TouchableOpacity key={q.id} style={s.historyCard} onPress={() => setSelected(q)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={s.historyName}>{q.customer_name || "No name"}</Text>
                    <Badge status={q.status} />
                    {isNewSignature(q) && <NewBadge />}
                  </View>
                  <Text style={[s.historyMeta, { marginTop: 4 }]}>{formatDate(new Date(q.created_at).getTime())}</Text>
                </View>
                <Text style={[s.historyTotal, { color: B.blue }]}>{formatMoney(q.total || 0)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
