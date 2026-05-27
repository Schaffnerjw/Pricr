import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { Alert, Platform, Share } from "react-native";
import { generateQuotePDF, QuotePDFData } from "./generateQuotePDF";

// Open the quote HTML as a RENDERED document in a new tab (blob URL with a text/html content type —
// the browser parses and displays it, never the raw source). Falls back to a download if popups are
// blocked. Returns the object URL so the caller can trigger print / revoke it.
function openHtmlInNewTab(html: string): string | null {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    // Popup blocked → download the proposal as an HTML file instead.
    const a = document.createElement("a");
    a.href = url; a.download = "Pricr-Quote.html"; a.click();
  }
  // Revoke later so the tab has time to finish loading (immediate revoke can blank the page).
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 60000);
  return w ? url : null;
}

// Web: open the quote as a rendered page in a new tab and trigger the browser print dialog (Save as
// PDF), then share the signing link via the Web Share API (falling back to clipboard).
async function shareQuotePDFWeb(html: string, opts?: { message?: string }): Promise<void> {
  try {
    const w = window.open("about:blank", "_blank");
    if (w) {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      w.location.href = url; // render the HTML as a document (not raw source)
      w.focus();
      setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 600);
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 60000);
    } else {
      openHtmlInNewTab(html); // popup blocked → download
    }
  } catch { /* ignore window/print failures */ }

  if (opts?.message) {
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ text: opts.message });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(opts.message);
        Alert.alert("Link copied", "The signing link was copied to your clipboard.");
      }
    } catch { /* share cancelled or unavailable */ }
  }
}

// Renders the quote to a PDF and opens the native share sheet. Errors surface as an alert.
// When `opts.message` is given (e.g. the remote signing link), we use the OS share sheet with
// that text so the link rides along; otherwise we share the PDF file via expo-sharing.
export async function shareQuotePDF(data: QuotePDFData, opts?: { message?: string }): Promise<void> {
  try {
    const html = generateQuotePDF(data);
    if (Platform.OS === "web") { await shareQuotePDFWeb(html, opts); return; }
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

    if (opts?.message) {
      // RN Share carries the message text (with the signing link); on iOS it also attaches
      // the PDF via `url`. The link is embedded in the PDF too, so nothing is lost on Android.
      await Share.share({ message: opts.message, url: shareUri });
      return;
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

// Contractor-side PREVIEW — shows the quote exactly as the client receives it, RENDERED (never raw
// HTML). Web: opens the HTML as a document in a new tab. Native: the OS print preview paginates the
// HTML into a real PDF view. No sending, no side effects.
export async function previewQuotePDF(data: QuotePDFData): Promise<void> {
  try {
    const html = generateQuotePDF(data);
    if (Platform.OS === "web") { openHtmlInNewTab(html); return; }
    // Native: printAsync renders the HTML as a paginated PDF preview in the OS print UI.
    try {
      await Print.printAsync({ html });
    } catch {
      // Fallback: render to a file and open it (share sheet / in-app browser).
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Quote Preview", UTI: "com.adobe.pdf" });
      else await WebBrowser.openBrowserAsync(uri);
    }
  } catch (e) {
    Alert.alert("Couldn't open preview", e instanceof Error ? e.message : "Something went wrong. Please try again.");
  }
}
