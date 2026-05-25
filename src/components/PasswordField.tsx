import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { TextInput, TouchableOpacity, View } from "react-native";
import { B } from "../constants/brand";
import { s } from "../styles";

// Password text input with a show/hide toggle. Large, tap-friendly input styling (these are mobile
// users). Replaces the old PIN keypad. The parent owns the value + any min-length validation.
export function PasswordField({ value, onChange, placeholder = "Password", accent = B.blue, onSubmitEditing, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  accent?: string;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ position: "relative", justifyContent: "center" }}>
      <TextInput
        style={[s.input, { paddingRight: 52 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={B.gray3}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="password"
        onSubmitEditing={onSubmitEditing}
        returnKeyType="done"
        autoFocus={autoFocus}
      />
      <TouchableOpacity onPress={() => setShow(v => !v)} hitSlop={10} style={{ position: "absolute", right: 14 }}>
        <Feather name={show ? "eye-off" : "eye"} size={20} color={accent} />
      </TouchableOpacity>
    </View>
  );
}
