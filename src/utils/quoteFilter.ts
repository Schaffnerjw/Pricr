// Pure search/filter/sort for the quote history screen. Operates on the cloud QuoteRow shape
// (customer_name / total / status / created_at / quote_data), but typed loosely so it's reusable.

export type HistoryStatusFilter = "all" | "pending" | "sent" | "signed" | "expired";
export type HistorySort = "newest" | "oldest" | "highest" | "lowest";

export interface FilterableQuote {
  customer_name?: string | null;
  total?: number | null;
  status?: string;
  signed_at?: string | null;
  created_at?: string;
  quote_data?: { expiresAt?: number } | null;
}

const isExpired = (q: FilterableQuote): boolean => {
  const exp = q.quote_data?.expiresAt;
  return !!exp && exp < Date.now() && !q.signed_at && q.status !== "accepted";
};
const matchesStatus = (q: FilterableQuote, f: HistoryStatusFilter): boolean => {
  switch (f) {
    case "all": return true;
    case "signed": return !!q.signed_at || q.status === "accepted";
    case "expired": return isExpired(q);
    case "sent": return q.status === "sent";
    case "pending": return (q.status === "draft" || !q.status) && !isExpired(q);
    default: return true;
  }
};

// Filter by status + free-text (client name or amount), then sort. Pure; returns a new array.
export function filterQuotes<T extends FilterableQuote>(
  quotes: T[],
  opts: { search?: string; status?: HistoryStatusFilter; sort?: HistorySort },
): T[] {
  const search = (opts.search || "").trim().toLowerCase();
  const status = opts.status || "all";
  const sort = opts.sort || "newest";

  let out = (quotes || []).filter(q => matchesStatus(q, status));
  if (search) {
    const num = search.replace(/[^0-9.]/g, "");
    out = out.filter(q => {
      const name = (q.customer_name || "").toLowerCase();
      const total = String(q.total ?? "");
      return name.includes(search) || (!!num && total.includes(num));
    });
  }
  const ts = (q: T) => (q.created_at ? new Date(q.created_at).getTime() : 0);
  const amt = (q: T) => Number(q.total) || 0;
  out = out.slice().sort((a, b) => {
    switch (sort) {
      case "oldest": return ts(a) - ts(b);
      case "highest": return amt(b) - amt(a);
      case "lowest": return amt(a) - amt(b);
      case "newest": default: return ts(b) - ts(a);
    }
  });
  return out;
}
