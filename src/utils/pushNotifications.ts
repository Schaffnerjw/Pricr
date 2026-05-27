// Expo push notifications. Degrades gracefully: returns null (never throws) when unsupported or the
// permission is denied, so it can be awaited in the login flow without ever blocking it.
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { logger } from "./logger";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    // SDK 53+ banner/list flags (kept alongside shouldShowAlert for back-compat).
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Request permission + return the Expo push token, or null if unsupported/denied.
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice && Platform.OS !== "web") return null; // simulators have no push
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;
    const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data || null;
  } catch (e) {
    logger.error("[push] register failed", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// Has the user already been asked? (so we don't re-prompt). Returns the current permission status.
export async function getPushPermissionStatus(): Promise<"granted" | "denied" | "undetermined" | "unknown"> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  } catch { return "unknown"; }
}

export async function sendLocalNotification(title: string, body: string): Promise<void> {
  try { await Notifications.scheduleNotificationAsync({ content: { title, body, sound: true }, trigger: null }); }
  catch (e) { logger.error("[push] local notification failed", e instanceof Error ? e.message : String(e)); }
}
