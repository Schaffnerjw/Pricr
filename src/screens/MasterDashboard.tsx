import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { DemoPickerModal } from "../components/DemoPickerModal";
import { MasterAnalytics } from "../components/MasterAnalytics";
import PricrLogo from "../components/PricrLogo";
import { B } from "../constants/brand";
import { getBusiness, getQuotes, getUsers, saveBusiness } from "../storage";
import { s } from "../styles";
import { Business, DemoBusiness, User } from "../types";
import { formatDate } from "../utils/helpers";

export function MasterDashboard({ onSignOut, onStartDemo }: { onSignOut: () => void; onStartDemo: (demo: DemoBusiness) => void }) {
  const [searchCode, setSearchCode] = useState("");
  const [foundBiz, setFoundBiz] = useState<Business | null>(null);
  const [searchError, setSearchError] = useState("");
  const [viewingBiz, setViewingBiz] = useState<Business | null>(null);
  const [viewingUsers, setViewingUsers] = useState<User[]>([]);
  const [viewingQuotes, setViewingQuotes] = useState<any[]>([]);
  const [showDemoPicker, setShowDemoPicker] = useState(false);

  const searchBusiness = async () => {
    if (!searchCode.trim()) return;
    try {
      const biz = await getBusiness(searchCode.toUpperCase());
      if (!biz) { setSearchError("No business found with that code."); setFoundBiz(null); return; }
      setFoundBiz(biz);
      setSearchError("");
    } catch { setSearchError("Something went wrong."); }
  };

  const viewBusiness = async (biz: Business) => {
    try {
      setViewingUsers(await getUsers(biz.code));
      setViewingQuotes(await getQuotes(biz.code));
      setViewingBiz(biz);
    } catch { }
  };

  const resetPin = async (newPin: string) => {
    if (!viewingBiz) return;
    const updated = { ...viewingBiz, adminPin: newPin };
    await saveBusiness(updated);
    setViewingBiz(updated);
    setFoundBiz(updated);
  };

  if (viewingBiz) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.navBar}>
          <TouchableOpacity onPress={() => setViewingBiz(null)} style={[s.navBack, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
            <Feather name="chevron-left" size={18} color={B.blue} />
            <Text style={s.navBackText}>Back</Text>
          </TouchableOpacity>
          <Text style={s.navTitle}>{viewingBiz.name}</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>BUSINESS ID</Text>
            <Text style={[s.infoCode, { color: viewingBiz.brand?.primaryColor || B.cyan }]}>{viewingBiz.code}</Text>
            <Text style={s.infoLabel}>OWNER</Text>
            <Text style={[s.configValue, { marginTop: 2 }]}>{viewingBiz.ownerName}</Text>
            <Text style={s.infoLabel}>CREATED</Text>
            <Text style={[s.configValue, { marginTop: 2 }]}>{formatDate(viewingBiz.createdAt)}</Text>
            <Text style={s.infoLabel}>BRAND COLOR</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
              <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: viewingBiz.brand?.primaryColor || B.blue }} />
              <Text style={s.configValue}>{viewingBiz.brand?.primaryColor || "#2979FF"}</Text>
            </View>
          </View>

          <Text style={s.sectionTitle}>TRADE CONFIG</Text>
          {viewingBiz.schema ? (
            <View style={s.configCard}>
              <Text style={s.configLabel}>TRADE</Text>
              <Text style={s.configValue}>{viewingBiz.schema.trade}</Text>
              <View style={s.sep} />
              <Text style={s.configLabel}>FIELDS</Text>
              <Text style={s.configValue}>{viewingBiz.schema.fields?.length} custom inputs</Text>
              <View style={s.sep} />
              <Text style={s.configLabel}>ADD-ONS</Text>
              <Text style={s.configValue}>{viewingBiz.schema.addOns?.map((a: any) => a.label).join(", ") || "None"}</Text>
            </View>
          ) : <Text style={s.emptyText}>No schema configured yet.</Text>}

          <Text style={s.sectionTitle}>TEAM ({viewingUsers.length})</Text>
          {viewingUsers.map(u => (
            <View key={u.id} style={s.userCard}>
              <View style={[s.userAvatar, { backgroundColor: viewingBiz.brand?.primaryColor || B.blue }]}>
                <Text style={s.userAvatarText}>{u.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.userName}>{u.name}</Text>
                <Text style={s.userRole}>{u.role}</Text>
              </View>
            </View>
          ))}

          <Text style={s.sectionTitle}>RECENT QUOTES ({viewingQuotes.length})</Text>
          {viewingQuotes.slice(0, 5).map(q => (
            <View key={q.id} style={s.historyCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={s.historyName}>{q.customerName || "No name"}</Text>
                <Text style={[s.historyTotal, { color: viewingBiz.brand?.primaryColor || B.blue }]}>${q.total?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
              </View>
              <Text style={s.historyMeta}>{formatDate(q.timestamp)} · {q.repName}</Text>
            </View>
          ))}

          <View style={s.masterActionCard}>
            <Text style={s.sectionTitle}>SUPPORT ACTIONS</Text>
            <TouchableOpacity style={[s.btn, { marginTop: 12, backgroundColor: B.red }]} onPress={() => {
              const newPin = Math.floor(1000 + Math.random() * 9000).toString();
              resetPin(newPin);
              alert(`PIN reset to: ${newPin}\nShare this with the admin.`);
            }}>
              <Text style={s.btnText}>Reset Admin PIN</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.navBar}>
        <View style={{ width: 60 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <PricrLogo size={18} />
          <Text style={s.navTitle}>Support</Text>
        </View>
        <TouchableOpacity onPress={onSignOut} style={{ width: 60, alignItems: "flex-end" }}>
          <Text style={{ color: B.gray3, fontSize: 13, fontFamily: "DMSans_400Regular" }}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={s.infoCard}>
          <Text style={[s.h2, { marginBottom: 4 }]}>Master Dashboard</Text>
          <Text style={s.body}>Search any business by their Business ID to view their account, schema, team, and quotes.</Text>
        </View>

        <TouchableOpacity style={[s.btn, { backgroundColor: B.cyan }]} onPress={() => setShowDemoPicker(true)}>
          <Text style={[s.btnText, { color: B.midnight }]}>Demo Mode</Text>
        </TouchableOpacity>

        <View style={{ gap: 10 }}>
          <Text style={s.formLabel}>Business ID</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Enter Business ID"
              placeholderTextColor={B.gray3}
              value={searchCode}
              onChangeText={v => setSearchCode(v.toUpperCase())}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={[s.btn, { paddingHorizontal: 20 }]} onPress={searchBusiness}>
              <Text style={s.btnText}>Search</Text>
            </TouchableOpacity>
          </View>
          {searchError ? <Text style={{ color: B.red, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{searchError}</Text> : null}
        </View>

        {foundBiz && (
          <TouchableOpacity style={s.historyCard} onPress={() => viewBusiness(foundBiz)}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={s.historyName}>{foundBiz.name}</Text>
                <Text style={s.historyMeta}>{foundBiz.ownerName} · {foundBiz.code}</Text>
                <Text style={[s.historyMeta, { marginTop: 2 }]}>Trade: {foundBiz.schema?.trade || "Not configured"}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: foundBiz.brand?.primaryColor || B.blue }} />
                <Text style={{ color: B.blue, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>View</Text>
                <Feather name="chevron-right" size={16} color={B.blue} />
              </View>
            </View>
          </TouchableOpacity>
        )}

        <MasterAnalytics />
      </ScrollView>

      <DemoPickerModal
        visible={showDemoPicker}
        onClose={() => setShowDemoPicker(false)}
        onSelect={demo => { setShowDemoPicker(false); onStartDemo(demo); }}
      />
    </SafeAreaView>
  );
}
