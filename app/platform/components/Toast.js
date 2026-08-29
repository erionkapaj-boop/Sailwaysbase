"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { colors, radius, shadow } from "../../../lib/platform/theme";

// A brief, plain confirmation that something already happened — not an
// explanation offered in advance, just a fact stated after it's true.
// Dismisses itself; nothing to click. Lives wherever the caller's state does
// (usually a page-level component, not an individual list row/card, since a
// row can unmount the moment its own action moves it to a different list).
export default function Toast({ message, onDismiss, durationMs = 3200 }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onDismiss?.(), durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 28,
        transform: "translateX(-50%)",
        background: colors.ink,
        color: "#fff",
        padding: "12px 20px",
        borderRadius: radius.pill,
        boxShadow: shadow.raised,
        fontSize: 14,
        zIndex: 70,
        whiteSpace: "nowrap",
        animation: "sf-toast-in 0.25s ease",
      }}
    >
      {message}
    </div>,
    document.body
  );
}
