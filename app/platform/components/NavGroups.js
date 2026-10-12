"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Collapse from "./Collapse";
import { colors, fontSans, radius } from "../../../lib/platform/theme";

// Η λίστα του μενού, ΜΙΑ για όλες τις θέσεις: μέσα στο συρτάρι του κινητού (AccountMenu) και
// στο μόνιμο αριστερό μενού του υπολογιστή (SideNav). Έτσι δεν μπορούν να ξεχωρίσουν, να
// δείχνουν διαφορετικά πράγματα ή να στέκονται το ένα πάνω στο άλλο.
//
// `items`: απλές εγγραφές, με `group: true` (διαχωριστική γραμμή) και `heading: "κείμενο"` (ο
// τίτλος μιας ομάδας). Οι ομάδες λειτουργούν σαν ακορντεόν: ανοιχτή είναι ΜΙΑ τη φορά, αυτή που
// έχει τη σελίδα που βλέπεις (αλλιώς η πρώτη). Πατώντας άλλο τίτλο ανοίγει εκείνη και κλείνει η
// προηγούμενη· πατώντας τον ανοιχτό τίτλο κλείνει. Μια κλειστή ομάδα δείχνει τον αριθμό όσων περιμένουν.
// `onNavigate`: τι να γίνει όταν πατηθεί σύνδεσμος (το συρτάρι κλείνει).
const itemStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  fontFamily: fontSans,
  fontSize: 15,
  color: colors.ink,
  textDecoration: "none",
  borderRadius: radius.sm,
  transition: "background 0.18s ease, font-weight 0.18s ease",
};

export function Badge({ n }) {
  return (
    <span
      style={{
        minWidth: 20,
        height: 20,
        padding: "0 6px",
        borderRadius: 10,
        background: colors.warn,
        color: "#fff",
        fontFamily: fontSans,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

export default function NavGroups({ items = [], activeHref, onNavigate }) {
  const isActive = (it) => activeHref && (it.prefix ? activeHref.startsWith(it.href) : activeHref === it.href);

  const groups = [];
  for (const it of items) {
    if (it.heading || groups.length === 0) groups.push({ heading: it.heading || null, items: [] });
    groups[groups.length - 1].items.push(it);
  }
  const headed = groups.filter((g) => g.heading);
  const activeGroup = headed.find((g) => g.items.some(isActive))?.heading;
  const [openHeading, setOpenHeading] = useState(activeGroup ?? headed[0]?.heading ?? null);
  // Σε σελίδα που ανήκει σε ομάδα, ανοίγει αυτή· σε σελίδα εκτός μενού (π.χ. καρτέλα χρήστη) μένει όπως ήταν.
  useEffect(() => {
    if (activeGroup) setOpenHeading(activeGroup);
  }, [activeGroup]);

  return (
    <>
      {groups.map((g) => {
        const isOpen = !g.heading || openHeading === g.heading;
        const waiting = g.items.reduce((n, it) => n + (it.badge > 0 ? it.badge : 0), 0);
        return (
          <div key={g.heading || "_top"} style={{ borderTop: g.heading ? `1px solid ${colors.border}` : undefined, marginTop: g.heading ? 6 : 0 }}>
            {g.heading && (
              <button
                type="button"
                className="sf-nav-heading"
                onClick={() => setOpenHeading((h) => (h === g.heading ? null : g.heading))}
                aria-expanded={isOpen}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {g.heading}
                  {!isOpen && waiting > 0 && <Badge n={waiting} />}
                </span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="sf-nav-chevron" data-open={isOpen}>
                  <path d="M3 1.5l3.5 3.5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <Collapse open={isOpen}>
              {g.items.map((it, i) => {
                const active = isActive(it);
                const divider = !g.heading && it.group && i > 0;
                return (
                  <div key={it.href} style={divider ? { marginTop: 10, paddingTop: 6, borderTop: `1px solid ${colors.border}` } : undefined}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      className="sf-nav-link"
                      aria-current={active ? "page" : undefined}
                      style={{
                        ...itemStyle,
                        padding: g.heading ? "10px 18px" : "14px 18px",
                        background: active ? colors.seaGlass : undefined,
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      <span>{it.label}</span>
                      {it.badge > 0 && <Badge n={it.badge} />}
                    </Link>
                  </div>
                );
              })}
            </Collapse>
          </div>
        );
      })}
    </>
  );
}

// Κοινό CSS του μενού (τίτλοι ομάδων, βελάκι, επαφή με το ποντίκι). Μπαίνει μία φορά, στο PlatformShell.
export const NAV_CSS = `
.sf-nav-heading { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 18px 6px;
  border: 0; background: none; cursor: pointer; font-family: ${fontSans}; font-size: 11.5px; font-weight: 600; letter-spacing: 0.05em;
  text-transform: uppercase; color: ${colors.inkSoft}; transition: color .18s ease; }
.sf-nav-heading:hover { color: ${colors.ink}; }
.sf-nav-heading:focus-visible, .sf-nav-link:focus-visible { outline: 2px solid ${colors.ink}; outline-offset: -2px; }
.sf-nav-chevron { transition: transform .26s cubic-bezier(0.22, 1, 0.36, 1); }
.sf-nav-chevron[data-open="true"] { transform: rotate(90deg); }
.sf-nav-link:hover { background: ${colors.seaGlass}; }
`;
