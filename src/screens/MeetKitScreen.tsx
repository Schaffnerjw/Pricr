import { Feather } from "@expo/vector-icons";
import { RefObject, useEffect, useRef } from "react";
import { Animated, Keyboard, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { TypingDots } from "../components/TypingDots";
import { B } from "../constants/brand";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { s } from "../styles";
import { getContrastColor, ON_PRIMARY } from "../utils/colorUtils";

export function MeetKitScreen({ primaryColor, backgroundColor, messages, input, loading, progress, chips, onInputChange, onSend, onQuickReply, scrollRef, isReconfiguring, onCancel }: {
  primaryColor: string; backgroundColor?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  input: string; loading: boolean; progress: number; chips: string[];
  onInputChange: (v: string) => void; onSend: () => void; onQuickReply: (text: string) => void;
  scrollRef: RefObject<ScrollView | null>;
  isReconfiguring?: boolean; onCancel?: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const fill = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    if (reduceMotion) { fill.setValue(progress); return; }
    Animated.timing(fill, { toValue: progress, duration: 400, useNativeDriver: false }).start();
  }, [progress, reduceMotion]);

  // Keep the latest message visible above the keyboard when it opens.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50));
    return () => sub.remove();
  }, [scrollRef]);

  // Pills come only from Kit's own SUGGESTED_REPLIES (parsed upstream), never hardcoded heuristics.
  const showChips = !loading && chips.length > 0 && messages[messages.length - 1]?.role === "assistant";
  const txt = getContrastColor(backgroundColor || "#0A0E1A"); // readable text on whatever bg is set
  const onPrimary = ON_PRIMARY; // brand look: always white on the primary color

  return (
    <SafeAreaView style={[s.container, backgroundColor ? { backgroundColor } : null]}>
      <StatusBar barStyle="light-content" />
      {/* Reconfigure: a prominent cancel back to the dashboard (no changes made). Hidden on first-time onboarding. */}
      {isReconfiguring && onCancel && (
        <TouchableOpacity onPress={onCancel} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, alignSelf: "flex-start" }}>
          <Feather name="chevron-left" size={20} color={primaryColor} />
          <Text style={{ color: primaryColor, fontSize: 16, fontWeight: "700", fontFamily: "DMSans_700Bold" }}>Cancel</Text>
        </TouchableOpacity>
      )}
      {/* Onboarding progress bar */}
      <View style={{ height: 3, backgroundColor: B.border }}>
        <Animated.View style={{ height: 3, backgroundColor: primaryColor, width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}>
        <View style={s.kitIntroBar}>
          <View style={[s.kitAvatar, { backgroundColor: primaryColor }]}><Text style={[s.kitAvatarText, { color: onPrimary }]}>K</Text></View>
          <View>
            <Text style={{ fontSize: 17, fontWeight: "700", color: txt, fontFamily: "Syne_700Bold" }}>Meet Kit</Text>
            <Text style={{ fontSize: 13, color: txt, opacity: 0.7, fontFamily: "DMSans_400Regular" }}>Your Pricr assistant</Text>
          </View>
        </View>
        <View style={s.kitIntroBanner}>
          <Text style={{ fontSize: 14, color: txt, opacity: 0.85, lineHeight: 22, fontFamily: "DMSans_400Regular" }}>
            Kit builds your quote tool and keeps it updated. Once you are set up, find Kit in the bottom right corner of your quote screen anytime you want to make a change.
          </Text>
        </View>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          {messages.map((msg, i) => (
            <View key={i} style={[s.bubble, msg.role === "user" ? [s.bubbleUser, { backgroundColor: primaryColor }] : s.bubbleKit]}>
              <Text style={[s.bubbleText, msg.role === "user" && { color: onPrimary }]}>{msg.content}</Text>
            </View>
          ))}
          {loading && (
            <View style={[s.bubbleKit, { alignSelf: "flex-start" }]}>
              <TypingDots color={B.gray2} />
            </View>
          )}
          {showChips && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
              {chips.map(c => (
                <TouchableOpacity key={c} style={[s.chip, { borderColor: primaryColor + "60" }]} onPress={() => onQuickReply(c)}>
                  <Text style={[s.chipText, { color: primaryColor }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
        <View style={s.kitInputRow}>
          <TextInput style={s.kitInput} placeholder="Reply to Kit..." placeholderTextColor={B.gray3} value={input} onChangeText={onInputChange} onSubmitEditing={onSend} returnKeyType="send" />
          <TouchableOpacity style={[s.kitSend, { backgroundColor: primaryColor }]} onPress={onSend} disabled={loading}>
            <Feather name="arrow-up" size={20} color={B.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
