import { useCallback, useEffect, useState } from "react";
import supabase from "../lib/supabase";

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";
export interface QuoteRow {
  id: string;
  business_id: string;
  created_by: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  quote_data: any;
  total: number | null;
  status: QuoteStatus;
  signature_data?: string | null;
  signed_at?: string | null;
  signing_token?: string | null;
  signer_ip?: string | null;
  signer_phone?: string | null;
  signer_email?: string | null;
  phone_verified?: boolean | null;
  document_hash?: string | null;
  audit_log?: any[] | null;
  first_viewed_at?: string | null;
  view_count?: number | null;
  created_at: string;
  updated_at?: string;
}

// All quotes for a business, newest first. Inserts new quotes and updates status.
// No-ops gracefully when Supabase isn't configured or no businessId is provided.
export function useQuotes(businessId?: string) {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !businessId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("quotes").select("*").eq("business_id", businessId).order("created_at", { ascending: false });
    if (err) setError(err.message);
    setQuotes((data as QuoteRow[]) ?? []);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const saveQuote = async (quoteData: any, extras: { customer_name?: string; customer_phone?: string; total?: number; created_by?: string } = {}): Promise<QuoteRow | null> => {
    if (!supabase || !businessId) return null;
    const { data, error: err } = await supabase
      .from("quotes")
      .insert({ business_id: businessId, quote_data: quoteData, customer_name: extras.customer_name ?? null, customer_phone: extras.customer_phone ?? null, total: extras.total ?? null, created_by: extras.created_by ?? null, status: "draft" })
      .select().single();
    if (err) { setError(err.message); return null; }
    setQuotes(q => [data as QuoteRow, ...q]);
    return data as QuoteRow;
  };

  const updateQuoteStatus = async (id: string, status: QuoteStatus): Promise<void> => {
    if (!supabase) return;
    setQuotes(q => q.map(x => (x.id === id ? { ...x, status } : x)));
    const { error: err } = await supabase.from("quotes").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (err) setError(err.message);
  };

  // Merge a partial into a quote's quote_data jsonb (used for win/loss outcome). Optimistic.
  const updateQuoteData = async (id: string, patch: Record<string, any>): Promise<void> => {
    if (!supabase) return;
    const row = quotes.find(x => x.id === id);
    const merged = { ...(row?.quote_data || {}), ...patch };
    setQuotes(q => q.map(x => (x.id === id ? { ...x, quote_data: merged } : x)));
    const { error: err } = await supabase.from("quotes").update({ quote_data: merged, updated_at: new Date().toISOString() }).eq("id", id);
    if (err) setError(err.message);
  };

  return { quotes, saveQuote, updateQuoteStatus, updateQuoteData, loading, error, reload: load };
}
