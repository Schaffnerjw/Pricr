import { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import supabase from "../lib/supabase";

type Role = "admin" | "rep";
type Result = { error: string | null };

// Supabase email/password auth. No-ops with a clear error when Supabase isn't configured,
// so callers can fall back to the existing local auth (and the CB101919 master flow stays untouched).
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<Result> => {
    if (!supabase) return { error: "Supabase not configured" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, name: string, role: Role, businessId: string): Promise<Result> => {
    if (!supabase) return { error: "Supabase not configured" };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    const uid = data.user?.id;
    if (uid) {
      const { error: rowError } = await supabase.from("users").insert({ id: uid, business_id: businessId, role, name, email });
      if (rowError) return { error: rowError.message };
    }
    return { error: null };
  };

  const signOut = async (): Promise<void> => {
    if (supabase) await supabase.auth.signOut();
  };

  return { user, session, loading, signIn, signUp, signOut };
}
