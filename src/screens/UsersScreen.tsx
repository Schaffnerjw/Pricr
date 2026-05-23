import { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { BrandHeader } from "../components/BrandHeader";
import { B } from "../constants/brand";
import { getUsers, saveUsers } from "../storage";
import { s } from "../styles";
import { Business, User } from "../types";

export function UsersScreen({ business, currentUser, onBack }: {
  business: Business; currentUser: User; onBack: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const brand = business.brand;

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setUsers(await getUsers(business.code));
    setLoading(false);
  };

  const removeUser = async (id: string) => {
    const updated = users.filter(u => u.id !== id);
    setUsers(updated);
    await saveUsers(business.code, updated);
  };

  return (
    <SafeAreaView style={s.container}>
      <BrandHeader business={business} right={
        <TouchableOpacity onPress={onBack}><Text style={[s.navBackText, { color: brand.primaryColor }]}>Done</Text></TouchableOpacity>
      } />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={s.infoCard}>
          <Text style={s.infoLabel}>BUSINESS ID</Text>
          <Text style={[s.infoCode, { color: brand.primaryColor }]}>{business.code}</Text>
          <Text style={s.infoHint}>Share this Business ID with your team so they can join on their device.</Text>
        </View>
        <Text style={s.sectionTitle}>Team Members</Text>
        {loading ? <ActivityIndicator color={brand.primaryColor} /> : users.length === 0 ? (
          <Text style={s.emptyText}>No team members yet.</Text>
        ) : users.map(u => (
          <View key={u.id} style={s.userCard}>
            <View style={[s.userAvatar, { backgroundColor: brand.primaryColor }]}>
              <Text style={s.userAvatarText}>{u.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.userName}>{u.name}</Text>
              <Text style={s.userRole}>{u.role === "admin" ? "Admin" : "Rep"}</Text>
            </View>
            {u.id !== currentUser.id && u.role !== "admin" && (
              <TouchableOpacity onPress={() => removeUser(u.id)}>
                <Text style={{ color: B.red, fontSize: 13 }}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
