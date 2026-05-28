import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import {
  Syne_600SemiBold,
  Syne_700Bold,
  Syne_800ExtraBold,
} from "@expo-google-fonts/syne";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { InstallPrompt } from "../src/components/InstallPrompt";
import { UpdateBanner } from "../src/components/UpdateBanner";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { VersionPoller } from "../src/components/VersionPoller";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || 'https://249321a02ab126a323326884e5ef7788@o4511459730587648.ingest.us.sentry.io/4511459732226048',
  enabled: !__DEV__, // production only
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

SplashScreen.preventAutoHideAsync();

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded] = useFonts({
    Syne_600SemiBold,
    Syne_700Bold,
    Syne_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => { });
  }, [fontsLoaded]);

  // NOTE: do NOT gate the tree on fontsLoaded (e.g. `if (!fontsLoaded) return null`). On web that
  // produces a hydration mismatch (#418): the prerendered HTML and the client's first render disagree
  // about whether to render content vs null. Custom fonts are a CSS concern — RNW emits the same DOM
  // either way and the font simply swaps in once loaded. The native splash stays up until fonts are
  // ready via the effect above, so there's no flash on native.
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0E1A" } }} />
      <InstallPrompt />
      <UpdateBanner />
      <VersionPoller />
      <OfflineBanner />
    </>
  );
});