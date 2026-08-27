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
  getBookingCounterpart,
  departureLabel,
} from "../../../lib/platform/db";
import { card, muted, button, input, select, badge, colors, money, radius } from "../../../lib/platform/theme";
import { formatDateTime } from "../../../lib/platform/notifications";
import { reviewCategoriesForRole } from "../../../lib/platform/reviewCategories";
import { labelForRole } from "../../../lib/platform/roles";

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
  // Και οι δύο κατευθύνσεις αξιολογούν πλέον σε κατηγορίες — ο πελάτης τον
  // επαγγελματία με το δικό του σετ (ανά crew_role), ο επαγγελματίας τον
  // πελάτη με το δικό του.
  const [categories, setCategories] = useState({});
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
    getBookingCounterpart(booking.id).then(setCounterpart).catch(() => {});
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

  // The categories being collected here are always about the counterpart:
  // their crew_role picks the set when the viewer is a client (rating the
  // professional); a professional rating a client always uses the client's
  // own set, since it doesn't depend on which professional role is doing
  // the rating.
  const counterpartCategories =
    viewerRole === "client" ? reviewCategoriesForRole(counterpart?.crew_role) : reviewCategoriesForRole("client");
  const allCategoriesChosen = counterpartCategories.every((c) => categories[c.key]);
  const categoryAverage = allCategoriesChosen
    ? counterpartCategories.reduce((sum, c) => sum + categories[c.key], 0) / counterpartCategories.length
    : null;
  // reviewOfMe is about the viewer's OWN role — a client now has a category
  // set too (reviewCategoriesForRole("client")), same mechanism.
  const myCategories = reviewCategoriesForRole(viewerRole);
  const hasCategoryBreakdown = myCategories.some((c) => reviewOfMe?.[`rating_${c.key}`] != null);

  async function handleSubmitReview() {
    setBusy(true);
    setError("");
    try {
      // get_booking_counterpart() already resolves to the other side's login
      // user id regardless of direction — the skipper's account when you're
      // the client, booking.client_id itself when you're the skipper.
      await submitReview({
        bookingId: booking.id,
        revieweeId: counterpart?.user_id,
        comment,
        categories,
      });
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
          <span style={{ fontSize: 14, fontWeight: 500 }}>{departureLabel(booking)}</span>
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
      {/* Πότε ακριβώς επιβεβαιώθηκε — διαφορετική στιγμή από το ναύλο που
          κλείνει, χρήσιμη σε περίπτωση διαφωνίας για το ποιος ήξερε τι
          πότε. confirmed_at λείπει μόνο σε ό,τι ήρθε από παλιά δεδομένα
          πριν υπάρξει η στήλη· δεν εμφανίζεται τίποτα τότε αντί για
          λανθασμένη ώρα. */}
      {booking.confirmed_at && (
        <p style={{ ...muted, fontSize: 12, margin: "10px 0 0" }}>
          Επιβεβαιώθηκε {formatDateTime(booking.confirmed_at)}
        </p>
      )}
      {revealed && counterpart && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.border}`, display: "flex", gap: 12, alignItems: "center" }}>
          {counterpart.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={counterpart.photo_url}
              alt=""
              style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <span
              aria-hidden="true"
              style={{ width: 44, height: 44, borderRadius: "50%", background: "#EFEDE8", flexShrink: 0 }}
            />
          )}
          <div>
            <div style={{ ...muted, fontSize: 13 }}>
              {viewerRole === "client" ? labelForRole(counterpart.crew_role) || "Επαγγελματίας" : "Πελάτης"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{counterpart.full_name || "—"}</div>
            {counterpart.phone_number && (
              <div style={{ ...money, fontSize: 14, marginTop: 2 }}>{counterpart.phone_number}</div>
            )}
          </div>
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
          <div style={{ margin: "10px 0" }}>
            {counterpartCategories.map((c) => (
              <div key={c.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{c.label}</div>
                <div style={{ ...muted, fontSize: 11.5, margin: "2px 0 4px" }}>{c.hint}</div>
                <select
                  style={{ ...select, width: 100 }}
                  value={categories[c.key] || ""}
                  onChange={(e) =>
                    setCategories((prev) => ({ ...prev, [c.key]: Number(e.target.value) }))
                  }
                >
                  <option value="" disabled>
                    —
                  </option>
                  {[5, 4, 3, 2, 1].map((r) => (
                    <option key={r} value={r}>
                      {"★".repeat(r)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {categoryAverage != null && (
              <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 10px" }}>
                Συνολική βαθμολογία: <b style={{ ...money, color: colors.ink }}>{categoryAverage.toFixed(2)}</b> / 5
              </p>
            )}
            <textarea
              style={{ ...input, marginTop: 6, minHeight: 60 }}
              placeholder="Σχόλιο"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <button style={button("primary")} disabled={busy || !allCategoriesChosen} onClick={handleSubmitReview}>
            Υποβολή αξιολόγησης
          </button>
        </div>
      )}

      {reviewOfMe && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
          <div style={{ ...muted, fontSize: 13, fontWeight: 500 }}>
            Σε αξιολόγησαν{" "}
            <span style={{ ...money, color: colors.ink }}>{Number(reviewOfMe.rating).toFixed(1)}</span> ★
          </div>
          {/* Κάθε ρόλος (client/skipper/hostess) έχει πλέον δικό του σετ
              κατηγοριών — myCategories τις παίρνει από reviewCategoriesForRole
              με βάση τον ίδιο τον viewerRole, εδώ γίνεται μόνο ο έλεγχος αν
              όντως στάλθηκαν (trg_review_categories τις απαιτεί πάντα μαζί). */}
          {hasCategoryBreakdown && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ ...muted, fontSize: 12.5, cursor: "pointer" }}>Δες ανά κατηγορία</summary>
              <div style={{ marginTop: 6 }}>
                {myCategories.map((c) => (
                  <div
                    key={c.key}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}
                  >
                    <span style={muted}>{c.label}</span>
                    <span style={{ ...money, color: colors.ink }}>{reviewOfMe[`rating_${c.key}`]} / 5</span>
                  </div>
                ))}
              </div>
            </details>
          )}
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
