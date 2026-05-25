import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { s } from "../styles";
import { ON_PRIMARY } from "../utils/colorUtils";
import { parseSuggestedReplies } from "../utils/helpers";
import { TypingDots } from "./TypingDots";

const SUGGESTIONS = ["What are my options?", "Update my pricing", "Add an add-on", "Why is the total this?", "Change my deposit"];

// Layout choices Kit asks for before building a new field (FIX 4). Rendered as interactive pills.
const LAYOUT_GROUPS = [
  { key: "input", title: "Input type", options: ["Number field", "Yes-No toggle", "Text field", "Dropdown", "Counter"], def: "Number field" },
  { key: "display", title: "Display style", options: ["Full width", "Side by side", "Expandable section"], def: "Full width" },
  { key: "required", title: "Required?", options: ["Required", "Optional"], def: "Optional" },
];

// In-quote Kit assistant sheet: answers questions, explains line items, and makes schema changes.
export function KitAgentSheet({ primaryColor, messages, input, loading, onInputChange, onSend, onClose }: {
  primaryColor: string;
  messages: { role: "user" | "assistant"; content: string }[];
  input: string; loading: boolean;
  onInputChange: (v: string) => void; onSend: (text?: string) => void; onClose: () => void;
}) {
  const [layout, setLayout] = useState<Record<string, string>>({ input: "Number field", display: "Full width", required: "Optional" });

  const last = messages[messages.length - 1];
  const showLayout = !loading && last?.role === "assistant" && last.content.includes("LAYOUT_OPTIONS");
  const clean = (c: string) => parseSuggestedReplies(c.replace(/LAYOUT_OPTIONS/g, "")).content;
  // Contextual answer pills from Kit's own SUGGESTED_REPLIES (only when it asked something).
  const suggested = !loading && !showLayout && last?.role === "assistant" ? parseSuggestedReplies(last.content).replies : [];

  const buildWithLayout = () => {
    onSend(`Build it with these settings — input type: ${layout.input}, display style: ${layout.display}, ${layout.required.toLowerCase()}. Go ahead and create the field now.`);
  };

  return (
    <View style={s.kitSheet}>
      <View style={s.kitSheetHandle} />
      <View style={s.kitSheetHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={[s.kitAvatar, { backgroundColor: primaryColor }]}><Text style={[s.kitAvatarText, { color: ON_PRIMARY }]}>K</Text></View>
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
            <Text style={{ fontSize: 12, color: B.muted, marginBottom: 4 }}>Try saying...</Text>
            {SUGGESTIONS.map(sg => (
              <TouchableOpacity key={sg} style={s.suggestion} onPress={() => onInputChange(sg)}>
                <Text style={s.suggestionText}>{sg}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {messages.map((msg, i) => (
          <View key={i} style={[s.bubble, msg.role === "user" ? [s.bubbleUser, { backgroundColor: primaryColor }] : s.bubbleKit]}>
            <Text style={[s.bubbleText, msg.role === "user" && { color: ON_PRIMARY }]}>{clean(msg.content)}</Text>
          </View>
        ))}
        {loading && <View style={s.bubbleKit}><TypingDots color={B.gray2} /></View>}

        {/* Contextual answer pills — only what Kit returned for the question it just asked. */}
        {suggested.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
            {suggested.map(c => (
              <TouchableOpacity key={c} style={[s.chip, { borderColor: primaryColor + "60" }]} onPress={() => onSend(c)}>
                <Text style={[s.chipText, { color: primaryColor }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Interactive layout pills — shown when Kit asks how to lay out a new field. */}
        {showLayout && (
          <View style={{ gap: 14, backgroundColor: B.card, borderRadius: 14, borderWidth: 1, borderColor: B.border, padding: 14 }}>
            {LAYOUT_GROUPS.map(group => (
              <View key={group.key} style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: B.muted, letterSpacing: 1, fontFamily: "DMSans_700Bold" }}>{group.title.toUpperCase()}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {group.options.map(opt => {
                    const active = layout[group.key] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => setLayout(p => ({ ...p, [group.key]: opt }))}
                        style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: active ? primaryColor : B.border, backgroundColor: active ? primaryColor : "transparent" }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", fontFamily: "DMSans_600SemiBold", color: active ? B.white : B.gray1 }}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            <TouchableOpacity style={[s.btn, { backgroundColor: primaryColor, marginTop: 4 }]} onPress={buildWithLayout} disabled={loading}>
              <Text style={s.btnText}>Build it</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <View style={s.kitInputRow}>
        <TextInput style={s.kitInput} placeholder="Ask Kit or tell it what to change..." placeholderTextColor={B.gray3} value={input} onChangeText={onInputChange} onSubmitEditing={() => onSend()} returnKeyType="send" />
        <TouchableOpacity style={[s.kitSend, { backgroundColor: primaryColor }]} onPress={() => onSend()} disabled={loading}>
          <Feather name="arrow-up" size={20} color={B.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
