"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { colors, radius, shadow, fontSans } from "../../../../lib/platform/theme";

// Κάτω φύλλο της Community (κάρτα σημείου, φόρμα, αναφορά). Κινητό: από κάτω· υπολογιστής: στενό, στο κέντρο.
// Κλείνει με Esc, με πάτημα έξω και με το κουμπί του περιεχομένου.
export default function Sheet({ label, onClose, children, testId }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-community-sheet-backdrop
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,40,60,0.38)", zIndex: 80, display: "flex", justifyContent: "center", alignItems: "flex-end" }}
    >
      <style dangerouslySetInnerHTML={{ __html: "@keyframes sf-csheet{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@media(prefers-reduced-motion:reduce){[data-community-sheet]{animation:none!important}}" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-community-sheet={testId || "sheet"}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, maxHeight: "90dvh", overflowY: "auto", boxSizing: "border-box", background: colors.card, fontFamily: fontSans,
          borderRadius: `${radius.lg + 4}px ${radius.lg + 4}px 0 0`, boxShadow: shadow.raised,
          padding: "20px 20px calc(20px + env(safe-area-inset-bottom))", animation: "sf-csheet 240ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
