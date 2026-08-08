"use client";
import { useEffect, useState } from "react";
import {
  listMessages,
  sendMessage,
  cancelBooking,
  submitReview,
  replyToReview,
  listReviewsForBooking,
  getRevealedSkipper,
  getRevealedClient,
} from "../../../lib/platform/db";
import { card, h2, muted, button, input, badge, colors } from "../../../lib/platform/theme";

const STATUS_LABEL = {
  confirmed: ["Επιβεβαιωμένη", "success"],
  completed: ["Ολοκληρώθηκε", "neutral"],
  cancelled_by_client: ["Ακυρώθηκε από πελάτη", "danger"],
  cancelled_by_skipper: ["Ακυρώθηκε από skipper", "danger"],
};

export default function BookingPanel({ booking, viewerRole, viewerUserId, onChanged }) {
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

  useEffect(() => {
    if (!revealed) return;
    if (viewerRole === "client") {
      getRevealedSkipper(booking.skipper_id).then(setCounterpart).catch(() => {});
    } else {
      getRevealedClient(booking.client_id).then(setCounterpart).catch(() => {});
    }
    listMessages(booking.id).then(setMessages).catch(() => {});
    listReviewsForBooking(booking.id).then(setReviews).catch(() => {});
  }, [booking.id]);

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
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={h2}>
          {booking.ports?.name} · {booking.boat_types?.name}
        </h2>
        <span style={badge(statusTone)}>{statusLabel}</span>
      </div>
      <p style={muted}>
        {booking.start_date} → {booking.end_date}
      </p>

      {revealed && counterpart && (
        <p style={{ fontSize: 14 }}>
          <b>{viewerRole === "client" ? "Skipper" : "Πελάτης"}:</b>{" "}
          {viewerRole === "client" ? counterpart.full_name : "—"}{" "}
          {(counterpart.users?.phone_number || counterpart.phone_number) && (
            <> · 📞 {counterpart.users?.phone_number || counterpart.phone_number}</>
          )}
        </p>
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
          <b style={{ fontSize: 14 }}>Μηνύματα</b>
          <div style={{ maxHeight: 160, overflowY: "auto", margin: "8px 0" }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  fontSize: 13,
                  marginBottom: 6,
                  textAlign: m.sender_id === viewerUserId ? "right" : "left",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: m.sender_id === viewerUserId ? colors.brand : "#EEF2F5",
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
          <b style={{ fontSize: 14 }}>Άφησε αξιολόγηση</b>
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
          <b style={{ fontSize: 14 }}>Σε αξιολόγησαν: {"★".repeat(reviewOfMe.rating)}</b>
          <p style={muted}>{reviewOfMe.comment}</p>
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
  );
}
