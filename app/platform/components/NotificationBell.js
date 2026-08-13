"use client";
import { useRouter } from "next/navigation";
import { colors } from "../../../lib/platform/theme";

// One glance, one tap: a new request always outranks an unread message (it's
// time-sensitive — someone else can claim it), so that's where the bell
// sends you first. With exactly one unread conversation and nothing more
// urgent, it jumps straight into that booking instead of the plain list.
export default function NotificationBell({ notifications }) {
  const router = useRouter();
  const pendingRequests = notifications?.pendingRequests ?? 0;
  const unreadBookingIds = notifications?.unreadBookingIds ?? [];
  const count = pendingRequests + unreadBookingIds.length;

  function handleClick() {
    if (pendingRequests === 0 && unreadBookingIds.length === 1) {
      router.push(`/platform/skipper?focus=${unreadBookingIds[0]}`);
    } else {
      router.push("/platform/skipper");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={count > 0 ? `${count} νέες ειδοποιήσεις` : "Ειδοποιήσεις"}
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
      {/* A drawn outline instead of the 🔔 emoji — the emoji renders in its
          own fixed gold/yellow across most platforms, which doesn't take the
          header's ink colour and reads as a stock icon dropped onto a
          designed page. */}
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 14.5 18 8Z" />
        <path d="M13.6 20.5a1.8 1.8 0 0 1-3.2 0" />
      </svg>
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
  );
}
