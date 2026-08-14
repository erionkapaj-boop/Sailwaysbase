"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../../lib/platform/supabaseClient";
import {
  getMyUserRow,
  getMyClientProfile,
  getMySkipperProfile,
  getMyNotificationCounts,
  setViewAsUser,
} from "../../lib/platform/db";

const AuthContext = createContext(null);
const EMPTY_NOTIFICATIONS = { pendingRequests: 0, unreadBookingIds: [] };

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [userRow, setUserRow] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notifications, setNotifications] = useState(EMPTY_NOTIFICATIONS);
  // Whose account is being rendered. Null for everyone except an admin who
  // has explicitly picked someone. Held in sessionStorage rather than the URL
  // so it survives navigation across every page — the point is to walk the
  // whole app as that person, not one screen — and dies with the tab.
  const [viewingAs, setViewingAs] = useState(null);
  const [adminUserRow, setAdminUserRow] = useState(null);

  // Separate from refresh() (below) because a booking gets read or claimed
  // without the profile itself changing — the header icons need to update
  // on its own, not only whenever a full profile reload happens to run.
  //
  // Identity comes from the session inside the RPC, so this works the same
  // for a client as for a professional and needs no argument.
  const refreshNotifications = useCallback(async () => {
    try {
      setNotifications(await getMyNotificationCounts());
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
        // Read who (if anyone) is being viewed before any query runs, so the
        // very first fetch already answers for the right person.
        let subject = null;
        try {
          subject = JSON.parse(sessionStorage.getItem("sf_view_as") || "null");
        } catch {
          subject = null;
        }
        // Only an admin may do this; the database refuses regardless, but
        // there is no reason to send the attempt.
        const meRow = await (async () => {
          setViewAsUser(null);
          return getMyUserRow();
        })();
        setAdminUserRow(meRow);
        const allowed = meRow?.role === "admin" ? subject : null;
        setViewAsUser(allowed?.id || null);
        setViewingAs(allowed);

        const u = await getMyUserRow();
        setUserRow(u);
        if (u?.role === "client") setProfile(await getMyClientProfile());
        else if (u?.role === "skipper") setProfile(await getMySkipperProfile());
        else setProfile(null);
        if (u?.role === "client" || u?.role === "skipper") refreshNotifications();
        else setNotifications(EMPTY_NOTIFICATIONS);
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

  const startViewAs = useCallback((subject) => {
    sessionStorage.setItem("sf_view_as", JSON.stringify(subject));
    setViewAsUser(subject.id);
    setViewingAs(subject);
    refresh();
  }, [refresh]);

  const stopViewAs = useCallback(() => {
    sessionStorage.removeItem("sf_view_as");
    setViewAsUser(null);
    setViewingAs(null);
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    sessionStorage.removeItem("sf_view_as");
    setViewAsUser(null);
    setViewingAs(null);
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
        refreshNotifications,
        viewingAs,
        startViewAs,
        stopViewAs,
        isAdmin: adminUserRow?.role === "admin",
        readOnly: Boolean(viewingAs),
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
