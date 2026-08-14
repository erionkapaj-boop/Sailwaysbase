"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listMyNotifications, markNotificationsRead } from "../../../lib/platform/db";
import { describeNotification, timeAgo } from "../../../lib/platform/notifications";
import { colors, radius, shadow, muted, button, fontSans } from "../../../lib/platform/theme";

const BellIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 14.5 18 8Z" />
    <path d="M13.6 20.5a1.8 1.8 0 0 1-3.2 0" />
  </svg>
);

export default function NotificationPanel({ count = 0, onRead }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  // Fetched on open, not on mount: the badge already answers "is there
  // anything?", and most page loads never open the panel at all.
  useEffect(() => {
    if (!open) return;
    setBusy(true);
    listMyNotifications()
      .then(setItems)
      .catch(() => {})
      .finally(() => setBusy(false));
  }, [open]);

  async function handleOpenItem(n) {
    setOpen(false);
    if (!n.read_at) {
      await markNotificationsRead([n.id]).catch(() => {});
      onRead?.();
    }
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    setBusy(true);
    try {
      await markNotificationsRead(null);
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      onRead?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? `Ειδοποιήσεις (${count})` : "Ειδοποιήσεις"}
        style={{
          position: "relative",
          display: "flex",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 6px",
          color: colors.ink,
        }}
      >
        {BellIcon}
        {count > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -1,
              right: -1,
              minWidth: 14,
              height: 14,
              padding: "0 3px",
              borderRadius: "50%",
              background: colors.danger,
              color: "#fff",
              fontSize: 9,
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

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              width: "min(330px, calc(100vw - 32px))",
              maxHeight: "70vh",
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
                padding: "12px 14px",
                borderBottom: `1px solid ${colors.border}`,
                position: "sticky",
                top: 0,
                background: colors.card,
              }}
            >
              <b style={{ fontSize: 14 }}>Ειδοποιήσεις</b>
              {count > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={markAll}
                  style={{ ...button("secondary"), padding: "4px 10px", fontSize: 12 }}
                >
                  Όλα ως διαβασμένα
                </button>
              )}
            </div>

            {busy && items.length === 0 && <p style={{ ...muted, padding: 14, margin: 0 }}>Φόρτωση…</p>}
            {!busy && items.length === 0 && (
              <p style={{ ...muted, padding: 14, margin: 0 }}>Καμία ειδοποίηση ακόμα.</p>
            )}

            {items.map((n) => {
              const { title, body, urgent } = describeNotification(n);
              const unread = !n.read_at;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleOpenItem(n)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    border: "none",
                    borderBottom: `1px solid ${colors.border}`,
                    // Unread carries a faint tint rather than bold-everything,
                    // so a long list still reads as one list.
                    background: unread ? colors.seaGlass : "transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {unread && (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: urgent ? colors.danger : colors.accent,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{ fontSize: 14, fontWeight: unread ? 600 : 400, color: colors.ink }}>{title}</span>
                  </span>
                  {body && <span style={{ ...muted, fontSize: 13, display: "block", marginTop: 2 }}>{body}</span>}
                  <span style={{ ...muted, fontSize: 11, display: "block", marginTop: 3 }}>
                    {timeAgo(n.created_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
