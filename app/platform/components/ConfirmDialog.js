"use client";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colors, radius, shadow, button, fontSans } from "../../../lib/platform/theme";

// Replaces window.confirm() everywhere in the platform: a native browser
// dialog announces its own hostname and renders with whatever chrome the
// device happens to ship, which reads as dated and out of place inside
// something meant to feel like a real app. This is the same "are you sure"
// gate, just drawn in the platform's own voice.
//
// Usage: const [confirm, confirmDialog] = useConfirm(); somewhere render
// {confirmDialog}; then `if (!(await confirm("..."))) return;` exactly where
// `if (!confirm("..."))` used to be — the calling code barely changes.
export function useConfirm() {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ message, ...options });
    });
  }, []);

  function settle(result) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }

  const dialog =
    state && typeof document !== "undefined"
      ? createPortal(
          <div
            onClick={() => settle(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(22,40,60,0.45)",
              zIndex: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: colors.card,
                borderRadius: radius.lg,
                boxShadow: shadow.raised,
                padding: 22,
                maxWidth: 340,
                width: "100%",
                fontFamily: fontSans,
              }}
            >
              <p style={{ fontSize: 15, color: colors.ink, margin: "0 0 20px", lineHeight: 1.5 }}>{state.message}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => settle(false)} style={button("secondary")}>
                  {state.cancelLabel || "Άκυρο"}
                </button>
                <button type="button" onClick={() => settle(true)} style={button(state.tone || "danger")}>
                  {state.confirmLabel || "Συνέχεια"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return [confirm, dialog];
}
