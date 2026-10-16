"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Icon from "./Icon";
import { card, colors, shadow, tapTarget } from "../../../lib/platform/theme";

// Το μενού με τις εννέα τελείες (όπως των Google): πλέγμα 3×2 εφαρμογών (απόφαση ιδιοκτήτη 16/10/2026).
// Οι ονομασίες είναι σταθερές και ίδιες σε κάθε γλώσσα. Μία λειτουργία = ένα τετράγωνο, χωρίς διπλά.
//   Jobs → ανοιχτά αιτήματα · Delivery → μεταφορά σκάφους · Nearby → ο υπάρχων χάρτης (ανοιχτών αιτημάτων)
//   WindNow, Community, Explore → προσωρινές οθόνες «Σύντομα».
const ITEMS = [
  { href: "/platform/board", key: "jobs", icon: "brief" },
  { href: "/platform/delivery", key: "delivery", icon: "route" },
  { href: "/platform/windnow", key: "windnow", icon: "wind" },
  { href: "/platform/community", key: "community", icon: "users" },
  { href: "/platform/board?map=1", key: "nearby", icon: "map" },
  { href: "/platform/explore", key: "explore", icon: "compass" },
];

export default function HomeAppsMenu() {
  const t = useTranslations("Home");
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => root.current && !root.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} style={{ position: "relative", textAlign: "left" }}>
      <button
        type="button"
        aria-label={t("appsMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ ...tapTarget, justifyContent: "center", width: 44, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill={colors.inkSoft}>
          {[2.5, 10, 17.5].flatMap((x) => [2.5, 10, 17.5].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />))}
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          data-apps-grid
          style={{ ...card, position: "absolute", top: 50, left: 0, zIndex: 60, width: 292, boxSizing: "border-box", padding: "14px 10px 8px", marginBottom: 0, boxShadow: shadow.raised, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 4px" }}
        >
          <style dangerouslySetInnerHTML={{ __html: ".sf-app-tile:hover .sf-app-ico,.sf-app-tile:focus-visible .sf-app-ico{background:#E6ECEA}.sf-app-tile:focus-visible{outline:2px solid " + colors.ink + ";outline-offset:2px}" }} />
          {ITEMS.map((it) => (
            <Link
              key={it.key}
              role="menuitem"
              href={it.href}
              className="sf-app-tile"
              data-app={it.key}
              onClick={() => setOpen(false)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "4px 2px 8px", textDecoration: "none", color: colors.ink, fontSize: 13, fontWeight: 500, borderRadius: 14, minWidth: 0 }}
            >
              <span className="sf-app-ico" style={{ width: 64, height: 64, borderRadius: 18, background: colors.seaGlass, display: "flex", alignItems: "center", justifyContent: "center", color: colors.ink, transition: "background-color 140ms" }}>
                <Icon name={it.icon} size={28} stroke={1.5} />
              </span>
              <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t(`apps.${it.key}`)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
