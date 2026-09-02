"use client";
import { createContext, useContext, useEffect, useState } from "react";
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
  { href: "/platform/admin", label: "Επισκόπηση", exact: true, heading: "Διαχείριση" },
  { href: "/platform/admin/coverage", label: "Κάλυψη", badge: "coverage_needed", heading: "Ανάθεση πληρώματος" },
  { href: "/platform/admin/offers", label: "Αναθέσεις" },
  { href: "/platform/admin/approvals", label: "Εγκρίσεις", badge: "pending_approvals", heading: "Χρήστες" },
  { href: "/platform/admin/users", label: "Χρήστες", badge: "pending_verification" },
  { href: "/platform/admin/ghost", label: "Ghost Mode" },
  { href: "/platform/admin/bookings", label: "Όλες οι κρατήσεις", heading: "Καταγραφές" },
  { href: "/platform/admin/deliveries", label: "Μεταφορές" },
  { href: "/platform/admin/finance", label: "Οικονομικά", heading: "Οικονομικά & διαφορές" },
  { href: "/platform/admin/disputes", label: "Διαφορές", badge: "open_disputes" },
  { href: "/platform/admin/messages", label: "Μηνύματα", badge: "contact_new", heading: "Λοιπά" },
  { href: "/platform/admin/settings", label: "Ρυθμίσεις" },
];

// Fetched once, in the layout that wraps every admin route, and shared from
// there. Each page used to call this independently, which meant a fresh
// round trip — and the nav badges briefly reading stale/zero — on every
// single click between sections, not just on first load.
const AdminCountsContext = createContext({});

export function AdminCountsProvider({ children }) {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    adminOverview().then(setCounts).catch(() => {});
  }, []);
  return <AdminCountsContext.Provider value={counts}>{children}</AdminCountsContext.Provider>;
}

export function useAdminCounts() {
  return useContext(AdminCountsContext);
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
