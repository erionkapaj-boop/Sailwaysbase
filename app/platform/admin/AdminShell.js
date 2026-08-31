"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../AuthContext";
import { adminOverview } from "../../../lib/platform/db";
import { colors, radius, muted, fontSans } from "../../../lib/platform/theme";

// Sections are routes, not tabs held in a single component's state.
//
// Tabs meant every section lived in one file, all of them re-rendering on
// every state change, none of them linkable — you couldn't send someone "the
// disputes screen", and coming back always landed on the first tab. As the
// console grows into banking and scheduling, one file would have become
// unworkable; separate routes keep each section's data fetching and state to
// itself.
export const SECTIONS = [
  { href: "/platform/admin", label: "Επισκόπηση", icon: "▦", exact: true },
  { href: "/platform/admin/coverage", label: "Κάλυψη", icon: "⚑", badge: "coverage_needed" },
  { href: "/platform/admin/offers", label: "Αναθέσεις", icon: "→" },
  { href: "/platform/admin/approvals", label: "Εγκρίσεις", icon: "✓", badge: "pending_approvals" },
  { href: "/platform/admin/users", label: "Χρήστες", icon: "◍" },
  { href: "/platform/admin/bookings", label: "Κρατήσεις", icon: "≡" },
  { href: "/platform/admin/deliveries", label: "Μεταφορές", icon: "⛵" },
  { href: "/platform/admin/finance", label: "Οικονομικά", icon: "€" },
  { href: "/platform/admin/disputes", label: "Διαφορές", icon: "!", badge: "open_disputes" },
  { href: "/platform/admin/messages", label: "Μηνύματα", icon: "✉", badge: "contact_new" },
  { href: "/platform/admin/settings", label: "Ρυθμίσεις", icon: "⚙" },
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

function NavItem({ section, active, count }) {
  return (
    <Link
      href={section.href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: radius.sm,
        textDecoration: "none",
        fontSize: 14,
        fontFamily: fontSans,
        whiteSpace: "nowrap",
        color: active ? colors.ink : colors.inkSoft,
        background: active ? colors.seaGlass : "transparent",
        fontWeight: active ? 600 : 400,
      }}
    >
      <span aria-hidden="true" style={{ width: 16, textAlign: "center", opacity: 0.7, flexShrink: 0 }}>
        {section.icon}
      </span>
      <span style={{ flex: 1 }}>{section.label}</span>
      {count > 0 && (
        <span
          style={{
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: colors.warn,
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

// Lives in the layout now, not in each page, so it's one DOM node that
// persists across navigation instead of a fresh one per route. Rebuilding it
// on every click was what reset its horizontal scroll position on a phone —
// tapping a tab further right in the strip snapped the whole strip back to
// the start, so the screen you landed on looked like it had jumped back to
// the first section even though the content underneath was correct.
export function AdminNav() {
  const pathname = usePathname();
  const counts = useAdminCounts();
  const isActive = (s) => (s.exact ? pathname === s.href : pathname.startsWith(s.href));

  return (
    <nav className="sf-admin-nav">
      <div className="sf-admin-nav-inner">
        {SECTIONS.map((s) => (
          <NavItem key={s.href} section={s} active={isActive(s)} count={counts[s.badge] || 0} />
        ))}
      </div>
    </nav>
  );
}

// Per-page header only. Navigation and the counts fetch live one level up,
// in app/platform/admin/layout.js, so they survive from one section to the
// next instead of being torn down and rebuilt with every route.
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
