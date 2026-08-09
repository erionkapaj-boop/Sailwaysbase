"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../../lib/platform/supabaseClient";
import { getMyUserRow, getMyClientProfile, getMySkipperProfile } from "../../lib/platform/db";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [userRow, setUserRow] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.auth.getSession();
    setSession(data.session || null);
    if (data.session) {
      const u = await getMyUserRow();
      setUserRow(u);
      if (u?.role === "client") setProfile(await getMyClientProfile());
      else if (u?.role === "skipper") setProfile(await getMySkipperProfile());
      else setProfile(null);
    } else {
      setUserRow(null);
      setProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setUserRow(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        userRow,
        profile,
        loading,
        refresh,
        signOut,
        needsRoleSelection: !!session && !loading && !userRow,
        role: userRow?.role || null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
