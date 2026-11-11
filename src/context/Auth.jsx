import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  async function loadProfile(userId) {
    if (!userId) { setProfile(null); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data || null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user?.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
      await loadProfile(s?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  return (
    <AuthCtx.Provider value={{ session, profile, loading, signIn, signOut, recovery, clearRecovery: () => setRecovery(false), reloadProfile: () => loadProfile(session?.user?.id) }}>
      {children}
    </AuthCtx.Provider>
  );
}
