import React, { createContext, useContext, useMemo } from "react";
import { BrandConfig } from "../types";
import { AppTheme, buildTheme } from "../utils/theme";

// Default theme (Pricr Dark) so consumers always have a valid theme even outside a provider.
const DEFAULT_BRAND: BrandConfig = {
  primaryColor: "#2979FF", secondaryColor: "#00E5FF", backgroundColor: "#0A0E1A",
  logoUri: null, tagline: "", phone: "", email: "", address: "",
};

const ThemeContext = createContext<AppTheme>(buildTheme(DEFAULT_BRAND));

// Themes the whole subtree from one brand. Re-derives only when the brand colors change, so a
// color change in Settings applies app-wide immediately (no restart) without extra re-renders.
export function ThemeProvider({ brand, children }: { brand?: BrandConfig | null; children: React.ReactNode }) {
  const { primaryColor, backgroundColor, secondaryColor } = brand || DEFAULT_BRAND;
  const theme = useMemo(
    () => buildTheme({ ...DEFAULT_BRAND, primaryColor, backgroundColor, secondaryColor }),
    [primaryColor, backgroundColor, secondaryColor],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): AppTheme => useContext(ThemeContext);
