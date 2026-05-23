import { Feather } from "@expo/vector-icons";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { DEMO_BUSINESSES } from "../constants/demos";
import { B } from "../constants/brand";
import { s } from "../styles";
import { DemoBusiness } from "../types";

export function DemoPickerModal({ visible, onClose, onSelect }: {
  visible: boolean; onClose: () => void; onSelect: (demo: DemoBusiness) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.demoModalOverlay}>
        <View style={s.demoModalCard}>
          <View style={s.demoModalHeader}>
            <Text style={s.demoModalTitle}>Choose a demo business</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={B.blue} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            {DEMO_BUSINESSES.map(demo => (
              <TouchableOpacity key={demo.name} style={s.demoRow} onPress={() => onSelect(demo)}>
                <Text style={s.demoEmoji}>{demo.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.demoName}>{demo.name}</Text>
                  <Text style={s.demoTrade}>{demo.trade}</Text>
                </View>
                <View style={[s.demoDot, { backgroundColor: demo.color }]} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
