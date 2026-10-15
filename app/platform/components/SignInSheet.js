"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import GoogleButton from "./GoogleButton";
import { signInWithGoogle } from "../../../lib/platform/db";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { colors, shadow, fontSans, muted } from "../../../lib/platform/theme";

// "One more step": the only moment a client is asked for an account (to send the request / buy credits).
// One Google button, no forms, no codes. beforeRedirect() saves the request so it is restored exactly as it was
// after Google returns; next is where to land.
export default function SignInSheet({ open, onClose, beforeRedirect, next }) {
  const t = useTranslations("SignInSheet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;

  async function go() {
    setBusy(true);
    setError("");
    try {
      await beforeRedirect?.();
      await signInWithGoogle({ as: "client", next });
    } catch (err) {
      setBusy(false);
      setError(friendlyError(err));
    }
  }

  return createPortal(
    <div
      data-signin-sheet-backdrop
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,40,60,0.38)", zIndex: 80, display: "flex", justifyContent: "center", alignItems: "flex-end" }}
    >
      <style dangerouslySetInnerHTML={{ __html: "@keyframes sf-sheet-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@media(prefers-reduced-motion:reduce){[data-signin-sheet]{animation:none!important}}[data-signin-sheet]{border-radius:18px 18px 0 0}@media(min-width:640px){[data-signin-sheet-backdrop]{align-items:center!important}[data-signin-sheet]{border-radius:18px;margin:24px}}" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        data-signin-sheet
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420, boxSizing: "border-box", background: colors.card, fontFamily: fontSans,
          boxShadow: shadow.raised,
          padding: "22px 20px calc(20px + env(safe-area-inset-bottom))", animation: "sf-sheet-up 240ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
        }}
      >
        <div style={{ fontSize: 19, fontWeight: 600, color: colors.ink }}>{t("title")}</div>
        <p style={{ ...muted, fontSize: 14.5, margin: "6px 0 18px", lineHeight: 1.5 }}>{t("note")}</p>
        <GoogleButton onClick={go} busy={busy} data-signin-google />
        {error && <p role="alert" style={{ color: colors.danger, fontSize: 13.5, margin: "12px 0 0" }}>{error}</p>}
      </div>
    </div>,
    document.body
  );
}
