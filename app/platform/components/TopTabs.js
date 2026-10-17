"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Icon from "./Icon";
import { useAuth } from "../AuthContext";
import useActiveRole from "../useActiveRole";
import useTabCounts from "../useTabCounts";
import { navTabsFor, isTabActive } from "../../../lib/platform/navTabs";
import { colors, fontSans, radius } from "../../../lib/platform/theme";

// Οι ίδιες καρτέλες της κάτω μπάρας (lib/platform/navTabs.js), στην πάνω μπάρα του υπολογιστή (>860px). Στο κινητό δεν φαίνονται
// (εκεί είναι η κάτω μπάρα). Ο επισκέπτης έχει ήδη «Σύνδεση» στην κεφαλίδα και το τιμόνι προς την αρχική.
export default function TopTabs() {
  const t = useTranslations("Nav");
  const { session } = useAuth();
  const role = useActiveRole();
  const countFor = useTabCounts(role);
  const pathname = usePathname() || "/";
  if (!session) return null;
  const tabs = navTabsFor(role);
  // Πέντε καρτέλες (μενού Administrator) χωρούν δίπλα στο λογότυπο μόνο ως λέξεις· με λιγότερες, εικονίδιο και λέξη.
  const icons = tabs.length <= 4;

  return (
    <nav aria-label={t("topNav")} className="sf-hide-narrow sf-toptabs" data-toptabs-role={role} style={{ alignItems: "center", gap: 2, marginLeft: 6 }}>
      <style dangerouslySetInnerHTML={{ __html: `.sf-toptab:hover{background:${colors.seaGlass}}.sf-toptab:focus-visible{outline:2px solid ${colors.ink};outline-offset:2px}` }} />
      {tabs.map((x) => {
        const on = isTabActive(pathname, x);
        const count = countFor(x);
        return (
          <Link
            key={x.key}
            href={x.href}
            data-toptab={x.key}
            aria-current={on ? "page" : undefined}
            className="sf-toptab"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 44, padding: icons ? "0 12px" : "0 13px", borderRadius: radius.pill, textDecoration: "none", fontFamily: fontSans, fontSize: 14.5, whiteSpace: "nowrap", color: on ? colors.ink : colors.inkSoft, fontWeight: on ? 600 : 400, background: on ? colors.seaGlass : "transparent" }}
          >
            {icons && <Icon name={on && x.fill ? x.fill : x.icon} size={19} stroke={on ? 1.9 : 1.6} />}
            <span style={{ position: "relative", display: "inline-flex" }}>
              {t(x.label)}
              {count > 0 && <span data-toptab-dot aria-hidden="true" style={{ position: "absolute", top: -2, right: -9, width: 7, height: 7, borderRadius: "50%", background: "#A63A2E" }} />}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
