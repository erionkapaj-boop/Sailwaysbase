"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import {
  listMyPings,
  claimBookingRequest,
  declineBookingRequest,
  listMyBookingsAsSkipper,
  getMyStanding,
} from "../../../lib/platform/db";
import AvailabilityCalendar from "./AvailabilityCalendar";
import MissingProfile from "./MissingProfile";
import BookingPanel from "../components/BookingPanel";
import Stars from "../components/Stars";
import { container, card, h1, sectionLabel, muted, button, badge, colors, money } from "../../../lib/platform/theme";

const CLAIM_ERRORS = {
  request_not_open: "Το αίτημα δεν είναι πια ανοιχτό — κάποιος άλλος πρόλαβε ή έληξε.",
  already_resolved: "Έχεις ήδη απαντήσει σε αυτό το αίτημα.",
  date_overlap: "Έχεις ήδη επιβεβαιωμένη κράτηση που επικαλύπτεται με αυτές τις ημερομηνίες.",
  insufficient_wallet: "Δεν έχεις αρκετό υπόλοιπο wallet για το claim fee.",
  skipper_not_eligible: "Το προφίλ σου δεν είναι εγκεκριμένο.",
};

function PingsInbox({ skipperId, onClaimed }) {
  const { refreshNotifications } = useAuth();
  const [pings, setPings] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setPings(await listMyPings(skipperId));
  }
  useEffect(() => {
    load();
  }, [skipperId]);

  async function handleClaim(requestId) {
    setBusyId(requestId);
    setError("");
    try {
      await claimBookingRequest(requestId, skipperId);
      await load();
      onClaimed?.();
      refreshNotifications();
    } catch (err) {
      const code = (err.message || "").match(/[a-z_]+/)?.[0];
      setError(CLAIM_ERRORS[code] || err.message || String(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(requestId) {
    setBusyId(requestId);
    setError("");
    try {
      await declineBookingRequest(requestId, skipperId);
      await load();
      refreshNotifications();
    } catch (err) {
      setError(err.message || String(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = pings.filter((p) => p.status === "pending" && p.booking_requests?.status === "open");

  return (
    <div>
      <h2 style={sectionLabel}>Εισερχόμενα αιτήματα ({pending.length})</h2>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {pending.length === 0 && <p style={muted}>Δεν υπάρχουν εκκρεμή αιτήματα αυτή τη στιγμή.</p>}
      {pending.map((p) => {
        const r = p.booking_requests;
        const cp = r.client_profiles;
        return (
          <div key={p.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>
                  {r.ports?.name} · {r.boat_types?.name}
                </div>
                <p style={{ ...muted, margin: "6px 0 0" }}>
                  <span style={money}>{r.start_date}</span> → <span style={money}>{r.end_date}</span>
                </p>
                <p style={{ ...muted, margin: "4px 0 0" }}>
                  Πελάτης:{" "}
                  {cp?.reliability_percentage != null ? (
                    <>
                      <span style={{ ...money, color: colors.ink }}>{cp.reliability_percentage}%</span> αξιοπιστία
                    </>
                  ) : (
                    "νέος πελάτης"
                  )}
                  {" · "}
                  <span style={{ ...money, color: colors.ink }}>
                    {cp?.rating_avg ? cp.rating_avg.toFixed(1) : "—"}
                  </span>
                  {" ★ "}
                  <span style={money}>({cp?.rating_count ?? 0})</span>
                </p>
              </div>
              {/* Declining counts as answering. Without it, the only way to
                  look responsive would be to claim everything — exactly the
                  behaviour the score should discourage. */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <button style={button("primary")} disabled={busyId === r.id} onClick={() => handleClaim(r.id)}>
                  {busyId === r.id ? "..." : "Διεκδίκηση"}
                </button>
                <button style={button("secondary")} disabled={busyId === r.id} onClick={() => handleDecline(r.id)}>
                  Δεν με ενδιαφέρει
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SkipperDashboard() {
  return (
    <Suspense fallback={<div style={container}>Φόρτωση...</div>}>
      <SkipperDashboardInner />
    </Suspense>
  );
}

// useSearchParams() (for ?focus=<bookingId>, used by the header's
// notification bell) requires a Suspense boundary around it in the app
// router — split out so the boundary wraps only what needs it.
function SkipperDashboardInner() {
  const { session, profile, userRow, loading, refresh, loadError, notifications } = useAuth();
  const searchParams = useSearchParams();
  const focusBookingId = searchParams.get("focus");
  const [bookings, setBookings] = useState([]);
  const [standing, setStanding] = useState(null);

  async function loadBookings() {
    if (profile?.id) setBookings(await listMyBookingsAsSkipper(profile.id));
  }
  useEffect(() => {
    loadBookings();
    if (profile?.id) getMyStanding().then(setStanding).catch(() => {});
  }, [profile?.id]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "skipper") return <div style={container}>Αυτή η σελίδα είναι μόνο για skippers.</div>;
  if (!profile) return <MissingProfile userRow={userRow} refresh={refresh} loadError={loadError} />;

  return (
    <div style={container}>
      <h1 style={h1}>Ο πίνακάς μου</h1>

      {profile.approval_status === "pending" && (
        <div style={{ ...card, borderLeft: `3px solid ${colors.warn}` }}>
          <b style={{ fontWeight: 600 }}>Το προφίλ σου περιμένει έγκριση.</b>
          <p style={{ ...muted, margin: "6px 0 0" }}>
            Μέχρι τότε δεν εμφανίζεσαι σε αναζητήσεις, αλλά μπορείς να συμπληρώσεις το προφίλ και τη
            διαθεσιμότητά σου από τώρα.
          </p>
        </div>
      )}
      {profile.approval_status === "rejected" && (
        <div style={{ ...card, borderLeft: `3px solid ${colors.danger}` }}>
          <b style={{ fontWeight: 600 }}>Το προφίλ σου απορρίφθηκε.</b>
          <p style={{ ...muted, margin: "6px 0 0" }}>
            Ενημέρωσε τα στοιχεία σου και επικοινώνησε με τον admin.
          </p>
        </div>
      )}

      {/* Uniform 32px gap before every section below, instead of each one
          picking its own margin from whatever card/border it happens to
          use — that's what made the page read as an ad hoc stack. */}
      {profile.approval_status === "approved" && (
        <div style={{ marginTop: 32 }}>
          {/* Incoming work first — this is the time-critical thing. */}
          <PingsInbox skipperId={profile.id} onClaimed={loadBookings} />
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h2 style={sectionLabel}>Κρατήσεις</h2>
        {bookings.length === 0 && <p style={muted}>Δεν υπάρχουν κρατήσεις ακόμα.</p>}
        {bookings.map((b) => (
          <BookingPanel
            key={b.id}
            booking={b}
            viewerRole="skipper"
            viewerUserId={userRow.id}
            onChanged={loadBookings}
            autoExpand={b.id === focusBookingId}
            hasUnread={notifications.unreadBookingIds.includes(b.id)}
          />
        ))}
      </div>

      {/* Standing: the star row belongs with reliability and tier, since all
          three answer the same question — how do I look to a client right
          now. Given its own line above them because it's the one a
          professional actually cares about. */}
      <div
        style={{
          marginTop: 32,
          paddingBottom: 10,
          borderTop: `1px solid ${colors.border}`,
          paddingTop: 12,
        }}
      >
        <Stars rating={profile.rating_avg} count={profile.rating_count} size={17} />

        {/* Behaviour sits beside the stars, never inside them: each badge
            says what it measures, so nothing is being passed off as an
            average of reviews. These are what lift you in search results. */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {profile.cancellation_flag_count === 0 && profile.completed_bookings_count > 0 && (
            <span style={badge("success")}>Καμία ακύρωση</span>
          )}
          {standing && standing.responded + standing.ignored > 0 && (
            <span style={badge(standing.ignored === 0 ? "success" : "neutral")}>
              Απαντά σε {standing.responded} από {standing.responded + standing.ignored} αιτήματα
            </span>
          )}
        </div>
      </div>

      {/* Wallet/tier is background information, not something acted on daily —
          a thin line, not a card competing with the sections above and
          below it. A "·" separates the three instead of a wide gap, and
          every label/value pair shares one explicit size so nothing
          (notably the "—" placeholder) looks out of step with the rest. */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          padding: "10px 2px",
          borderTop: `1px solid ${colors.border}`,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <span style={{ fontSize: 13, color: colors.inkSoft }}>Wallet</span>
        <b style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}>
          {profile.wallet_balance}€
        </b>
        <span style={{ fontSize: 13, color: colors.inkSoft, margin: "0 10px" }}>·</span>
        <span style={{ fontSize: 13, color: colors.inkSoft }}>Βαθμίδα</span>
        <b style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}>
          {profile.tier === "high" ? "Υψηλή" : profile.tier === "low" ? "Χαμηλή" : "Μεσαία"}
        </b>
        <span style={{ fontSize: 13, color: colors.inkSoft, margin: "0 10px" }}>·</span>
        <span style={{ fontSize: 13, color: colors.inkSoft }}>Αξιοπιστία</span>
        <b style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}>
          {profile.reliability_percentage != null ? `${profile.reliability_percentage}%` : "—"}
        </b>
      </div>

      {/* Available while pending too — no reason to wait for approval before
          saying when you can work. */}
      <div style={{ marginTop: 32 }}>
        {/* No onChanged: the calendar reloads its own windows, and changing
            availability doesn't change bookings — refetching them here was
            just a wasted round trip. */}
        <AvailabilityCalendar skipperId={profile.id} bookings={bookings} />
      </div>
    </div>
  );
}
