import { Image, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { s } from "../styles";
import { Business } from "../types";

export function SetupScreen({ business, primaryColor, services, products, pricing, onServicesChange, onProductsChange, onPricingChange, onContinue }: {
  business: Business | null; primaryColor: string;
  services: string; products: string; pricing: string;
  onServicesChange: (v: string) => void; onProductsChange: (v: string) => void; onPricingChange: (v: string) => void;
  onContinue: () => void;
}) {
  const fields = [
    { label: "What services do you offer?", hint: "List everything you quote on.", value: services, setter: onServicesChange, placeholder: "Walk us through what you do..." },
    { label: "What products or materials do you work with?", hint: "Include brands, grades, or tiers.", value: products, setter: onProductsChange, placeholder: "List materials, products, or packages..." },
    { label: "How do you price your jobs?", hint: "Be as specific as you can.", value: pricing, setter: onPricingChange, placeholder: "Tell us how you price things out..." },
  ];
  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48, gap: 8 }}>
          {business?.brand?.logoUri ? (
            <Image source={{ uri: business.brand.logoUri }} style={{ height: 48, width: 160, marginBottom: 8 }} resizeMode="contain" />
          ) : (
            <Text style={[s.wordmark, { color: primaryColor }]}>{business?.name || "Pricr"}</Text>
          )}
          <Text style={[s.body, { marginBottom: 24, marginTop: 4 }]}>Tell us about your business and Kit will build your quote tool.</Text>
          {fields.map(field => (
            <View key={field.label} style={{ gap: 6, marginBottom: 20 }}>
              <Text style={s.formLabel}>{field.label}</Text>
              {field.hint && <Text style={s.formHint}>{field.hint}</Text>}
              <TextInput style={[s.input, { minHeight: 110, paddingTop: 14 }]} placeholder={field.placeholder} placeholderTextColor={B.gray3} value={field.value} onChangeText={field.setter} multiline numberOfLines={4} textAlignVertical="top" />
            </View>
          ))}
          <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor }, (!services || !pricing) && { opacity: 0.4 }]} onPress={onContinue} disabled={!services || !pricing}>
            <Text style={s.btnText}>Continue to Kit</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
