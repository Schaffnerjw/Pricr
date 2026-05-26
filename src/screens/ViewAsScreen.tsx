import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { DoneScreen } from "./DoneScreen";
import { QuoteScreen } from "./QuoteScreen";
import { Business, SavedQuote, User } from "../types";

// Super-admin "View as" — renders a business's real dashboard + quote tool exactly as they see it,
// fully read-only. No action can mutate anything (handlers are no-ops or navigate within the preview;
// the quote tool is rendered in previewMode). A persistent banner makes the read-only context clear.
export function ViewAsScreen({ business, quotes, onBack }: { business: Business; quotes: SavedQuote[]; onBack: () => void }) {
  const [tab, setTab] = useState<"dashboard" | "quote">("dashboard");
  const primaryColor = business.brand?.primaryColor || B.blue;
  const secondaryColor = business.brand?.secondaryColor || B.cyan;
  // A synthetic admin identity so the dashboard renders as the owner would see it.
  const viewer: User = { id: "viewas", name: business.ownerName || business.name, role: "admin", businessCode: business.code };
  const noop = () => { };

  return (
    <View style={{ flex: 1, backgroundColor: business.brand?.backgroundColor || B.midnight }}>
      {/* Persistent read-only banner */}
      <View style={{ paddingTop: 48, paddingBottom: 10, paddingHorizontal: 14, backgroundColor: "#F59E0B", flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TouchableOpacity onPress={onBack} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Feather name="chevron-left" size={18} color={B.midnight} />
          <Text style={{ color: B.midnight, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Back</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "center" }}>
          <Feather name="eye" size={14} color={B.midnight} />
          <Text style={{ color: B.midnight, fontSize: 13, fontWeight: "800", fontFamily: "DMSans_700Bold" }} numberOfLines={1}>Viewing as {business.name} — Read Only</Text>
        </View>
        <View style={{ width: 50 }} />
      </View>

      {/* Tab toggle */}
      <View style={{ flexDirection: "row", backgroundColor: B.card, borderBottomWidth: 1, borderBottomColor: B.border }}>
        {(["dashboard", "quote"] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={{ flex: 1, paddingVertical: 11, alignItems: "center", borderBottomWidth: 2, borderBottomColor: tab === t ? primaryColor : "transparent" }}>
            <Text style={{ color: tab === t ? primaryColor : B.gray2, fontSize: 14, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>{t === "dashboard" ? "Dashboard" : "Quote Tool"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {tab === "dashboard" ? (
          <DoneScreen
            business={business} currentUser={viewer} primaryColor={primaryColor} secondaryColor={secondaryColor}
            showTestPrompt={false} quotesOverride={quotes} viewOnly
            onOpenQuoteTool={() => setTab("quote")}
            onTestQuote={() => setTab("quote")}
            onQuoteHistory={noop} onManageTeam={noop} onReconfigure={noop}
            onDismissTestPrompt={noop} onOpenSettings={noop}
          />
        ) : (
          <QuoteScreen schema={business.schema} setSchema={noop} business={business} currentUser={viewer} onBack={() => setTab("dashboard")} previewMode />
        )}
      </View>
    </View>
  );
}
