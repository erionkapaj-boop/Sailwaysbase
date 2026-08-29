"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import HeaderPanel from "./HeaderPanel";
import { listMyConversations } from "../../../lib/platform/db";
import { timeAgo, formatDate } from "../../../lib/platform/notifications";
import { colors, muted, money } from "../../../lib/platform/theme";

const EnvelopeIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
  </svg>
);

// Opens a list of threads instead of navigating. Tapping the envelope used to
// go to the dashboard, which is normally the page you're already on — so it
// looked like the button did nothing at all.
//
// No basePath prop: an account that can be both a client and crew (the admin,
// since it can hold both) has some threads on each side, and a single fixed
// destination would send half of them to the wrong dashboard. Each row's
// as_client flag says which side that particular booking is on.
export default function MessagesPanel({ count = 0 }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  function load() {
    setBusy(true);
    listMyConversations()
      .then(setItems)
      .catch(() => {})
      .finally(() => setBusy(false));
  }

  return (
    <HeaderPanel icon={EnvelopeIcon} count={count} ariaLabel="Μηνύματα" title="Μηνύματα" onOpen={load}>
      {(close) => (
        <>
          {busy && items.length === 0 && <p style={{ ...muted, padding: 14, margin: 0 }}>Φόρτωση…</p>}
          {!busy && items.length === 0 && (
            <p style={{ ...muted, padding: 14, margin: 0 }}>Καμία συνομιλία ακόμα.</p>
          )}
          {items.map((c) => {
            const unread = (c.unread ?? 0) > 0;
            return (
              <button
                key={c.booking_id}
                type="button"
                onClick={() => {
                  close();
                  router.push(`${c.as_client ? "/platform/client/bookings" : "/platform/skipper/bookings"}?focus=${c.booking_id}`);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  border: "none",
                  borderBottom: `1px solid ${colors.border}`,
                  background: unread ? colors.seaGlass : "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: unread ? 600 : 400, color: colors.ink }}>
                    {c.port_name || "Κράτηση"}
                  </span>
                  {unread && (
                    <span
                      style={{
                        minWidth: 16,
                        height: 16,
                        borderRadius: 8,
                        padding: "0 4px",
                        background: colors.danger,
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {c.unread}
                    </span>
                  )}
                </span>
                <span style={{ ...muted, fontSize: 12, display: "block", marginTop: 2 }}>
                  <span style={money}>{formatDate(c.start_date)}</span> → <span style={money}>{formatDate(c.end_date)}</span>
                </span>
                {c.last_message && (
                  <span
                    style={{
                      ...muted,
                      fontSize: 13,
                      display: "block",
                      marginTop: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.last_message}
                  </span>
                )}
                <span style={{ ...muted, fontSize: 11, display: "block", marginTop: 3 }}>{timeAgo(c.last_at)}</span>
              </button>
            );
          })}
        </>
      )}
    </HeaderPanel>
  );
}
