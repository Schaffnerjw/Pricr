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

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
    </>
  );
}