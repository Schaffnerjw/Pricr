import { useCallback, useEffect, useState } from "react";
import { SIGN_BASE } from "../constants/brand";
import { masterAuthHeaders } from "../utils/masterAuth";

export interface PlatformBiz { code: string; name: string; trade: string; joined: string; lastActive: number | null; quotesThisMonth: number; totalQuotes: number; }
export interface PlatformAnalytics {
  totalBusinesses: number; totalQuotes: number; totalSigned: number; platformCloseRate: number; contractValue: number; activeThisMonth: number;
  newThisMonth: number; newLastMonth: number; growthPct: number; avgQuotesPerBizPerMonth: number;
  mostActive: PlatformBiz[]; atRisk: PlatformBiz[]; neverUsed: PlatformBiz[]; brokenSchema: PlatformBiz[];
  signaturesThisMonth: number; avgTimeToSignHours: number; avgQuoteValue: number; highestQuote: number;
  popularTrade: { trade: string; count: number }; tradeBreakdown: { trade: string; count: number }[];
}

// Super-admin platform analytics — cross-tenant aggregation via the Railway proxy (service role only).
export function usePlatformAnalytics() {
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${SIGN_BASE}/admin/platform-analytics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...masterAuthHeaders() },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load");
      setData(json as PlatformAnalytics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}
