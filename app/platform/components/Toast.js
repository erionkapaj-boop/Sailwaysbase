"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { colors, radius, shadow, fontSans } from "../../../lib/platform/theme";

// A brief, plain confirmation that something already happened — not an
// explanation offered in advance, just a fact stated after it's true.
// Dismisses itself; nothing to click. tone="fail" is the same for something
// that did NOT happen. Kept at the bottom of the screen, where the thumb and the eye
// already are, so it is seen whatever part of a long page the button was on.
export default function Toast({ message, onDismiss, durationMs = 3200, tone = "done" }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onDismiss?.(), durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message || typeof document === "undefined") return null;
  const fail = tone === "fail";

  return createPortal(
    <div
      role={fail ? "alert" : "status"}
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(var(--sf-bnav, 0px) + env(safe-area-inset-bottom, 0px) + 28px)",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "max-content",
        maxWidth: "min(calc(100vw - 32px), 420px)",
        boxSizing: "border-box",
        fontFamily: fontSans,
        background: fail ? colors.danger : colors.ink,
        color: "#fff",
        padding: "12px 20px",
        borderRadius: radius.pill,
        boxShadow: shadow.raised,
        fontSize: 14,
        lineHeight: 1.35,
        zIndex: 70,
        animation: "sf-toast-in 0.25s ease",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
        {fail ? (
          <>
            <circle cx="8" cy="8" r="6.25" stroke="#fff" strokeWidth="1.5" />
            <path d="M8 4.8v3.6M8 10.9v.1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </>
        ) : (
          <path d="M3.5 8.5l3 3 6-7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      <span>{message}</span>
    </div>,
    document.body
  );
}
