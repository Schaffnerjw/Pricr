// Pure: produce a fresh quote from an existing one — same sections/materials/measurements, but a new
// id and a clean slate for the client (no name, notes, signature, status, or expiry carried over).
import { SavedQuote } from "../types";

let dupSeq = 0;

export function duplicateQuote(q: SavedQuote): SavedQuote {
  return {
    id: `${Date.now()}_${dupSeq++}`,
    timestamp: Date.now(),
    customerName: "",
    trade: q.trade,
    total: q.total,
    deposit: q.deposit,
    fieldValues: { ...(q.fieldValues || {}) },
    userId: q.userId,
    repName: q.repName,
    status: "open",
    ...(q.discount ? { discount: { ...q.discount } } : {}),
    // Intentionally cleared for the new client: notes, signature, signedAt, presentation, outcome,
    // lostReason/lostNote, expiresAt, firstViewedAt, viewCount.
  };
}
