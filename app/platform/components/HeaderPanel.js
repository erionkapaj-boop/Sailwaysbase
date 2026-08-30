"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { colors, radius, shadow, button, fontSans } from "../../../lib/platform/theme";

// Shared dropdown shell for the header's icon buttons.
//
// Positioned fixed against the viewport rather than absolutely against the
// button: anchoring to the button meant the panel grew leftwards from
// wherever that button happened to sit, and on a phone that pushed most of
// it off the left edge of the screen. The viewport is the only frame that
// reliably knows where the screen ends.
export default function HeaderPanel({ icon, count = 0, ariaLabel, title, action, children, onOpen }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={count > 0 ? `${ariaLabel} (${count})` : ariaLabel}
        style={{
          position: "relative",
          display: "flex",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 9,
          color: colors.ink,
        }}
      >
        {icon}
        {count > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 3,
              right: 3,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: "50%",
              background: colors.danger,
              color: "#fff",
              fontSize: 10,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* Portalled onto <body>: this button lives inside the nav bar, and the
          nav bar's backdropFilter (the header's glass blur) makes it a
          containing block for any `position: fixed` descendant per spec —
          so a panel rendered in place here would end up pinned to the nav
          bar's own strip instead of the viewport, and a tap anywhere on the
          actual page below the header would never reach the backdrop. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
            <div
              style={{
                position: "fixed",
                top: 64,
                right: 12,
                left: "auto",
                width: "min(340px, calc(100vw - 24px))",
                maxHeight: "min(70vh, 520px)",
                overflowY: "auto",
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                boxShadow: shadow.raised,
                zIndex: 40,
                fontFamily: fontSans,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 14px",
                  borderBottom: `1px solid ${colors.border}`,
                  position: "sticky",
                  top: 0,
                  background: colors.card,
                }}
              >
                <b style={{ fontSize: 14 }}>{title}</b>
                {action && (
                  <button
                    type="button"
                    disabled={action.busy}
                    onClick={action.onClick}
                    style={{ ...button("secondary"), padding: "4px 10px", fontSize: 12 }}
                  >
                    {action.label}
                  </button>
                )}
              </div>
              {/* Children get a closer so a tapped row can dismiss the panel. */}
              {typeof children === "function" ? children(() => setOpen(false)) : children}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
