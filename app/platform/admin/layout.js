"use client";
import { usePathname } from "next/navigation";
import { AdminCountsProvider } from "./AdminShell";

// Shared across every /platform/admin/* route so the counts fetch (badge
// numbers on the overview + a couple of pages) happens once and survives
// navigation instead of being re-fetched on every route.
//
// Section navigation itself used to live here too — a second, horizontal
// strip of every admin page rendered below the site's own hamburger menu.
// It's gone; PlatformShell.js's one hamburger drawer now carries the full,
// grouped list of admin sections (see AdminShell.js's SECTIONS), so this
// layout has nothing left to render but the content column.
//
// Two routes opt out on purpose: /login isn't part of the authenticated
// console (nothing to gate, no counts to fetch), and /user/[id] is a focused
// record view reached via its own "← Πίσω στους χρήστες" link.
export default function AdminLayout({ children }) {
  const pathname = usePathname();
  if (pathname === "/platform/admin/login" || pathname.startsWith("/platform/admin/user/")) {
    return children;
  }

  return (
    <AdminCountsProvider>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 64px" }}>{children}</div>
    </AdminCountsProvider>
  );
}
