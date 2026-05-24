import { useCallback, useEffect, useState } from "react";
import supabase from "../lib/supabase";

export interface BusinessRow { id: string; name: string; created_at?: string }
export interface BrandConfigRow {
  business_id: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  logo_url: string | null;
  brand_configured: boolean;
}

// Loads the signed-in user's business + brand config from Supabase. Returns loading/error,
// and a `save` that updates locally and in Supabase. No-ops gracefully when unconfigured.
export function useBusiness() {
  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [brandConfig, setBrandConfig] = useState<BrandConfigRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { setLoading(false); return; }
      const { data: u, error: uErr } = await supabase.from("users").select("business_id").eq("id", uid).single();
      if (uErr) throw uErr;
      const bizId = u?.business_id;
      if (!bizId) { setLoading(false); return; }
      const { data: biz, error: bErr } = await supabase.from("businesses").select("*").eq("id", bizId).single();
      if (bErr) throw bErr;
      const { data: brand } = await supabase.from("brand_configs").select("*").eq("business_id", bizId).single();
      setBusiness(biz as BusinessRow);
      setBrandConfig((brand as BrandConfigRow) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load business");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (updates: { name?: string; brand?: Partial<BrandConfigRow> }): Promise<void> => {
    if (!supabase || !business) return;
    try {
      if (updates.name !== undefined) {
        setBusiness(b => (b ? { ...b, name: updates.name as string } : b));
        await supabase.from("businesses").update({ name: updates.name }).eq("id", business.id);
      }
      if (updates.brand) {
        setBrandConfig(c => (c ? { ...c, ...updates.brand } : c));
        await supabase.from("brand_configs").update({ ...updates.brand, updated_at: new Date().toISOString() }).eq("business_id", business.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save business");
    }
  };

  return { business, brandConfig, loading, error, save, reload: load };
}
