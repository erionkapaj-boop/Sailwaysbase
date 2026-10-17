"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Icon from "./Icon";
import { useAuth } from "../AuthContext";
import useActiveRole from "../useActiveRole";
import { navTabsFor, isTabActive } from "../../../lib/platform/navTabs";
import { colors, fontSans, radius } from "../../../lib/platform/theme";

// Οι ίδιες καρτέλες της κάτω μπάρας (lib/platform/navTabs.js), στην πάνω μπάρα του υπολογιστή (>860px). Στο κινητό δεν φαίνονται
// (εκεί είναι η κάτω μπάρα). Ο επισκέπτης έχει ήδη «Σύνδεση» στην κεφαλίδα και το τιμόνι προς την αρχική.
export default function TopTabs() {
  const t = useTranslations("Nav");
  const { session, notifications } = useAuth();
  const role = useActiveRole();
  const pathname = usePathname() || "/";
  if (!session) return null;
  const tabs = navTabsFor(role);

  return (
    <nav aria-label={t("topNav")} className="sf-hide-narrow sf-toptabs" data-toptabs-role={role} style={{ alignItems: "center", gap: 2, marginLeft: 6 }}>
      <style dangerouslySetInnerHTML={{ __html: `.sf-toptab:hover{background:${colors.seaGlass}}.sf-toptab:focus-visible{outline:2px solid ${colors.ink};outline-offset:2px}` }} />
      {tabs.map((x) => {
        const on = isTabActive(pathname, x);
        const count = x.badge === "requests" ? notifications?.pendingRequests ?? 0 : 0;
        return (
          <Link
            key={x.key}
            href={x.href}
            data-toptab={x.key}
            aria-current={on ? "page" : undefined}
            className="sf-toptab"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 44, padding: "0 12px", borderRadius: radius.pill, textDecoration: "none", fontFamily: fontSans, fontSize: 14.5, whiteSpace: "nowrap", color: on ? colors.ink : colors.inkSoft, fontWeight: on ? 600 : 400, background: on ? colors.seaGlass : "transparent" }}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={on && x.fill ? x.fill : x.icon} size={19} stroke={on ? 1.9 : 1.6} />
              {count > 0 && <span aria-hidden="true" style={{ position: "absolute", top: -3, right: -4, width: 8, height: 8, borderRadius: "50%", background: "#A63A2E", border: "2px solid #FCFBF9", boxSizing: "content-box" }} />}
            </span>
            {t(x.label)}
          </Link>
        );
      })}
    </nav>
  );
}
