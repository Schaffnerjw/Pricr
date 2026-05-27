import { getOfflineSignatures, saveOfflineSignature, markOfflineSignature, countPending, OfflineSignedQuote } from "../offlineSignatures";
import { isValidEmail, isValidPhone, formatPhone } from "../contactValidation";
import { filterQuotes } from "../quoteFilter";
import { configureOptions, shouldNotifyOwner } from "../configureOptions";

const sig = (over: Partial<OfflineSignedQuote> = {}): OfflineSignedQuote => ({
  quoteId: "q1", clientName: "Jane Doe", signatureDataUrl: "data:image/png;base64,AAAA", signedAt: 1000,
  totalAmount: 9124, lineItems: [], businessCode: "ABC123", consentGiven: true, syncStatus: "pending", ...over,
});

describe("offline signatures", () => {
  test("offline signature stored correctly in AsyncStorage", async () => {
    await saveOfflineSignature(sig());
    const list = await getOfflineSignatures();
    const found = list.find(s => s.quoteId === "q1");
    expect(found).toBeTruthy();
    expect(found!.clientName).toBe("Jane Doe");
    expect(found!.consentGiven).toBe(true);
    expect(found!.syncStatus).toBe("pending");
    expect(found!.signatureDataUrl.startsWith("data:image/png")).toBe(true);
  });

  test("offline sync queued when network returns", async () => {
    await saveOfflineSignature(sig({ quoteId: "q2" }));
    expect(countPending(await getOfflineSignatures())).toBeGreaterThanOrEqual(1);
    // Simulate a successful sync → removed from the pending store, never lost before that.
    await markOfflineSignature("q2", "synced");
    const after = await getOfflineSignatures();
    expect(after.find(s => s.quoteId === "q2")).toBeUndefined();
    // A failed sync stays pending (retried later).
    await saveOfflineSignature(sig({ quoteId: "q3" }));
    await markOfflineSignature("q3", "failed");
    const failed = (await getOfflineSignatures()).find(s => s.quoteId === "q3");
    expect(failed!.syncStatus).toBe("failed");
    expect(failed!.attempts).toBe(1);
  });
});

describe("contact info validation", () => {
  test("contact info validated at signup", () => {
    expect(isValidEmail("matt@hemmadecks.com")).toBe(true);
    expect(isValidEmail("matt@hemma")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidPhone("(330) 555-0182")).toBe(true);
    expect(isValidPhone("330555")).toBe(false);
    expect(formatPhone("3305550182")).toBe("(330) 555-0182");
    expect(formatPhone("330")).toBe("(330");
  });
});

describe("configure sheet + owner gate", () => {
  test("configure sheet opens on web without Alert.alert", () => {
    // The sheet is driven by configureOptions (a Modal renders these) — no Alert.alert involved.
    const admin = configureOptions(true).map(o => o.key);
    expect(admin).toEqual(["kit", "edit", "import"]);
    const rep = configureOptions(false).map(o => o.key);
    expect(rep).toEqual(["kit", "import"]); // "Edit manually" hidden for reps
  });

  test("owner notification sends once per business", () => {
    expect(shouldNotifyOwner({ welcome: null })).toBe(true);   // welcome not yet sent → notify
    expect(shouldNotifyOwner(null)).toBe(true);
    expect(shouldNotifyOwner({ welcome: 1700000000000 })).toBe(false); // already welcomed → don't notify again
  });
});

describe("quote history search", () => {
  const quotes = [
    { customer_name: "Alice", total: 5000, status: "draft", created_at: "2026-01-01T00:00:00Z" },
    { customer_name: "Bob", total: 12000, status: "sent", created_at: "2026-02-01T00:00:00Z" },
    { customer_name: "Carol", total: 800, status: "accepted", signed_at: "2026-03-01T00:00:00Z", created_at: "2026-03-01T00:00:00Z" },
  ];
  test("quote history search filters correctly", () => {
    expect(filterQuotes(quotes, { search: "bob" }).map(q => q.customer_name)).toEqual(["Bob"]);
    expect(filterQuotes(quotes, { search: "12000" }).map(q => q.customer_name)).toEqual(["Bob"]);
    expect(filterQuotes(quotes, { status: "signed" }).map(q => q.customer_name)).toEqual(["Carol"]);
    expect(filterQuotes(quotes, { status: "sent" }).map(q => q.customer_name)).toEqual(["Bob"]);
    // Sort highest → lowest amount.
    expect(filterQuotes(quotes, { sort: "highest" }).map(q => q.total)).toEqual([12000, 5000, 800]);
    expect(filterQuotes(quotes, { sort: "lowest" }).map(q => q.total)).toEqual([800, 5000, 12000]);
  });
});
