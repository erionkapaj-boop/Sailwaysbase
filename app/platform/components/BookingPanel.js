"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import {
  listMessages,
  sendMessage,
  markMessagesRead,
  cancelBooking,
  submitReview,
  replyToReview,
  listReviewsForBooking,
  getRevealedSkipper,
  getRevealedClient,
} from "../../../lib/platform/db";
import { card, muted, button, input, badge, colors, money, radius } from "../../../lib/platform/theme";

const STATUS_LABEL = {
  confirmed: ["Επιβεβαιωμένη", "success"],
  completed: ["Ολοκληρώθηκε", "neutral"],
  cancelled_by_client: ["Ακυρώθηκε από πελάτη", "danger"],
  cancelled_by_skipper: ["Ακυρώθηκε από skipper", "danger"],
};

export default function BookingPanel({ booking, viewerRole, viewerUserId, onChanged, autoExpand = false, hasUnread = false }) {
  const { refreshNotifications } = useAuth();
  const rootRef = useRef(null);
  const [expanded, setExpanded] = useState(autoExpand);
  const [counterpart, setCounterpart] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reply, setReply] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isPastEnd = new Date(booking.end_date) < new Date(new Date().toDateString());
  const revealed = ["confirmed", "completed", "cancelled_by_client", "cancelled_by_skipper"].includes(booking.status);

  // Loaded on first expand rather than on mount — the list can hold many
  // bookings and most stay collapsed.
  useEffect(() => {
    if (!revealed || !expanded) return;
    if (viewerRole === "client") {
      getRevealedSkipper(booking.skipper_id).then(setCounterpart).catch(() => {});
    } else {
      getRevealedClient(booking.client_id).then(setCounterpart).catch(() => {});
    }
    listMessages(booking.id).then(setMessages).catch(() => {});
    listReviewsForBooking(booking.id).then(setReviews).catch(() => {});
    // Opening the thread is what "reading" it means here — mark it read and
    // let the header bell know, so the badge doesn't wait for a full reload.
    markMessagesRead(booking.id).then(refreshNotifications).catch(() => {});
  }, [booking.id, expanded]);

  // Arriving here from the notification bell (?focus=<id>) should land the
  // booking in view already open, not just highlighted somewhere off-screen.
  useEffect(() => {
    if (autoExpand) rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [autoExpand]);

  async function handleSend() {
    if (!newMessage.trim()) return;
    setBusy(true);
    try {
      await sendMessage(booking.id, newMessage.trim());
      setNewMessage("");
      setMessages(await listMessages(booking.id));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Σίγουρα θέλεις να ακυρώσεις; Θα χάσεις το ποσό που έχεις ήδη πληρώσει και θα καταγραφεί flag στο ιστορικό σου.")) return;
    setBusy(true);
    setError("");
    try {
      await cancelBooking(booking.id, cancelReason || "Χωρίς αναφερόμενο λόγο");
      onChanged?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const myReview = reviews.find((r) => r.reviewer_id === viewerUserId);
  const reviewOfMe = reviews.find((r) => r.reviewee_id === viewerUserId);

  async function handleSubmitReview() {
    setBusy(true);
    setError("");
    try {
      // client -> skipper: reviewee is the skipper's login user id (skipper_profiles.user_id)
      // skipper -> client: reviewee is booking.client_id directly (client_profiles PK == users.id)
      const targetId = viewerRole === "client" ? counterpart?.user_id : booking.client_id;
      await submitReview({ bookingId: booking.id, revieweeId: targetId, rating, comment });
      setReviews(await listReviewsForBooking(booking.id));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReply() {
    setBusy(true);
    setError("");
    try {
      await replyToReview(reviewOfMe.id, reply);
      setReviews(await listReviewsForBooking(booking.id));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const [statusLabel, statusTone] = STATUS_LABEL[booking.status] || [booking.status, "neutral"];

  return (
    // Collapsed by default: a row per booking, not a full card, so a list
    // of several doesn't let one entry dominate the screen. The status
    // badge alone signals state — no second, parallel colour stripe.
    <div ref={rootRef} style={{ ...card, padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{booking.ports?.name}</span>
          <span style={{ ...money, fontSize: 13, color: colors.inkSoft }}>
            {booking.start_date} → {booking.end_date}
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {hasUnread && !expanded && (
            <span
              aria-label="Νέο μήνυμα"
              style={{ width: 7, height: 7, borderRadius: "50%", background: colors.danger, flexShrink: 0 }}
            />
          )}
          <span style={badge(statusTone)}>{statusLabel}</span>
          <span
            style={{
              color: colors.inkSoft,
              fontSize: 14,
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }}
            aria-hidden="true"
          >
            ⌄
          </span>
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 18px 18px" }}>
      {revealed && counterpart && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ ...muted, fontSize: 13 }}>{viewerRole === "client" ? "Skipper" : "Πελάτης"}</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>
            {viewerRole === "client" ? counterpart.full_name || "—" : "—"}
          </div>
          {(counterpart.users?.phone_number || counterpart.phone_number) && (
            <div style={{ ...money, fontSize: 14, marginTop: 2 }}>
              {counterpart.users?.phone_number || counterpart.phone_number}
            </div>
          )}
        </div>
      )}

      {booking.status === "confirmed" && (
        <div style={{ marginTop: 10 }}>
          <input
            style={{ ...input, marginBottom: 6 }}
            placeholder="Λόγος ακύρωσης (προαιρετικό)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <button style={button("danger")} disabled={busy} onClick={handleCancel}>
            Ακύρωση κράτησης
          </button>
        </div>
      )}

      {(booking.status === "confirmed" || booking.status === "completed") && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
          <div style={{ ...muted, fontSize: 13, fontWeight: 500 }}>Μηνύματα</div>
          <div style={{ maxHeight: 180, overflowY: "auto", margin: "10px 0" }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  fontSize: 14,
                  marginBottom: 6,
                  textAlign: m.sender_id === viewerUserId ? "right" : "left",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "8px 12px",
                    borderRadius: radius.md,
                    maxWidth: "80%",
                    textAlign: "left",
                    background: m.sender_id === viewerUserId ? colors.ink : "#F4F4F5",
                    color: m.sender_id === viewerUserId ? "#fff" : colors.ink,
                  }}
                >
                  {m.content}
                </span>
              </div>
            ))}
            {messages.length === 0 && <p style={muted}>Δεν υπάρχουν μηνύματα ακόμα.</p>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={input}
              placeholder="Γράψε μήνυμα..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button style={button("secondary")} disabled={busy} onClick={handleSend}>
              Αποστολή
            </button>
          </div>
        </div>
      )}

      {booking.status === "completed" && isPastEnd && !myReview && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
          <div style={{ ...muted, fontSize: 13, fontWeight: 500 }}>Άφησε αξιολόγηση</div>
          <div style={{ margin: "8px 0" }}>
            <select style={{ ...input, width: 100 }} value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={r}>
                  {"★".repeat(r)}
                </option>
              ))}
            </select>
            <textarea
              style={{ ...input, marginTop: 6, minHeight: 60 }}
              placeholder="Σχόλιο"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <button style={button("primary")} disabled={busy} onClick={handleSubmitReview}>
            Υποβολή αξιολόγησης
          </button>
        </div>
      )}

      {reviewOfMe && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
          <div style={{ ...muted, fontSize: 13, fontWeight: 500 }}>
            Σε αξιολόγησαν <span style={{ ...money, color: colors.ink }}>{reviewOfMe.rating}</span> ★
          </div>
          <p style={{ ...muted, marginTop: 6 }}>{reviewOfMe.comment}</p>
          {reviewOfMe.reply ? (
            <p style={{ fontSize: 13, fontStyle: "italic" }}>Απάντησή σου: {reviewOfMe.reply}</p>
          ) : (
            <div>
              <input
                style={input}
                placeholder="Δημόσια απάντηση (έως 500 χαρακτήρες)"
                maxLength={500}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <button style={{ ...button("secondary"), marginTop: 6 }} disabled={busy} onClick={handleReply}>
                Απάντηση
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: colors.danger, marginTop: 8 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
