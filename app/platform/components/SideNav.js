"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import NavGroups from "./NavGroups";
import { colors, fontSans } from "../../../lib/platform/theme";

// Το μόνιμο αριστερό μενού του διαχειριστή στον υπολογιστή: ακριβώς η ίδια λίστα με το συρτάρι του
// κινητού (NavGroups), με «Ο λογαριασμός μου» και «Αποσύνδεση» κάτω-κάτω, και σε ΚΑΘΕ σελίδα, όχι
// μόνο σε αυτές της διαχείρισης. Σε στενή οθόνη δεν φαίνεται και δουλεύει το συρτάρι.
// Το πλάτος του (250px) το ξέρει και το PlatformShell, που μετακινεί το περιεχόμενο δεξιά του.
// Ξεκινά ακριβώς κάτω από την κεφαλίδα, όποιο ύψος κι αν έχει (π.χ. με τη λωρίδα «Βλέπεις ως» από πάνω).
export const SIDENAV_WIDTH = 250;
export const SIDENAV_MIN_SCREEN = 1100;

export const SIDENAV_CSS = `
.sf-sidenav { display: none; }
@media (min-width: ${SIDENAV_MIN_SCREEN}px) {
  .sf-sidenav { display: flex; flex-direction: column; position: fixed; top: 69px; bottom: 0; left: 0; width: ${SIDENAV_WIDTH}px;
    background: ${colors.bg || "#FCFBF9"}; border-right: 1px solid ${colors.border}; z-index: 5; box-sizing: border-box; }
  .sf-with-sidenav { margin-left: ${SIDENAV_WIDTH}px; }
  .sf-hide-wide { visibility: hidden; }
}
`;

export default function SideNav({ items, activeHref, onSignOut }) {
  const t = useTranslations("SideNav");
  const ref = useRef(null);
  useEffect(() => {
    const place = () => {
      const header = document.querySelector("[data-sf-header]");
      if (ref.current && header) ref.current.style.top = `${Math.max(0, header.getBoundingClientRect().bottom)}px`;
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      ro?.disconnect();
    };
  }, []);
  return (
    <aside ref={ref} className="sf-sidenav">
      <nav aria-label={t("menu")} style={{ flex: 1, overflowY: "auto", padding: "6px 10px 10px" }}>
        <NavGroups items={items} activeHref={activeHref} />
      </nav>
      <button
        type="button"
        onClick={onSignOut}
        style={{
          flexShrink: 0,
          width: "100%",
          textAlign: "left",
          padding: "14px 28px",
          background: "none",
          border: "none",
          borderTop: `1px solid ${colors.border}`,
          cursor: "pointer",
          fontFamily: fontSans,
          fontSize: 15,
          color: colors.ink,
        }}
      >
        {t("logout")}
      </button>
    </aside>
  );
}
