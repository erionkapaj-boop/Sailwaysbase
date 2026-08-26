"use client";
import { usePathname } from "next/navigation";
import { colors } from "../../../lib/platform/theme";
import { AdminCountsProvider, AdminNav } from "./AdminShell";

// Shared across every /platform/admin/* route so the nav is one DOM node
// that survives navigation, not a fresh one rebuilt per page (see AdminNav's
// comment for why that mattered on a phone).
//
// Two routes opt out on purpose: /login isn't part of the authenticated
// console (nothing to gate, no counts to fetch, no section list to show
// someone who isn't signed in yet), and /user/[id] is a focused record view
// reached via its own "← Πίσω στους χρήστες" link — it was built standalone,
// and wrapping it in the section nav now would just duplicate that back
// link without anyone having asked for the change.
export default function AdminLayout({ children }) {
  const pathname = usePathname();
  if (pathname === "/platform/admin/login" || pathname.startsWith("/platform/admin/user/")) {
    return children;
  }

  return (
    <AdminCountsProvider>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 64px" }}>
        <div className="sf-admin-layout">
          <AdminNav />
          <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
        </div>

        {/* Stacked on a phone, side by side once there's room. Keeping the row
            direction at every width was what pushed the content off the
            screen entirely on mobile. (Kept as a JSX comment, not a CSS one:
            an apostrophe inside a rendered <style> string gets HTML-escaped
            by React's server render but not by the browser's own <style>
            parser, so the two disagreed on hydration and forced a full
            client re-render of the page on every load.) */}
        <style>{`
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
    </AdminCountsProvider>
  );
}
