"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Icon from "./Icon";
import { useAuth } from "../AuthContext";
import useActiveRole from "../useActiveRole";
import { navTabsFor, isTabActive } from "../../../lib/platform/navTabs";
import { colors, fontSans } from "../../../lib/platform/theme";

// Κάτω μπάρα πλοήγησης (κινητό, ≤860px): τα ΔΙΚΑ ΜΟΥ πράγματα στον τρέχοντα ρόλο (lib/platform/navTabs.js, βήμα 4). Οι τελείες της
// κεφαλίδας έχουν τις κοινές εφαρμογές· δεν ανακατεύονται. Αλλάζει αμέσως όταν αλλάζει ο ρόλος. Στον υπολογιστή οι ίδιες καρτέλες
// μπαίνουν στην πάνω μπάρα (TopTabs). Επισκέπτης: Αρχική, Σύνδεση, μόνο στις εσωτερικές σελίδες — η αρχική του επισκέπτη μένει όπως είναι.
// Στις οθόνες εστίασης (οδηγός αίτησης, πληρωμή, είσοδος) δεν εμφανίζεται, ώστε
// να μη συναγωνίζεται την κύρια ενέργεια. Η μπάρα ορίζει το --sf-bnav (ύψος), που οι σταθερές μπάρες των σελίδων προσθέτουν στο bottom τους.
const FOCUS_PREFIXES = [
  "/platform/search",
  "/platform/delivery",
  "/platform/login",
  "/platform/register",
  "/platform/set-pin",
  "/platform/forgot-pin",
  "/platform/board/new",
];

export function useBottomNavVisible() {
  const { session, userRow } = useAuth();
  const pathname = usePathname() || "/";
  // Η κονσόλα διαχείρισης δεν έχει πια δικό της μενού: ο Administrator κινείται με τις καρτέλες του (Αρχική, Προφίλ), όπως κάθε ρόλος.
  if (pathname === "/platform/admin/login") return false;
  if (FOCUS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  if (session) return true;
  void userRow;
  return !(pathname === "/platform" || pathname === "/");
}

export default function BottomNav() {
  const t = useTranslations("Nav");
  const { notifications } = useAuth();
  const role = useActiveRole();
  const pathname = usePathname() || "/";
  const visible = useBottomNavVisible();

  useEffect(() => {
    if (!visible) return;
    document.documentElement.setAttribute("data-sf-bnav", "");
    return () => document.documentElement.removeAttribute("data-sf-bnav");
  }, [visible]);

  if (!visible) return null;

  const tabs = navTabsFor(role);

  return (
    <nav aria-label={t("bottomNav")} className="sf-bnav" data-bnav-role={role}>
      {tabs.map((x) => {
        const on = isTabActive(pathname, x);
        const count = x.badge === "requests" ? notifications?.pendingRequests ?? 0 : 0;
        return (
          <Link key={x.key} href={x.href} data-bnav-tab={x.key} aria-current={on ? "page" : undefined} className="sf-bnav-tab" style={{ color: on ? colors.ink : colors.inkSoft, fontFamily: fontSans }}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={on && x.fill ? x.fill : x.icon} size={24} stroke={on ? 1.9 : 1.6} />
              {count > 0 && <span className="sf-bnav-dot" aria-hidden="true" />}
            </span>
            <span style={{ fontWeight: on ? 600 : 400 }}>{t(x.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export const BOTTOM_NAV_CSS = `
.sf-bnav { display: none; }
.sf-hide-narrow { display: none !important; }
@media (min-width: 861px) { .sf-hide-narrow { display: flex !important; } }
@media (max-width: 860px) {
  html[data-sf-bnav] { --sf-bnav: calc(60px + env(safe-area-inset-bottom)); }
  html[data-sf-bnav] .platform-scope { padding-bottom: var(--sf-bnav); }
  .sf-bnav { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; box-sizing: border-box;
    height: calc(60px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom);
    background: rgba(252,251,249,0.96); backdrop-filter: blur(8px); border-top: 1px solid ${colors.border}; }
  .sf-bnav-tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    font-size: 11px; text-decoration: none; min-width: 0; transition: color .2s ease; }
  .sf-bnav-tab svg { transition: transform .2s ease; }
  .sf-bnav-tab[aria-current] svg { transform: translateY(-1px); }
  .sf-bnav-dot { position: absolute; top: -2px; right: -4px; width: 9px; height: 9px; border-radius: 50%; background: #A63A2E; border: 2px solid #FCFBF9; box-sizing: content-box; }
}
`;
