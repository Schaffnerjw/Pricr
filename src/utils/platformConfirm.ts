// Pure decision logic for the "confirm a destructive action" flow. React Native's Alert.alert
// is a no-op on react-native-web — its callbacks NEVER fire, so any chain of the form
// "tap link → Alert.alert with a destructive button → run handler" silently dies on the web.
// That's exactly what happened to the Batch B "Cancel signup" and "Sign out" paywall links.
//
// The fix routes web through window.confirm (synchronous, returns boolean — actually works) and
// keeps Alert.alert for native. This helper exposes the platform decision as a pure function
// so jest (node env) can verify the branch matrix without mocking react-native.

export type ConfirmDecision = "fire" | "abort" | "ask-native";

// Given the platform + (on web) the boolean result of window.confirm, decide what the caller
// should do next:
//   - "fire"        → web user confirmed → run the destructive handler
//   - "abort"       → web user cancelled → do nothing
//   - "ask-native"  → native platform → caller should invoke Alert.alert
//
// Splitting it this way means the same predicate covers BOTH the "web confirm rendered" and
// "web confirm unavailable (SSR / no DOM)" cases — caller passes webConfirmResult: false in the
// latter, which maps to "abort" so a destructive action never fires without explicit confirmation.
export function decideConfirmFlow(opts: {
  platformOS: string;
  webConfirmResult?: boolean;
}): ConfirmDecision {
  if (opts.platformOS === "web") {
    return opts.webConfirmResult === true ? "fire" : "abort";
  }
  return "ask-native";
}
