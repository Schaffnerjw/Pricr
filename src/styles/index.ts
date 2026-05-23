import { StyleSheet } from "react-native";
import { B } from "../constants/brand";

// ── WHITE-LABEL HEADER ──────────────────────────────────────────────────────
export const wl = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  headerLeft: { flex: 1, gap: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { height: 36, width: 140 },
  quoteLogo: { height: 32, width: 120 },
  bizName: { fontSize: 18, fontWeight: "800", fontFamily: "Syne_800ExtraBold" },
  tagline: { fontSize: 11, color: B.gray3, fontFamily: "DMSans_400Regular" },
});

// ── MAIN STYLES ─────────────────────────────────────────────────────────────
export const s = StyleSheet.create({
  // Containers
  container: { flex: 1, backgroundColor: B.midnight },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },

  // Typography
  wordmark: { fontSize: 34, fontWeight: "800", color: B.white, letterSpacing: -0.5, fontFamily: "Syne_800ExtraBold" },
  hero: { fontSize: 38, fontWeight: "800", color: B.white, lineHeight: 44, letterSpacing: -0.5, fontFamily: "Syne_800ExtraBold" },
  h1: { fontSize: 28, fontWeight: "800", color: B.white, fontFamily: "Syne_800ExtraBold" },
  h2: { fontSize: 22, fontWeight: "700", color: B.white, fontFamily: "Syne_700Bold" },
  body: { fontSize: 15, color: B.gray3, lineHeight: 22, fontFamily: "DMSans_400Regular" },

  // Nav
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: B.border },
  navBack: { width: 60 },
  navBackText: { color: B.blue, fontSize: 17, fontWeight: "600", fontFamily: "DMSans_600SemiBold" },
  navTitle: { fontSize: 17, fontWeight: "700", color: B.white, fontFamily: "Syne_700Bold" },
  navSub: { fontSize: 12, color: B.gray3, textAlign: "center", fontFamily: "DMSans_400Regular" },

  // Buttons
  btn: { backgroundColor: B.blue, padding: 17, borderRadius: 14, alignItems: "center" },
  btnText: { color: B.white, fontSize: 17, fontWeight: "700", fontFamily: "DMSans_700Bold" },
  btnSecondary: { padding: 16, borderRadius: 14, alignItems: "center", borderWidth: 1, borderColor: B.border },
  btnSecondaryText: { color: B.gray3, fontSize: 15, fontWeight: "600", fontFamily: "DMSans_600SemiBold" },

  // Forms
  formLabel: { fontSize: 14, fontWeight: "700", color: B.gray1, fontFamily: "DMSans_700Bold" },
  formHint: { fontSize: 12, color: B.gray3, marginBottom: 2, fontFamily: "DMSans_400Regular" },
  input: { backgroundColor: B.card, borderRadius: 12, padding: 16, color: B.white, fontSize: 15, borderWidth: 1, borderColor: B.border, fontFamily: "DMSans_400Regular" },

  // Fields
  fieldGroup: { gap: 10 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: B.gray3, letterSpacing: 1.5, fontFamily: "DMSans_700Bold" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: B.card, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: B.border },
  chipText: { color: B.gray2, fontSize: 14, fontWeight: "600", fontFamily: "DMSans_600SemiBold" },
  toggleCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: B.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: B.border },
  toggleText: { fontSize: 15, color: B.gray1, fontWeight: "600", flex: 1, paddingRight: 12, fontFamily: "DMSans_600SemiBold" },

  // Closing card
  closingCard: { borderRadius: 20, padding: 24, borderWidth: 1, gap: 16 },
  closingCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  closingBiz: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, fontFamily: "DMSans_700Bold" },
  closingCustomer: { fontSize: 24, fontWeight: "800", fontFamily: "DMSans_700Bold", marginTop: 2 },
  closingDivider: { height: 1 },
  saveBtn: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1 },
  saveBtnText: { fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" },

  lineItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineLabel: { fontSize: 15, flex: 1, paddingRight: 8, fontFamily: "DMSans_400Regular" },
  lineValue: { fontSize: 15, fontWeight: "600", fontFamily: "DMSans_600SemiBold" },

  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 20, fontWeight: "800", fontFamily: "DMSans_700Bold" },
  totalAmount: { fontSize: 36, fontWeight: "800", fontFamily: "DMSans_700Bold" },

  depositBadge: { borderRadius: 14, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1 },
  depositLabel: { fontSize: 14, fontWeight: "600", fontFamily: "DMSans_600SemiBold" },
  depositSub: { fontSize: 12, marginTop: 2, fontFamily: "DMSans_400Regular" },
  depositAmount: { fontSize: 22, fontWeight: "800", fontFamily: "DMSans_700Bold" },

  contactFooter: { borderTopWidth: 1, paddingTop: 12, gap: 4 },
  contactText: { fontSize: 13, fontFamily: "DMSans_400Regular" },

  // Cards
  configCard: { backgroundColor: B.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: B.border, gap: 8 },
  configLabel: { fontSize: 10, fontWeight: "700", color: B.gray3, letterSpacing: 1.5, fontFamily: "DMSans_700Bold" },
  configValue: { fontSize: 15, color: B.gray1, lineHeight: 22, fontFamily: "DMSans_400Regular" },
  sep: { height: 1, backgroundColor: B.border, marginVertical: 4 },

  sectionTitle: { fontSize: 11, fontWeight: "700", color: B.gray3, letterSpacing: 1.5, fontFamily: "DMSans_700Bold" },
  emptyText: { color: B.gray3, fontSize: 15, fontFamily: "DMSans_400Regular" },

  infoCard: { backgroundColor: B.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: B.border, gap: 6 },
  infoLabel: { fontSize: 10, fontWeight: "700", color: B.gray3, letterSpacing: 1.5, fontFamily: "DMSans_700Bold" },
  infoCode: { fontSize: 28, fontWeight: "800", letterSpacing: 4, fontFamily: "Syne_800ExtraBold" },
  infoHint: { fontSize: 13, color: B.gray3, lineHeight: 20, fontFamily: "DMSans_400Regular" },

  // Team
  userCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: B.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: B.border },
  userAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  userAvatarText: { fontSize: 16, fontWeight: "700", color: B.white, fontFamily: "Syne_700Bold" },
  userName: { fontSize: 15, fontWeight: "600", color: B.white, fontFamily: "DMSans_600SemiBold" },
  userRole: { fontSize: 12, color: B.gray3, marginTop: 2, fontFamily: "DMSans_400Regular" },
  roleBadge: { backgroundColor: B.card, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: B.border },
  roleBadgeText: { fontSize: 11, fontWeight: "700", color: B.gray2, fontFamily: "DMSans_700Bold" },

  // History
  historyCard: { backgroundColor: B.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: B.border },
  historyName: { fontSize: 17, fontWeight: "700", color: B.white, fontFamily: "DMSans_700Bold" },
  historyMeta: { fontSize: 13, color: B.gray3, marginTop: 2, fontFamily: "DMSans_400Regular" },
  historyTotal: { fontSize: 20, fontWeight: "800", fontFamily: "Syne_800ExtraBold" },

  logoUploadBtn: { backgroundColor: B.card, borderRadius: 12, borderWidth: 1, borderColor: B.border, borderStyle: "dashed", padding: 20, alignItems: "center", justifyContent: "center", minHeight: 80 },
  logoUploadText: { color: B.gray3, fontSize: 15, fontFamily: "DMSans_400Regular" },
  colorPreviewCard: { backgroundColor: B.card, borderRadius: 12, padding: 16, borderWidth: 1 },

  // Kit
  kitCircle: { position: "absolute", bottom: 32, right: 24, width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12 },
  kitCircleText: { color: B.white, fontSize: 20, fontWeight: "800", fontFamily: "Syne_800ExtraBold" },

  kitSheet: { position: "absolute", bottom: 0, left: 0, right: 0, height: "72%", backgroundColor: B.navy, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: B.border },
  kitSheetHandle: { width: 36, height: 4, backgroundColor: B.border, borderRadius: 2, alignSelf: "center", marginTop: 12 },
  kitSheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: B.border },
  kitSheetTitle: { fontSize: 17, fontWeight: "800", color: B.white, fontFamily: "Syne_700Bold" },
  kitSheetSub: { fontSize: 12, color: B.gray3, marginTop: 1, fontFamily: "DMSans_400Regular" },
  kitAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  kitAvatarText: { fontSize: 16, fontWeight: "800", color: B.white, fontFamily: "Syne_800ExtraBold" },

  kitInputRow: { flexDirection: "row", padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: B.border },
  kitInput: { flex: 1, backgroundColor: B.card, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 16, color: B.white, fontSize: 15, borderWidth: 1, borderColor: B.border, fontFamily: "DMSans_400Regular" },
  kitSend: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },

  kitIntroBar: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: B.border },
  kitIntroBanner: { backgroundColor: B.card, margin: 16, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: B.border },

  bubble: { borderRadius: 18, padding: 14, maxWidth: "80%" },
  bubbleKit: { backgroundColor: B.card, alignSelf: "flex-start", borderRadius: 18, padding: 14, maxWidth: "80%" },
  bubbleUser: { alignSelf: "flex-end" },
  bubbleText: { color: B.gray1, fontSize: 15, lineHeight: 22, fontFamily: "DMSans_400Regular" },

  suggestion: { backgroundColor: B.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: B.border },
  suggestionText: { color: B.gray2, fontSize: 14, fontFamily: "DMSans_400Regular" },

  // Master dashboard
  masterOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: 28 },
  masterCard: { backgroundColor: B.card, borderRadius: 20, padding: 24, width: "100%", borderWidth: 1, borderColor: B.border },
  masterActionCard: { backgroundColor: B.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: B.border },

  // Demo picker
  demoModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  demoModalCard: { backgroundColor: B.navy, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", borderTopWidth: 1, borderColor: B.border },
  demoModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: B.border },
  demoModalTitle: { fontSize: 18, fontWeight: "800", color: B.white, fontFamily: "Syne_700Bold" },
  demoModalClose: { color: B.blue, fontSize: 15, fontWeight: "600", fontFamily: "DMSans_600SemiBold" },
  demoRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: B.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: B.border },
  demoEmoji: { fontSize: 26 },
  demoName: { fontSize: 15, fontWeight: "700", color: B.white, fontFamily: "DMSans_700Bold" },
  demoTrade: { fontSize: 13, color: B.gray3, marginTop: 2, fontFamily: "DMSans_400Regular" },
  demoDot: { width: 16, height: 16, borderRadius: 8 },

  // Demo banner
  demoBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: B.cyan, paddingVertical: 8 },
  demoBannerText: { color: B.midnight, fontSize: 12, fontWeight: "800", letterSpacing: 1, fontFamily: "DMSans_700Bold" },

  // Quote screen — sections, option cards, pills, hints
  qSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qSectionTitle: { fontSize: 16, fontWeight: "800", color: B.white, fontFamily: "Syne_700Bold" },
  qAddPill: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", backgroundColor: B.card, borderRadius: 22, paddingVertical: 11, paddingHorizontal: 18, borderWidth: 1, borderColor: B.border },
  qOptionCard: { minWidth: 104, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, gap: 4 },
  qOptionName: { fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" },
  qOptionPrice: { fontSize: 13, fontWeight: "700", fontFamily: "DMSans_700Bold" },
  qPill: { flex: 1, alignItems: "center", borderRadius: 12, paddingVertical: 14, borderWidth: 1 },
  qPillText: { fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" },
  qHint: { fontSize: 12, color: B.gray3, fontFamily: "DMSans_400Regular", marginLeft: 2 },

  // Quote screen — sticky total bar
  qFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  qStickyWrap: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: B.navy, borderTopWidth: 1, borderTopColor: B.border, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, gap: 8 },
  qStickyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qStickyLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: B.gray3, fontFamily: "DMSans_700Bold" },
  qStickyTotal: { fontSize: 30, fontWeight: "800", color: B.white, fontFamily: "Syne_800ExtraBold" },
  qRange: { fontSize: 12, fontFamily: "DMSans_400Regular" },
  qReviewBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 22 },
  qReviewText: { color: B.white, fontSize: 16, fontWeight: "700", fontFamily: "DMSans_700Bold" },
  qMinWarn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F59E0B", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  qMinWarnText: { flex: 1, color: B.midnight, fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold" },

  // Closing card extras
  ccFixedPrice: { fontSize: 12, fontWeight: "700", fontFamily: "DMSans_700Bold", letterSpacing: 1, marginTop: -8 },
  ccTerms: { fontSize: 13, fontFamily: "DMSans_600SemiBold" },
  ccValid: { fontSize: 12, fontFamily: "DMSans_400Regular" },
  ccContactRow: { flexDirection: "row", alignItems: "center", gap: 6 },

  // History — search, summary, status dots, empty state
  histSearch: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: B.card, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: B.border },
  histSearchInput: { flex: 1, paddingVertical: 12, color: B.white, fontSize: 15, fontFamily: "DMSans_400Regular" },
  histSummaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, paddingHorizontal: 4 },
  histSummaryItem: { fontSize: 13, fontFamily: "DMSans_600SemiBold" },
  histDot: { width: 10, height: 10, borderRadius: 5 },
  histRowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  emptyArt: { width: 96, height: 96, borderRadius: 28, marginBottom: 20 },
});
