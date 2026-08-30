"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import HeaderPanel from "./HeaderPanel";
import { listMyNotifications, markNotificationsRead } from "../../../lib/platform/db";
import { describeNotification, timeAgo } from "../../../lib/platform/notifications";
import { colors, muted } from "../../../lib/platform/theme";

const BellIcon = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 14.5 18 8Z" />
    <path d="M13.6 20.5a1.8 1.8 0 0 1-3.2 0" />
  </svg>
);

export default function NotificationPanel({ count = 0, onRead }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  // Fetched on open, not on mount: the badge already answers "is there
  // anything?", and most page loads never open the panel at all.
  function load() {
    setBusy(true);
    listMyNotifications()
      .then(setItems)
      .catch(() => {})
      .finally(() => setBusy(false));
  }

  async function openItem(n, close) {
    close();
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
    <HeaderPanel
      icon={BellIcon}
      count={count}
      ariaLabel="Ειδοποιήσεις"
      title="Ειδοποιήσεις"
      onOpen={load}
      action={count > 0 ? { label: "Όλα ως διαβασμένα", onClick: markAll, busy } : null}
    >
      {(close) => (
        <>
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
                onClick={() => openItem(n, close)}
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
                        // Red only for the one someone else can take first.
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
        </>
      )}
    </HeaderPanel>
  );
}
