import { Platform } from "react-native";

// Cross-platform reordering for the schema editor. We deliberately do NOT use
// react-native-draggable-flatlist: it targets reanimated 2/3, but this app runs reanimated 4.1 (a
// breaking major) with no GestureHandlerRootView at the root — installing it risks breaking the
// build/runtime, which can't be verified here. Instead the DragHandle exposes ▲/▼ controls (44×44)
// that move an item up/down; the reordering RESULT is identical on touch and mouse, and the web
// path adds grab-cursor affordances. This hook centralizes that logic so a real drag impl can drop
// in later without touching call sites.
export interface DraggableList {
  isWeb: boolean;
  moveUp: (index: number) => void;
  moveDown: (index: number) => void;
  canMoveUp: (index: number) => boolean;
  canMoveDown: (index: number) => boolean;
}

function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function useDraggableList<T>(
  items: T[],
  onReorder: (next: T[]) => void,
  _keyExtractor: (item: T) => string,
): DraggableList {
  return {
    isWeb: Platform.OS === "web",
    canMoveUp: (i) => i > 0,
    canMoveDown: (i) => i < items.length - 1,
    moveUp: (i) => { if (i > 0) onReorder(reorder(items, i, i - 1)); },
    moveDown: (i) => { if (i < items.length - 1) onReorder(reorder(items, i, i + 1)); },
  };
}
