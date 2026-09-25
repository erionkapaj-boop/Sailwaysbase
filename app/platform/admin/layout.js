"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminCountsProvider, SECTIONS, badgeCount, useAdminCounts } from "./AdminShell";
import { colors, muted, radius } from "../../../lib/platform/theme";

// Shared across every /platform/admin/* route so the counts fetch (badge
// numbers on the overview, the menu) happens once per section change and
// survives navigation.
//
// On a phone, the site's one hamburger drawer (PlatformShell.js) carries the
// admin sections. On a wide screen the same list also stays open on the left
// — a drawer there meant an extra click for every move between sections.
// /login isn't part of the authenticated console, so it opts out.
function AdminSidebar() {
  const pathname = usePathname();
  const counts = useAdminCounts();
  return (
    <nav className="sf-admin-sidebar" aria-label="Διαχείριση">
      {SECTIONS.map((s) => {
        const active = s.exact ? pathname === s.href : pathname === s.href || pathname.startsWith(s.href + "/");
        const n = badgeCount(s.badge, counts);
        return (
          <div key={s.href}>
            {s.heading && <div className="sf-admin-sidebar-heading">{s.heading}</div>}
            <Link
              href={s.href}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: radius.md,
                fontSize: 14,
                textDecoration: "none",
                color: colors.ink,
                background: active ? colors.seaGlass : "transparent",
                fontWeight: active ? 600 : 400,
              }}
            >
              {s.label}
              {n > 0 && (
                <span
                  style={{
                    minWidth: 20,
                    padding: "1px 7px",
                    borderRadius: 999,
                    background: "#9A6B1F",
                    color: "#fff",
                    fontSize: 11.5,
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  {n}
                </span>
              )}
            </Link>
          </div>
        );
      })}
      <Link href="/platform" style={{ ...muted, display: "block", fontSize: 13, padding: "14px 12px 0" }}>
        ← Αρχική εφαρμογής
      </Link>
    </nav>
  );
}

const SIDEBAR_CSS = `
  .sf-admin-sidebar { display: none; }
  @media (min-width: 1100px) {
    .sf-admin-sidebar {
      display: block;
      position: fixed;
      top: 69px;
      bottom: 0;
      left: 0;
      width: 230px;
      overflow-y: auto;
      padding: 16px 12px 24px;
      border-right: 1px solid ${colors.border};
      background: ${colors.bg || "#FCFBF9"};
      z-index: 5;
      box-sizing: border-box;
    }
    .sf-admin-main { margin-left: 250px !important; }
  }
  .sf-admin-sidebar-heading {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${colors.inkSoft};
    padding: 14px 12px 4px;
  }
`;

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  if (pathname === "/platform/admin/login") return children;

  // /user/[id] is a focused record view with its own container.
  const isRecord = pathname.startsWith("/platform/admin/user/");

  return (
    <AdminCountsProvider>
      <style dangerouslySetInnerHTML={{ __html: SIDEBAR_CSS }} />
      <AdminSidebar />
      {isRecord ? (
        <div className="sf-admin-main">{children}</div>
      ) : (
        <div className="sf-admin-main" style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 64px" }}>
          {children}
        </div>
      )}
    </AdminCountsProvider>
  );
}
