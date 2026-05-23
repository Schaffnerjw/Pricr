import { Feather } from "@expo/vector-icons";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { s } from "../styles";
import { TypingDots } from "./TypingDots";

const SUGGESTIONS = ["What are my options?", "Update my pricing", "Add an add-on", "Why is the total this?", "Change my deposit"];

// In-quote Kit assistant sheet: answers questions, explains line items, and makes schema changes.
export function KitAgentSheet({ primaryColor, messages, input, loading, onInputChange, onSend, onClose }: {
  primaryColor: string;
  messages: { role: "user" | "assistant"; content: string }[];
  input: string; loading: boolean;
  onInputChange: (v: string) => void; onSend: () => void; onClose: () => void;
}) {
  return (
    <View style={s.kitSheet}>
      <View style={s.kitSheetHandle} />
      <View style={s.kitSheetHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={[s.kitAvatar, { backgroundColor: primaryColor }]}><Text style={s.kitAvatarText}>K</Text></View>
          <View>
            <Text style={s.kitSheetTitle}>Kit</Text>
            <Text style={s.kitSheetSub}>Ask me anything or tell me what to change</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose}><Text style={{ color: primaryColor, fontSize: 15, fontWeight: "600" }}>Done</Text></TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
        {messages.length === 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, color: B.gray3, marginBottom: 4 }}>Try saying...</Text>
            {SUGGESTIONS.map(sg => (
              <TouchableOpacity key={sg} style={s.suggestion} onPress={() => onInputChange(sg)}>
                <Text style={s.suggestionText}>{sg}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {messages.map((msg, i) => (
          <View key={i} style={[s.bubble, msg.role === "user" ? [s.bubbleUser, { backgroundColor: primaryColor }] : s.bubbleKit]}>
            <Text style={[s.bubbleText, msg.role === "user" && { color: B.white }]}>{msg.content}</Text>
          </View>
        ))}
        {loading && <View style={s.bubbleKit}><TypingDots color={B.gray2} /></View>}
      </ScrollView>
      <View style={s.kitInputRow}>
        <TextInput style={s.kitInput} placeholder="Ask Kit or tell it what to change..." placeholderTextColor={B.gray3} value={input} onChangeText={onInputChange} onSubmitEditing={onSend} returnKeyType="send" />
        <TouchableOpacity style={[s.kitSend, { backgroundColor: primaryColor }]} onPress={onSend} disabled={loading}>
          <Feather name="arrow-up" size={20} color={B.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
