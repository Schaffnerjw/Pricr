import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import { generateQuotePDF, QuotePDFData } from "./generateQuotePDF";

// Renders the quote to a PDF and opens the native share sheet. Errors surface as an alert.
export async function shareQuotePDF(data: QuotePDFData): Promise<void> {
  try {
    const html = generateQuotePDF(data);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    // Rename the temp file to something human-readable for the share sheet (best-effort).
    let shareUri = uri;
    try {
      const safe = (data.customerName || "Quote").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Quote";
      const dest = `${FileSystem.cacheDirectory}Pricr-Quote-${safe}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: dest });
      shareUri = dest;
    } catch {
      // Fall back to the original temp uri if the rename fails.
    }

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Sharing unavailable", "Sharing isn't available on this device.");
      return;
    }
    await Sharing.shareAsync(shareUri, {
      mimeType: "application/pdf",
      dialogTitle: "Share Quote",
      UTI: "com.adobe.pdf",
    });
  } catch (e) {
    Alert.alert("Couldn't create PDF", e instanceof Error ? e.message : "Something went wrong. Please try again.");
  }
}
