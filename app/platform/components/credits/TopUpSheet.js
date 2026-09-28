"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PackagePicker, { PurchaseSummary } from "./PackagePicker";
import { formatCredits } from "../../../../lib/platform/credits";
import { colors, radius, fontSans, button, shadow, muted } from "../../../../lib/platform/theme";

// Αγορά credits επιτόπου, χωρίς να φύγεις από εκεί που είσαι: όταν δεν
// φτάνουν για μια ενέργεια, ή όταν τελειώνουν. need: πόσα χρειάζονται τώρα.
export default function TopUpSheet({ open, onClose, need = 0, balance = 0 }) {
  const [sent, setSent] = useState(null);
  useEffect(() => {
    if (!open) setSent(null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;

  const short = need > balance;
  return createPortal(
    <div
      className="sf-topup-sheet"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22,40,60,0.38)",
        zIndex: 80,
        display: "flex",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `.sf-topup-sheet{align-items:flex-end}@media(min-width:640px){.sf-topup-sheet{align-items:center}}` }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Αγορά credits"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "92vh",
          overflowY: "auto",
          boxSizing: "border-box",
          background: colors.card,
          borderRadius: radius.lg + 4,
          boxShadow: shadow.raised,
          padding: "20px 18px 18px",
          fontFamily: fontSans,
          color: colors.ink,
        }}
      >
        {sent ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Το αίτημά σου καταχωρήθηκε</div>
            <PurchaseSummary row={sent} />
            <p style={{ ...muted, fontSize: 13.5, margin: "12px 0 16px", lineHeight: 1.55 }}>
              Τα credits πιστώνονται με την επιβεβαίωση της πληρωμής.
            </p>
            <button type="button" style={{ ...button("primary"), width: "100%" }} onClick={onClose}>
              Εντάξει
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{short ? "Δεν έχεις αρκετά credits" : "Αγορά credits"}</div>
                <div style={{ ...muted, fontSize: 13.5, marginTop: 4 }}>
                  {short
                    ? `Χρειάζεσαι ${formatCredits(need)} · διαθέσιμα ${formatCredits(balance)}`
                    : `Διαθέσιμα ${formatCredits(balance)}`}
                </div>
              </div>
              <button
                type="button"
                aria-label="Κλείσιμο"
                onClick={onClose}
                style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, cursor: "pointer", color: colors.inkSoft, minWidth: 40, minHeight: 40 }}
              >
                ×
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <PackagePicker need={need} onSent={setSent} />
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
