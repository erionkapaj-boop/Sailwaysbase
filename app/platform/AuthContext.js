"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../../lib/platform/supabaseClient";
import { getMyUserRow, getMyClientProfile, getMySkipperProfile, getSkipperNotificationCounts } from "../../lib/platform/db";

const AuthContext = createContext(null);
const EMPTY_NOTIFICATIONS = { pendingRequests: 0, unreadBookingIds: [] };

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [userRow, setUserRow] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notifications, setNotifications] = useState(EMPTY_NOTIFICATIONS);

  // Separate from refresh() (below) because a booking gets read or claimed
  // without the profile itself changing — the header bell needs to update
  // on its own, not only whenever a full profile reload happens to run.
  const refreshNotifications = useCallback(async (skipperId) => {
    if (!skipperId) {
      setNotifications(EMPTY_NOTIFICATIONS);
      return;
    }
    try {
      setNotifications(await getSkipperNotificationCounts(skipperId));
    } catch {
      // A stale badge is a much smaller problem than a broken header.
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      setLoadError("");
      const { data } = await supabase.auth.getSession();
      setSession(data.session || null);
      if (data.session) {
        const u = await getMyUserRow();
        setUserRow(u);
        if (u?.role === "client") setProfile(await getMyClientProfile());
        else if (u?.role === "skipper") {
          const p = await getMySkipperProfile();
          setProfile(p);
          refreshNotifications(p?.id);
        } else {
          setProfile(null);
          setNotifications(EMPTY_NOTIFICATIONS);
        }
      } else {
        setUserRow(null);
        setProfile(null);
        setNotifications(EMPTY_NOTIFICATIONS);
      }
    } catch (err) {
      // Keep the real reason — a failed fetch is NOT the same as "no profile
      // row exists", and conflating the two sent us chasing a phantom missing
      // row while the actual cause was an RLS error on the read.
      console.error("auth refresh failed:", err.message || err);
      setLoadError(err.message || String(err));
      setProfile(null);
    }
    setLoading(false);
  }, [refreshNotifications]);

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
    setNotifications(EMPTY_NOTIFICATIONS);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        userRow,
        profile,
        loading,
        loadError,
        refresh,
        signOut,
        notifications,
        refreshNotifications: () => refreshNotifications(profile?.id),
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
