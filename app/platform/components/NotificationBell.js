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
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "6px 6px",
        fontSize: 17,
        lineHeight: 1,
        color: colors.ink,
      }}
    >
      <span aria-hidden="true">🔔</span>
      {count > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -1,
            right: -3,
            minWidth: 15,
            height: 15,
            padding: "0 3px",
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
  );
}
