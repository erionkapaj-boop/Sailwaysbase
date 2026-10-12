"use client";
import { usePathname } from "next/navigation";
import { AdminCountsProvider } from "./AdminShell";

// Shared across every /platform/admin/* route so the counts fetch (badge
// numbers on the overview, the menu) happens once per section change and
// survives navigation.
//
// Navigation is NOT here: it is the site's one menu (PlatformShell.js), the hamburger
// drawer on a phone and the permanent side menu (SideNav) on a wide screen, the same
// list in both, on every page. Two menus on the same screen, one over the other, is
// what this file used to cause. The page fades in softly on every move.
// /login isn't part of the authenticated console, so it opts out.
const CSS = `
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
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {isRecord ? (
        <div key={pathname} className="sf-admin-page">
          {children}
        </div>
      ) : (
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 64px" }}>
          <div key={pathname} className="sf-admin-page">
            {children}
          </div>
        </div>
      )}
    </AdminCountsProvider>
  );
}
