"use client";
import { usePathname } from "next/navigation";
import { AdminCountsProvider } from "./AdminShell";

// Shared across every /platform/admin/* route so the counts fetch (badge
// numbers on the overview, the menu) happens once per section change and
// survives navigation.
//
// Navigation: the site's one hamburger drawer (PlatformShell.js), on every screen
// size, with its groups folded. There used to be a second, permanent list of all
// sections on the left of wide screens; two menus at once, one of them always fully
// open and impossible to close, broke the calm of the rest of the app, so it went.
// /login isn't part of the authenticated console, so it opts out.
export default function AdminLayout({ children }) {
  const pathname = usePathname();
  if (pathname === "/platform/admin/login") return children;

  // /user/[id] is a focused record view with its own container.
  const isRecord = pathname.startsWith("/platform/admin/user/");

  return (
    <AdminCountsProvider>
      {isRecord ? (
        <div>{children}</div>
      ) : (
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 64px" }}>{children}</div>
      )}
    </AdminCountsProvider>
  );
}
