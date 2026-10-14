"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Icon from "./Icon";
import { useAuth } from "../AuthContext";
import { colors, fontSans } from "../../../lib/platform/theme";

// Κάτω μπάρα πλοήγησης (κινητό, ≤860px): τέσσερις σταθερές ενότητες, πάντα στην
// ίδια θέση. Συνδεδεμένος: Αρχική, Αιτήματα, Κρατήσεις, Προφίλ. Επισκέπτης: τα
// ίδια τέσσερα σημεία εισόδου (Αρχική, Αγγελίες, Επικοινωνία, Σύνδεση), μόνο
// στις εσωτερικές σελίδες — η αρχική του επισκέπτη μένει όπως είναι.
// Στις οθόνες εστίασης (οδηγός αίτησης, πληρωμή, είσοδος) δεν εμφανίζεται, ώστε
// να μη συναγωνίζεται την κύρια ενέργεια. Η μπάρα ορίζει το --sf-bnav (ύψος),
// που οι σταθερές μπάρες των σελίδων προσθέτουν στο bottom τους.
const FOCUS_PREFIXES = [
  "/platform/search",
  "/platform/delivery",
  "/platform/login",
  "/platform/register",
  "/platform/set-pin",
  "/platform/forgot-pin",
  "/platform/board/new",
];

function isActive(pathname, href) {
  if (href === "/platform") return pathname === "/platform" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function useBottomNavVisible() {
  const { session, isAdmin, userRow } = useAuth();
  const pathname = usePathname() || "/";
  if (pathname.startsWith("/platform/admin")) return false;
  if (FOCUS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  if (session) return !isAdmin;
  void userRow;
  return !(pathname === "/platform" || pathname === "/");
}

export default function BottomNav() {
  const t = useTranslations("Nav");
  const { session, notifications } = useAuth();
  const pathname = usePathname() || "/";
  const visible = useBottomNavVisible();

  useEffect(() => {
    if (!visible) return;
    document.documentElement.setAttribute("data-sf-bnav", "");
    return () => document.documentElement.removeAttribute("data-sf-bnav");
  }, [visible]);

  if (!visible) return null;

  const tabs = session
    ? [
        { href: "/platform", icon: "home", fill: "homeFill", label: t("tabHome") },
        { href: "/platform/requests", icon: "inbox", fill: "inboxFill", label: t("tabRequests"), badge: notifications?.pendingRequests ?? 0 },
        { href: "/platform/bookings", icon: "calCheck", fill: "calCheckFill", label: t("tabBookings") },
        { href: "/platform/profile", icon: "user", fill: "userFill", label: t("tabProfile") },
      ]
    : [
        { href: "/platform", icon: "home", fill: "homeFill", label: t("tabHome") },
        { href: "/platform/board", icon: "list", fill: "list", label: t("tabBoard") },
        { href: "/platform/contact", icon: "chat", fill: "chat", label: t("tabContact") },
        { href: "/platform/login", icon: "login", fill: "login", label: t("login") },
      ];

  return (
    <nav aria-label={t("bottomNav")} className="sf-bnav">
      {tabs.map((x) => {
        const on = isActive(pathname, x.href);
        return (
          <Link key={x.href} href={x.href} aria-current={on ? "page" : undefined} className="sf-bnav-tab" style={{ color: on ? colors.ink : colors.inkSoft, fontFamily: fontSans }}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={on ? x.fill : x.icon} size={24} stroke={on ? 1.9 : 1.6} />
              {x.badge > 0 && <span className="sf-bnav-dot" aria-hidden="true" />}
            </span>
            <span style={{ fontWeight: on ? 600 : 400 }}>{x.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export const BOTTOM_NAV_CSS = `
.sf-bnav { display: none; }
@media (max-width: 860px) {
  html[data-sf-bnav] { --sf-bnav: calc(60px + env(safe-area-inset-bottom)); }
  html[data-sf-bnav] .platform-scope { padding-bottom: var(--sf-bnav); }
  .sf-bnav { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; box-sizing: border-box;
    height: calc(60px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom);
    background: rgba(252,251,249,0.96); backdrop-filter: blur(8px); border-top: 1px solid ${colors.border}; }
  .sf-bnav-tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    font-size: 11px; text-decoration: none; min-width: 0; }
  .sf-bnav-dot { position: absolute; top: -2px; right: -4px; width: 9px; height: 9px; border-radius: 50%; background: #A63A2E; border: 2px solid #FCFBF9; box-sizing: content-box; }
}
`;
