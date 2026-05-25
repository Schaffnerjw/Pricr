import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { BrandHeader } from "../components/BrandHeader";
import { EmptyArt } from "../components/EmptyArt";
import { B } from "../constants/brand";
import { deleteQuote as deleteQuoteFromStorage, getQuotes, updateQuote } from "../storage";
import { s } from "../styles";
import { Business, QuoteStatus, SavedQuote, User } from "../types";
import { getBrandPalette, ON_PRIMARY } from "../utils/colorUtils";
import { formatDate, formatMoney } from "../utils/helpers";

const dotColor = (status?: QuoteStatus) => status === "won" ? B.green : status === "lost" ? B.red : B.gray3;

export function HistoryScreen({ business, currentUser, onBack, onNewQuote }: {
  business: Business; currentUser: User; onBack: () => void; onNewQuote: () => void;
}) {
  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const brand = business.brand;
  const pal = getBrandPalette(business);
  const onPrimary = ON_PRIMARY;

  useEffect(() => { loadQuotes(); }, []);
  // Debounce the search filter by 150ms.
  useEffect(() => { const id = setTimeout(() => setDebounced(query), 150); return () => clearTimeout(id); }, [query]);

  const loadQuotes = async () => {
    let all = await getQuotes(business.code);
    if (currentUser.role === "rep") all = all.filter(q => q.userId === currentUser.id);
    setQuotes(all);
    setLoading(false);
  };

  const setStatus = async (id: string, status: QuoteStatus) => {
    setMenuId(null);
    const prev = quotes;
    setQuotes(qs => qs.map(q => q.id === id ? { ...q, status } : q));
    try { await updateQuote(business.code, id, { status }); }
    catch { setQuotes(prev); Alert.alert("Couldn't update", "We couldn't update this quote. Check your connection and try again."); }
  };
  const remove = async (id: string) => {
    setMenuId(null);
    const prev = quotes;
    setQuotes(qs => qs.filter(q => q.id !== id));
    try { await deleteQuoteFromStorage(business.code, id); }
    catch { setQuotes(prev); Alert.alert("Couldn't delete", "We couldn't delete this quote. Check your connection and try again."); }
  };

  const real = quotes.filter(q => !q.isSample);
  const won = real.filter(q => q.status === "won");
  const lost = real.filter(q => q.status === "lost").length;
  const open = real.filter(q => !q.status || q.status === "open").length;
  const wonSum = won.reduce((sum, q) => sum + (q.total || 0), 0);

  const filtered = quotes
    .filter(q => (q.customerName || "").toLowerCase().includes(debounced.trim().toLowerCase()))
    .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: pal.background }]}>
      <BrandHeader business={business} right={
        <TouchableOpacity onPress={onBack}><Text style={[s.navBackText, { color: brand.primaryColor }]}>Done</Text></TouchableOpacity>
      } />

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={brand.primaryColor} /></View>
      ) : quotes.length === 0 ? (
        <View style={s.centered}>
          <EmptyArt color={brand.primaryColor} />
          <Text style={[s.h2, { color: pal.text }]}>No quotes yet</Text>
          <Text style={[s.body, { textAlign: "center", marginVertical: 12, color: pal.textMuted }]}>No quotes yet — open your tool to get started.</Text>
          <TouchableOpacity style={[s.btn, { backgroundColor: brand.primaryColor }]} onPress={onNewQuote}>
            <Text style={[s.btnText, { color: onPrimary }]}>Open Quote Tool</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
          {/* Outcome summary */}
          <View style={s.histSummaryRow}>
            <Text style={[s.histSummaryItem, { color: B.green }]}>Won: {won.length} ({formatMoney(wonSum)})</Text>
            <Text style={[s.histSummaryItem, { color: B.red }]}>Lost: {lost}</Text>
            <Text style={[s.histSummaryItem, { color: pal.textMuted }]}>Open: {open}</Text>
          </View>

          {/* Search */}
          <View style={[s.histSearch, { backgroundColor: pal.surface, borderColor: pal.border }]}>
            <Feather name="search" size={16} color={pal.textMuted} />
            <TextInput style={[s.histSearchInput, { color: pal.text }]} placeholder="Search by customer name" placeholderTextColor={pal.textMuted} value={query} onChangeText={setQuery} autoCapitalize="none" />
            {query ? <TouchableOpacity onPress={() => setQuery("")}><Feather name="x" size={16} color={pal.textMuted} /></TouchableOpacity> : null}
          </View>

          {filtered.length === 0 ? (
            <Text style={[s.emptyText, { textAlign: "center", marginTop: 20, color: pal.textMuted }]}>No matches for “{debounced}”.</Text>
          ) : filtered.map(q => (
            <TouchableOpacity key={q.id} style={[s.historyCard, { backgroundColor: pal.surface, borderColor: pal.border }]} onLongPress={() => setMenuId(q.id)} delayLongPress={250}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <View style={s.histRowTop}>
                    <View style={[s.histDot, { backgroundColor: dotColor(q.status) }]} />
                    <Text style={[s.historyName, { color: pal.text }]}>{q.customerName || "No name"}</Text>
                    {q.isSample && (
                      <View style={{ backgroundColor: pal.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.5, color: pal.textMuted, fontFamily: "DMSans_700Bold" }}>SAMPLE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.historyMeta, { marginTop: 4, color: pal.textMuted }]}>{q.trade} · {formatDate(q.timestamp)}{currentUser.role === "admin" && q.repName ? ` · ${q.repName}` : ""}</Text>
                </View>
                <Text style={[s.historyTotal, { color: brand.primaryColor }]}>{formatMoney(q.total || 0)}</Text>
              </View>
              <Text style={{ color: pal.textMuted, fontSize: 11, marginTop: 6, fontFamily: "DMSans_400Regular" }}>Long-press to mark won/lost or delete</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Long-press action menu */}
      <Modal visible={!!menuId} transparent animationType="fade" onRequestClose={() => setMenuId(null)}>
        <Pressable_ onClose={() => setMenuId(null)}>
          <View style={[s.masterCard, { gap: 10 }]}>
            <Text style={[s.h2, { marginBottom: 4 }]}>Update quote</Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: B.green }]} onPress={() => menuId && setStatus(menuId, "won")}><Text style={s.btnText}>Mark Won</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: B.red }]} onPress={() => menuId && setStatus(menuId, "lost")}><Text style={s.btnText}>Mark Lost</Text></TouchableOpacity>
            <TouchableOpacity style={s.btnSecondary} onPress={() => menuId && remove(menuId)}><Text style={[s.btnSecondaryText, { color: B.red }]}>Delete Quote</Text></TouchableOpacity>
            <TouchableOpacity style={s.btnSecondary} onPress={() => setMenuId(null)}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
          </View>
        </Pressable_>
      </Modal>
    </SafeAreaView>
  );
}

// Dimmed, tap-outside-to-close backdrop for the action menu.
function Pressable_({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <TouchableOpacity activeOpacity={1} onPress={onClose} style={s.masterOverlay}>
      <TouchableOpacity activeOpacity={1} onPress={() => { }} style={{ width: "100%" }}>{children}</TouchableOpacity>
    </TouchableOpacity>
  );
}
