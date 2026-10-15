"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Icon, { ROLE_ICON } from "./Icon";
import { colors, radius, shadow, fontSans, button } from "../../../lib/platform/theme";

// Bottom sheet with what a crew role does. Opened by the small "i" on a role card;
// opening it never changes the selection.
export default function RoleInfoSheet({ role, label, onClose }) {
  const t = useTranslations("CrewSearchFlow");
  useEffect(() => {
    if (!role) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [role, onClose]);
  if (!role || typeof document === "undefined") return null;
  return createPortal(
    <div
      data-role-sheet-backdrop
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,40,60,0.38)", zIndex: 80, display: "flex", justifyContent: "center", alignItems: "flex-end" }}
    >
      <style dangerouslySetInnerHTML={{ __html: "@keyframes sf-sheet-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@media(prefers-reduced-motion:reduce){[data-role-sheet]{animation:none!important}}" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-role-sheet={role}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, boxSizing: "border-box", background: colors.card, fontFamily: fontSans,
          borderRadius: `${radius.lg + 4}px ${radius.lg + 4}px 0 0`, boxShadow: shadow.raised,
          padding: "22px 20px calc(20px + env(safe-area-inset-bottom))", animation: "sf-sheet-up 240ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, color: colors.ink }}>
          <Icon name={ROLE_ICON[role]} size={30} stroke={1.5} />
          <div style={{ fontSize: 18, fontWeight: 600 }}>{label}</div>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 15.5, lineHeight: 1.55, color: colors.ink }}>{t(`roleInfo_${role}`)}</p>
        <button type="button" autoFocus onClick={onClose} style={{ ...button("secondary"), width: "100%", minHeight: 46 }}>
          {t("roleInfoClose")}
        </button>
      </div>
    </div>,
    document.body
  );
}
