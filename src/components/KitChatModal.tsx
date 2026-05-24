import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { API_URL, B } from "../constants/brand";
import { s } from "../styles";
import { TypingDots } from "./TypingDots";

type Msg = { role: "user" | "assistant"; content: string };

// A self-contained Kit chat modal. Manages its own conversation + proxy calls.
// If `resultMarker` is set, the text after that marker in any reply is treated as a finished
// artifact (e.g. generated T&C): `onResult` is called with it and that text is hidden from chat.
export function KitChatModal({ visible, onClose, primaryColor, title, subtitle, systemPrompt, opener, suggestions, resultMarker, onResult }: {
  visible: boolean;
  onClose: () => void;
  primaryColor: string;
  title: string;
  subtitle: string;
  systemPrompt: string;
  opener: string;
  suggestions?: string[];
  resultMarker?: string;
  onResult?: (text: string) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Seed the opener (display-only) each time the modal is freshly opened.
  useEffect(() => {
    if (visible && messages.length === 0) setMessages([{ role: "assistant", content: opener }]);
    if (!visible) { setMessages([]); setInput(""); setLoading(false); }
  }, [visible]);

  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      // Anthropic requires the first message to be a user turn — drop the leading opener.
      let start = 0;
      while (start < next.length && next[start].role === "assistant") start++;
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1800, system: systemPrompt, messages: next.slice(start) }),
      });
      const data = await res.json();
      const reply = (data?.content?.[0]?.text ?? "").trim();
      if (resultMarker && reply.includes(resultMarker)) {
        const [preface, after] = reply.split(resultMarker);
        const extracted = (after ?? "").trim();
        setMessages([...next, { role: "assistant", content: (preface || "").trim() || "Done — I've dropped your terms into the editor below. Review, tweak anything, and save." }]);
        if (extracted) onResult?.(extracted);
      } else {
        setMessages([...next, { role: "assistant", content: reply || "Sorry, I didn't catch that — try again." }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Something went wrong reaching me. Give it another shot." }]);
    }
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[s.container, { flex: 1 }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.kitSheetHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[s.kitAvatar, { backgroundColor: primaryColor }]}><Text style={s.kitAvatarText}>K</Text></View>
              <View>
                <Text style={s.kitSheetTitle}>{title}</Text>
                <Text style={s.kitSheetSub}>{subtitle}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}><Text style={{ color: primaryColor, fontSize: 15, fontWeight: "600" }}>Done</Text></TouchableOpacity>
          </View>

          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
            {messages.map((msg, i) => (
              <View key={i} style={[s.bubble, msg.role === "user" ? [s.bubbleUser, { backgroundColor: primaryColor }] : s.bubbleKit]}>
                <Text style={[s.bubbleText, msg.role === "user" && { color: B.white }]}>{msg.content}</Text>
              </View>
            ))}
            {loading && <View style={s.bubbleKit}><TypingDots color={B.gray2} /></View>}
            {messages.length <= 1 && suggestions && suggestions.length > 0 && (
              <View style={{ gap: 8, marginTop: 6 }}>
                {suggestions.map(sg => (
                  <TouchableOpacity key={sg} style={s.suggestion} onPress={() => send(sg)}>
                    <Text style={s.suggestionText}>{sg}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={s.kitInputRow}>
            <TextInput style={s.kitInput} placeholder="Message Kit..." placeholderTextColor={B.gray3} value={input} onChangeText={setInput} onSubmitEditing={() => send()} returnKeyType="send" multiline />
            <TouchableOpacity style={[s.kitSend, { backgroundColor: primaryColor }]} onPress={() => send()} disabled={loading}>
              <Feather name="arrow-up" size={20} color={B.white} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
