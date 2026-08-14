"use client";
import { useEffect, useState } from "react";
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
  { href: "/platform/admin/approvals", label: "Εγκρίσεις", icon: "✓", badge: "pending_approvals" },
  { href: "/platform/admin/users", label: "Χρήστες", icon: "◍" },
  { href: "/platform/admin/bookings", label: "Κρατήσεις", icon: "≡" },
  { href: "/platform/admin/finance", label: "Οικονομικά", icon: "€" },
  { href: "/platform/admin/disputes", label: "Διαφορές", icon: "!", badge: "open_disputes" },
  { href: "/platform/admin/settings", label: "Ρυθμίσεις", icon: "⚙" },
];

// Every section shows the same attention badges, so each one loads the same
// single overview call rather than inventing its own count queries.
export function useAdminCounts() {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    adminOverview().then(setCounts).catch(() => {});
  }, []);
  return counts;
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

export default function AdminShell({ title, subtitle, actions, counts = {}, children }) {
  const pathname = usePathname();
  const { session, userRow, loading } = useAuth();

  if (loading) return <div style={{ padding: 32, ...muted }}>Φόρτωση…</div>;
  if (!session) return <div style={{ padding: 32 }}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "admin") return <div style={{ padding: 32 }}>Πρόσβαση μόνο για admin.</div>;

  const isActive = (s) => (s.exact ? pathname === s.href : pathname.startsWith(s.href));

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 64px" }}>
      <div className="sf-admin-layout">
        {/* Sidebar on a real screen; the same list scrolls horizontally on a
            phone rather than collapsing into a menu, so the section you're in
            and the ones needing attention stay visible either way. */}
        <nav className="sf-admin-nav">
          <div className="sf-admin-nav-inner">
            {SECTIONS.map((s) => (
              <NavItem key={s.href} section={s} active={isActive(s)} count={counts[s.badge] || 0} />
            ))}
          </div>
        </nav>

        <main style={{ flex: 1, minWidth: 0 }}>
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
        </main>
      </div>

      <style>{`
        /* Stacked on a phone, side by side once there's room. Keeping the
           row direction at every width was what pushed the content off the
           screen entirely on mobile. */
        .sf-admin-layout { display: flex; flex-direction: column; }
        .sf-admin-nav { min-width: 0; }
        .sf-admin-nav-inner {
          display: flex;
          gap: 3px;
          overflow-x: auto;
          padding-bottom: 6px;
          margin-bottom: 14px;
          border-bottom: 1px solid ${colors.border};
          scrollbar-width: none;
        }
        .sf-admin-nav-inner::-webkit-scrollbar { display: none; }
        @media (min-width: 860px) {
          .sf-admin-layout { flex-direction: row; gap: 24px; align-items: flex-start; }
          .sf-admin-nav { width: 208px; flex-shrink: 0; position: sticky; top: 76px; }
          .sf-admin-nav-inner {
            flex-direction: column;
            overflow: visible;
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
          }
        }
      `}</style>
    </div>
  );
}
