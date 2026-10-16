"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Icon from "./Icon";
import { colors, radius, shadow, fontSans, button } from "../../../lib/platform/theme";

// «Πώς λειτουργεί»: what SkipperFinder covers, for whoever needs crew and for whoever works at sea. Owner's rule: never
// the "how" (no steps, credits, mechanics, rationale); only what anyone should know. The details live in "In detail".
// Bottom sheet like the role "i" sheets; the full guide is one link away.
const GROUPS = [
  { key: "client", icon: "boat", items: ["client1", "client2", "client3", "client4"] },
  { key: "pro", icon: "helm", items: ["pro1", "pro2", "pro3"] },
];

export default function HowItWorksSheet({ open, onClose }) {
  const t = useTranslations("HowItWorks");
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div data-how-backdrop onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,40,60,0.38)", zIndex: 80, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes sf-sheet-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@media(prefers-reduced-motion:reduce){[data-how-sheet]{animation:none!important}}@media(min-width:640px){[data-how-backdrop]{align-items:center!important}[data-how-sheet]{border-radius:18px!important}}" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        data-how-sheet
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, boxSizing: "border-box", background: colors.card, fontFamily: fontSans,
          borderRadius: `${radius.lg + 4}px ${radius.lg + 4}px 0 0`, boxShadow: shadow.raised, maxHeight: "90vh", overflowY: "auto",
          padding: "24px 22px calc(20px + env(safe-area-inset-bottom))", animation: "sf-sheet-up 240ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 21, fontWeight: 600, color: colors.ink }}>{t("title")}</h2>
        <p style={{ margin: "0 0 22px", fontSize: 15, lineHeight: 1.55, color: colors.inkSoft }}>{t("lead")}</p>
        {GROUPS.map((g) => (
          <section key={g.key} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: colors.ink, marginBottom: 10 }}>
              <Icon name={g.icon} size={22} stroke={1.5} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t(`${g.key}Title`)}</h3>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {g.items.map((k) => (
                <li key={k} style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.5, color: colors.ink }}>
                  <span aria-hidden="true" style={{ color: colors.inkSoft, flexShrink: 0 }}>—</span>
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <Link href="/platform/about" onClick={onClose} style={{ fontSize: 14.5, color: colors.ink, textDecoration: "underline", textUnderlineOffset: 3, minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            {t("detail")}
          </Link>
          <button type="button" autoFocus onClick={onClose} style={{ ...button("secondary"), minHeight: 46, minWidth: 120 }}>
            {t("close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
