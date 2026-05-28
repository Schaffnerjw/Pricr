import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { Alert, Platform, Share } from "react-native";
import { generateQuotePDF, QuotePDFData } from "./generateQuotePDF";
import { logger } from "./logger";

// shareQuotePDF has two distinct call sites with opposite needs:
//
//  (1) ClosingCard "Share Quote" — sending the quote TO THE CUSTOMER. Must be link-only: the
//      message body contains a hosted URL the customer taps to open the quote in their browser.
//      NEVER attach a PDF or HTML file: prior versions did, which on mobile web (popup blocked)
//      downloaded "Pricr-Quote.html" to the contractor's phone, and on iOS Share.share attached
//      the PDF — customers received either a useless local file or an attachment they had to
//      tap-and-open instead of a clean preview card. Signalled by `opts.message` being set.
//
//  (2) QuotesHistoryScreen "Download signed PDF" — the CONTRACTOR saves a record of a signed
//      quote for their files. Generates the PDF and opens the native share/save sheet so they
//      can email it to themselves or save to Files. Signalled by `opts.message` being absent.
export async function shareQuotePDF(data: QuotePDFData, opts?: { message?: string }): Promise<void> {
  // (1) Send-to-customer path: link-only, no file generation.
  if (opts?.message) {
    if (Platform.OS === "web") {
      try {
        if (typeof navigator !== "undefined" && (navigator as any).share) {
          await (navigator as any).share({ text: opts.message });
          return;
        }
      } catch { return; /* user cancelled */ }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(opts.message);
          Alert.alert("Link copied", "The quote link was copied to your clipboard — paste it into a text or email to your customer.");
        } catch { Alert.alert("Couldn't share", "Copy the link manually from the quote page."); }
      }
      return;
    }
    // Native: text-only share. NO `url:` field — that's what was attaching the PDF.
    try { await Share.share({ message: opts.message }); } catch { /* user cancelled */ }
    return;
  }

  // (2) Save-for-records path: generate the PDF/HTML and open the native share sheet.
  try {
    const html = generateQuotePDF(data);
    if (Platform.OS === "web") {
      // Web: open the HTML in a new tab so the contractor can print/save it. The download
      // fallback is fine here — it's the CONTRACTOR's own copy, not what the customer sees.
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (!w) {
        const a = document.createElement("a");
        a.href = url; a.download = "Pricr-Quote.html"; a.click();
      }
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 60000);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    let shareUri = uri;
    try {
      const safe = (data.customerName || "Quote").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Quote";
      const dest = `${FileSystem.cacheDirectory}Pricr-Quote-${safe}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: dest });
      shareUri = dest;
    } catch { /* fall back to temp uri if rename fails */ }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Sharing unavailable", "Sharing isn't available on this device.");
      return;
    }
    await Sharing.shareAsync(shareUri, { mimeType: "application/pdf", dialogTitle: "Share Quote", UTI: "com.adobe.pdf" });
  } catch (e) {
    logger.error("[PDF] share failed", e instanceof Error ? e.message : String(e));
    Alert.alert("Couldn't create PDF", "Something went wrong preparing the PDF. Please try again.");
  }
}

// Contractor-side PREVIEW — shows the quote exactly as the client receives it, RENDERED (never raw
// HTML). Web: opens the HTML as a document in a new tab. Native: the OS print preview paginates the
// HTML into a real PDF view. No sending, no side effects.
export async function previewQuotePDF(data: QuotePDFData): Promise<void> {
  try {
    const html = generateQuotePDF(data);
    if (Platform.OS === "web") {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (!w) {
        const a = document.createElement("a");
        a.href = url; a.download = "Pricr-Quote.html"; a.click();
      }
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 60000);
      return;
    }
    try {
      await Print.printAsync({ html });
    } catch {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Quote Preview", UTI: "com.adobe.pdf" });
      else await WebBrowser.openBrowserAsync(uri);
    }
  } catch (e) {
    logger.error("[PDF] preview failed", e instanceof Error ? e.message : String(e));
    Alert.alert("Couldn't open preview", "Something went wrong opening the preview. Please try again.");
  }
}
