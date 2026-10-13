"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { card, colors, shadow, tapTarget } from "../../../lib/platform/theme";

// Το μενού με τις εννέα τελείες της αρχικής (όπως των Google). Εδώ μπαίνουν οι
// είσοδοι που δεν είναι η κύρια ροή· η πρώτη είναι η μεταφορά σκάφους.
const ITEMS = [{ href: "/platform/delivery", key: "boatDelivery" }];

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
        <div role="menu" style={{ ...card, position: "absolute", top: 50, left: 0, zIndex: 60, minWidth: 240, padding: 6, marginBottom: 0, boxShadow: shadow.raised }}>
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              role="menuitem"
              href={it.href}
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", minHeight: 48, padding: "0 14px", textDecoration: "none", color: colors.ink, fontSize: 16, borderRadius: 10 }}
            >
              {t(it.key)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
