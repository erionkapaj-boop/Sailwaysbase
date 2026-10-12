"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../AuthContext";
import Collapse from "../components/Collapse";
import { AdminCountsProvider, SECTIONS, badgeCount, useAdminCounts } from "./AdminShell";
import { colors, fontSans, muted, radius } from "../../../lib/platform/theme";

// Shared across every /platform/admin/* route so the counts fetch (badge
// numbers on the overview, the menu) happens once per section change and
// survives navigation.
//
// On a phone, the site's one hamburger drawer (PlatformShell.js) carries the
// admin sections. On a wide screen the same list also stays on the left, the
// «κέντρο εργασιών»: only ONE group is open at a time, the one holding the page
// you are on; every other group shows just its title (and its waiting count).
// Pressing another title opens that group and folds the previous one. Opening and
// folding move softly (Collapse); the page itself fades in on every move.
// /login isn't part of the authenticated console, so it opts out.
const isActive = (s, pathname) => (s.exact ? pathname === s.href : pathname === s.href || pathname.startsWith(s.href + "/"));

function Badge({ n }) {
  return (
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
  );
}

function AdminSidebar() {
  const pathname = usePathname();
  const counts = useAdminCounts();
  const { isOwner } = useAuth();

  const groups = useMemo(() => {
    const out = [];
    for (const s of SECTIONS.filter((x) => isOwner || !x.ownerOnly)) {
      if (s.heading || out.length === 0) out.push({ heading: s.heading || "", items: [] });
      out[out.length - 1].items.push(s);
    }
    return out;
  }, [isOwner]);

  // Η ομάδα της σελίδας που βλέπεις. Σε σελίδα εκτός μενού (π.χ. καρτέλα χρήστη) μένει όπως ήταν.
  const current = groups.find((g) => g.items.some((s) => isActive(s, pathname)))?.heading;
  const [open, setOpen] = useState(current ?? groups[0]?.heading ?? "");
  useEffect(() => {
    if (current !== undefined) setOpen(current);
  }, [current]);

  return (
    <nav className="sf-admin-sidebar" aria-label="Διαχείριση">
      {groups.map((g) => {
        const isOpen = open === g.heading;
        const waiting = g.items.reduce((n, s) => n + badgeCount(s.badge, counts), 0);
        return (
          <div key={g.heading || "_top"}>
            <button
              type="button"
              className="sf-admin-sidebar-heading"
              aria-expanded={isOpen}
              onClick={() => setOpen((h) => (h === g.heading ? null : g.heading))}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {g.heading}
                {!isOpen && waiting > 0 && <Badge n={waiting} />}
              </span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="sf-admin-chevron" data-open={isOpen}>
                <path d="M3 1.5l3.5 3.5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <Collapse open={isOpen}>
              <div style={{ paddingBottom: 6 }}>
                {g.items.map((s) => {
                  const active = isActive(s, pathname);
                  const n = badgeCount(s.badge, counts);
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      className="sf-admin-sidebar-link"
                      data-active={active}
                      aria-current={active ? "page" : undefined}
                    >
                      {s.label}
                      {n > 0 && <Badge n={n} />}
                    </Link>
                  );
                })}
              </div>
            </Collapse>
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
      padding: 12px 12px 24px;
      border-right: 1px solid ${colors.border};
      background: ${colors.bg || "#FCFBF9"};
      z-index: 5;
      box-sizing: border-box;
    }
    .sf-admin-main { margin-left: 250px !important; }
  }
  .sf-admin-sidebar-heading {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 40px;
    padding: 8px 12px;
    border: 0;
    border-radius: ${radius.md}px;
    background: none;
    cursor: pointer;
    font-family: ${fontSans};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${colors.inkSoft};
    transition: background .18s ease, color .18s ease;
  }
  .sf-admin-sidebar-heading:hover { background: rgba(22,40,60,0.04); color: ${colors.ink}; }
  .sf-admin-sidebar-heading:focus-visible { outline: 2px solid ${colors.ink}; outline-offset: -2px; }
  .sf-admin-chevron { transition: transform .26s cubic-bezier(0.22, 1, 0.36, 1); }
  .sf-admin-chevron[data-open="true"] { transform: rotate(90deg); }
  .sf-admin-sidebar-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: ${radius.md}px;
    font-size: 14px;
    text-decoration: none;
    color: ${colors.ink};
    transition: background .18s ease, font-weight .18s ease;
  }
  .sf-admin-sidebar-link:hover { background: rgba(22,40,60,0.04); }
  .sf-admin-sidebar-link[data-active="true"] { background: ${colors.seaGlass}; font-weight: 600; }
  .sf-admin-sidebar-link:focus-visible { outline: 2px solid ${colors.ink}; outline-offset: -2px; }
  @keyframes sf-admin-page-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .sf-admin-page { animation: sf-admin-page-in .3s cubic-bezier(0.22, 1, 0.36, 1); }
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
        <div className="sf-admin-main">
          <div key={pathname} className="sf-admin-page">
            {children}
          </div>
        </div>
      ) : (
        <div className="sf-admin-main" style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 64px" }}>
          <div key={pathname} className="sf-admin-page">
            {children}
          </div>
        </div>
      )}
    </AdminCountsProvider>
  );
}
