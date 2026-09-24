"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { colors, fontSans, shadow, radius } from "../../../lib/platform/theme";

const DRAWER_WIDTH = 280;

const itemStyle = {
  display: "block",
  padding: "14px 18px",
  fontSize: 15,
  fontFamily: fontSans,
  color: colors.ink,
  textDecoration: "none",
};

// A slide-in drawer, not a dropdown box floating next to the icon — the
// familiar shape people already know from every other app's hamburger menu,
// instead of a small rectangle appearing at an arbitrary point on the page.
//
// `activeHref` (optional) highlights the item matching the current page —
// exact match unless the item sets `prefix: true`, in which case anything
// starting with its href counts (an admin section's own sub-pages, e.g.
// /platform/admin/user/[id] under "Χρήστες"). `items` can mix plain entries
// with `group: true` (a bare divider above it) and `heading: "text"` (a
// small section label that starts a group) — one flat list then reads as
// several labelled groups, which fold so a long (admin) menu fits a phone.
function Badge({ n }) {
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

export default function AccountMenu({ items = [], onSignOut, activeHref }) {
  const [open, setOpen] = useState(false);

  const isActive = (it) =>
    activeHref && (it.prefix ? activeHref.startsWith(it.href) : activeHref === it.href);

  // Items that carry a `heading` start a group; with many groups (the admin
  // menu) the whole list no longer fits a phone screen, so groups fold.
  // Open by default: the first headed group (the one you came for) and
  // whichever holds the current page. A folded group still shows its count.
  const groups = [];
  for (const it of items) {
    if (it.heading || groups.length === 0) groups.push({ heading: it.heading || null, items: [] });
    groups[groups.length - 1].items.push(it);
  }
  const defaultOpen = () => {
    const o = {};
    const firstHeaded = groups.find((g) => g.heading);
    for (const g of groups) {
      if (!g.heading) continue;
      o[g.heading] = g === firstHeaded || g.items.some(isActive);
    }
    return o;
  };
  const [openGroups, setOpenGroups] = useState({});
  useEffect(() => {
    if (open) setOpenGroups(defaultOpen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Closeable the same way any drawer is: tap the dimmed backdrop, tap the
  // ✕, or press Escape. Body scroll is held still while it's open so the
  // page behind it doesn't drift under a swipe meant for the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Portalled straight onto <body>: the nav bar this button lives in has a
  // backdropFilter (the header's glass blur), and per spec that makes the
  // nav bar a containing block for any `position: fixed` descendant — so a
  // backdrop/drawer rendered in place here would end up pinned to the nav
  // bar's own ~64px strip instead of the viewport, and a tap anywhere below
  // the header would land on the real page instead of the backdrop. Portalling
  // out from under that ancestor is what makes "fixed" actually mean fixed.
  const drawer = open && typeof document !== "undefined"
    ? createPortal(
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(22,40,60,0.4)",
              zIndex: 59,
              animation: "sf-drawer-fade 0.18s ease",
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Μενού πλοήγησης"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: `min(${DRAWER_WIDTH}px, 82vw)`,
              background: colors.card,
              boxShadow: shadow.raised,
              zIndex: 60,
              display: "flex",
              flexDirection: "column",
              animation: "sf-drawer-slide 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
              <button
                type="button"
                aria-label="Κλείσιμο μενού"
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  color: colors.inkSoft,
                  padding: 8,
                  lineHeight: 1,
                  borderRadius: radius.sm,
                }}
              >
                ✕
              </button>
            </div>
            <nav style={{ display: "flex", flexDirection: "column", padding: "6px 10px 10px", overflowY: "auto", flex: 1 }}>
              {groups.map((g) => {
                const isOpen = !g.heading || openGroups[g.heading];
                const waiting = g.items.reduce((n, it) => n + (it.badge > 0 ? it.badge : 0), 0);
                return (
                  <div key={g.heading || "_top"} style={{ borderTop: g.heading ? `1px solid ${colors.border}` : undefined, marginTop: g.heading ? 6 : 0 }}>
                    {g.heading && (
                      <button
                        type="button"
                        onClick={() => setOpenGroups((o) => ({ ...o, [g.heading]: !o[g.heading] }))}
                        aria-expanded={isOpen}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "10px 18px 6px",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontFamily: fontSans,
                          fontSize: 11.5,
                          fontWeight: 600,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          color: colors.inkSoft,
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {g.heading}
                          {!isOpen && waiting > 0 && <Badge n={waiting} />}
                        </span>
                        <span aria-hidden="true" style={{ fontSize: 12, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                          ›
                        </span>
                      </button>
                    )}
                    {isOpen &&
                      g.items.map((it, i) => {
                        const active = isActive(it);
                        const divider = !g.heading && it.group && i > 0;
                        return (
                          <div
                            key={it.href}
                            style={divider ? { marginTop: 10, paddingTop: 6, borderTop: `1px solid ${colors.border}` } : undefined}
                          >
                          <Link
                            href={it.href}
                            onClick={() => setOpen(false)}
                            style={{
                              ...itemStyle,
                              padding: g.heading ? "10px 18px" : itemStyle.padding,
                              borderRadius: radius.sm,
                              background: active ? colors.seaGlass : undefined,
                              fontWeight: active ? 600 : 400,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <span>{it.label}</span>
                            {it.badge > 0 && <Badge n={it.badge} />}
                          </Link>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              style={{
                ...itemStyle,
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                borderTop: `1px solid ${colors.border}`,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Αποσύνδεση
            </button>
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <div>
      <button
        type="button"
        aria-label="Μενού"
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 8, fontSize: 24, lineHeight: 1, color: colors.ink }}
      >
        ≡
      </button>
      {drawer}
    </div>
  );
}
