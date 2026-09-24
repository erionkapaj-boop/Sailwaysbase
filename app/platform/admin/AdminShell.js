"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../AuthContext";
import { adminOverview } from "../../../lib/platform/db";
import { colors, muted, fontSans } from "../../../lib/platform/theme";

// Sections are routes, not tabs held in a single component's state.
//
// Tabs meant every section lived in one file, all of them re-rendering on
// every state change, none of them linkable — you couldn't send someone "the
// disputes screen", and coming back always landed on the first tab. As the
// console grows into banking and scheduling, one file would have become
// unworkable; separate routes keep each section's data fetching and state to
// itself.
//
// Navigation itself used to be a second, horizontal strip of these rendered
// below the site's own hamburger menu — two nav systems stacked on one
// screen, the strip forced into its own horizontal scroll on a phone. It's
// gone; PlatformShell.js reads this same list (imported, not duplicated) to
// populate the site's one hamburger drawer with a grouped admin section,
// heading text taken from `heading` below. `label` unchanged either way —
// it's what's shown, on a full nav row here or in a drawer link there.
// `badge` still names the live count key from useAdminCounts() for the
// pages that show their own "X need attention" callouts.
export const SECTIONS = [
  // Grouped by what you came to do, not by where the data lives. Anything
  // that can be waiting on you sits in the first group, with a count.
  { href: "/platform/admin", label: "Επισκόπηση", exact: true, heading: "Διαχείριση" },
  {
    href: "/platform/admin/approvals",
    label: "Εκκρεμότητες",
    badge: ["pending_verification", "pending_approvals", "pending_secondary_roles"],
  },
  { href: "/platform/admin/messages", label: "Μηνύματα επικοινωνίας", badge: "contact_new" },
  { href: "/platform/admin/disputes", label: "Αναφορές ακύρωσης", badge: "open_disputes" },
  { href: "/platform/admin/coverage", label: "Κενά από ακυρώσεις", badge: "coverage_needed", heading: "Κρατήσεις & πλήρωμα" },
  { href: "/platform/admin/offers", label: "Αναθέσεις δουλειάς" },
  { href: "/platform/admin/bookings", label: "Όλες οι κρατήσεις" },
  { href: "/platform/admin/deliveries", label: "Μεταφορές σκάφους" },
  { href: "/platform/admin/users", label: "Χρήστες", heading: "Χρήστες & χρήματα" },
  { href: "/platform/admin/finance", label: "Οικονομικά" },
  { href: "/platform/admin/settings", label: "Ρυθμίσεις", heading: "Σύστημα" },
  { href: "/platform/admin/ghost", label: "Δοκιμές (Ghost Mode)" },
];

// Sum of one or several overview counts — a section can stand for more than
// one kind of waiting item (Εκκρεμότητες: signups + profiles + extra roles).
export function badgeCount(badge, counts) {
  if (!badge || !counts) return 0;
  const keys = Array.isArray(badge) ? badge : [badge];
  return keys.reduce((n, k) => n + (Number(counts[k]) || 0), 0);
}

// Pages call useRefreshAdminCounts() after an action; the site menu (which
// lives outside this provider) listens for the same event.
export const ADMIN_COUNTS_EVENT = "sf-admin-counts-changed";

// Fetched once, in the layout that wraps every admin route, and shared from
// there. Each page used to call this independently, which meant a fresh
// round trip — and the nav badges briefly reading stale/zero — on every
// single click between sections, not just on first load.
const AdminCountsContext = createContext({});
const AdminCountsRefreshContext = createContext(() => {});

// Re-read on every section change and after every action that changes a
// count (useRefreshAdminCounts) — fetched only once, the menu kept saying
// "Χρήστες 2" after both had been verified.
export function AdminCountsProvider({ children }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState({});
  const refresh = useCallback(() => {
    adminOverview().then(setCounts).catch(() => {});
    window.dispatchEvent(new Event(ADMIN_COUNTS_EVENT));
  }, []);
  useEffect(() => {
    refresh();
  }, [pathname, refresh]);
  return (
    <AdminCountsRefreshContext.Provider value={refresh}>
      <AdminCountsContext.Provider value={counts}>{children}</AdminCountsContext.Provider>
    </AdminCountsRefreshContext.Provider>
  );
}

export function useAdminCounts() {
  return useContext(AdminCountsContext);
}

export function useRefreshAdminCounts() {
  return useContext(AdminCountsRefreshContext);
}

// Per-page header only. Navigation lives in the site's one hamburger drawer
// (PlatformShell.js); the counts fetch lives one level up, in
// app/platform/admin/layout.js, so it survives from one section to the next
// instead of being re-fetched on every route.
export default function AdminShell({ title, subtitle, actions, children }) {
  const { session, userRow, loading } = useAuth();

  if (loading) return <div style={{ padding: 32, ...muted }}>Φόρτωση…</div>;
  if (!session) return <div style={{ padding: 32 }}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "admin" && !userRow?.is_staff_admin)
    return <div style={{ padding: 32 }}>Πρόσβαση μόνο για admin.</div>;

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: fontSans,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              margin: 0,
              color: colors.ink,
            }}
          >
            {title}
          </h1>
          {subtitle && <p style={{ ...muted, fontSize: 13, margin: "5px 0 0" }}>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </>
  );
}
