"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { tNow } from "../../../lib/platform/tNow";
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
// label και heading διαβάζονται στη γλώσσα της σελίδας (namespace AdminShell)·
// το PlatformShell τα διαβάζει ως απλές ιδιότητες.
const nav = (key) => tNow("AdminShell", `nav.${key}`);
const section = (key, extra = {}, headingKey) => {
  const out = { ...extra };
  Object.defineProperty(out, "label", { get: () => nav(key), enumerable: true });
  if (headingKey) Object.defineProperty(out, "heading", { get: () => nav(headingKey), enumerable: true });
  return out;
};
export const SECTIONS = [
  // Grouped by what you came to do, not by where the data lives. Anything
  // that can be waiting on you sits in the first group, with a count.
  section("overview", { href: "/platform/admin", exact: true }, "headingAdmin"),
  section("approvals", {
    href: "/platform/admin/approvals",
    badge: ["pending_verification", "pending_approvals", "pending_secondary_roles", "pending_photos"],
  }),
  section("messages", { href: "/platform/admin/messages", badge: "contact_new" }),
  section("disputes", { href: "/platform/admin/disputes", badge: "open_disputes" }),
  section(
    "replacements",
    {
      href: "/platform/admin/replacements",
      badge: ["coverage_needed", "replacement_awaiting_client"],
    },
    "headingBookings"
  ),
  section("offers", { href: "/platform/admin/offers", ownerOnly: true }),
  section("bookings", { href: "/platform/admin/bookings" }),
  section("deliveries", { href: "/platform/admin/deliveries" }),
  section("users", { href: "/platform/admin/users" }, "headingUsers"),
  // ownerOnly: μόνο ο ιδιοκτήτης (0112).
  section("finance", { href: "/platform/admin/finance", ownerOnly: true, badge: "credit_purchases_pending" }),
  section("health", { href: "/platform/admin/health", ownerOnly: true, badge: "health_open" }, "headingSystem"),
  section("settings", { href: "/platform/admin/settings", ownerOnly: true }),
  section("ghost", { href: "/platform/admin/ghost", ownerOnly: true }),
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
    adminOverview({ fresh: true }).then(setCounts).catch(() => {});
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
export default function AdminShell({ title, subtitle, avatar, actions, ownerOnly = false, children }) {
  const t = useTranslations("AdminShell");
  const { session, userRow, loading, isOwner } = useAuth();

  if (loading) return <div style={{ padding: 32, ...muted }}>{t("loading")}</div>;
  if (!session) return <div style={{ padding: 32 }}>{t("signInRequired")}</div>;
  if (userRow?.role !== "admin" && !userRow?.is_staff_admin && !userRow?.is_owner)
    return <div style={{ padding: 32 }}>{t("adminsOnly")}</div>;
  if (ownerOnly && !isOwner) return <div style={{ padding: 32 }}>{t("ownerOnly")}</div>;

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
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {avatar}
          <div style={{ minWidth: 0 }}>
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
        </div>
        {actions}
      </header>
      {children}
    </>
  );
}
