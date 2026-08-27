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
  getPlatformSetting,
} from "../../../lib/platform/db";
import AvailabilityCalendar from "./AvailabilityCalendar";
import MissingProfile from "./MissingProfile";
import BookingPanel from "../components/BookingPanel";
import PendingReviewBanner from "../components/PendingReviewBanner";
import Stars from "../components/Stars";
import { container, card, h1, sectionLabel, muted, button, badge, colors, money } from "../../../lib/platform/theme";
import { formatDateTime } from "../../../lib/platform/notifications";
import { reviewCategoriesForRole } from "../../../lib/platform/reviewCategories";

const CLIENT_CATEGORIES = reviewCategoriesForRole("client");

const CLAIM_ERRORS = {
  request_not_open: "Το αίτημα δεν είναι πια ανοιχτό — κάποιος άλλος πρόλαβε ή έληξε.",
  already_resolved: "Έχεις ήδη απαντήσει σε αυτό το αίτημα.",
  date_overlap: "Έχεις ήδη επιβεβαιωμένη κράτηση που επικαλύπτεται με αυτές τις ημερομηνίες.",
  insufficient_wallet: "Δεν έχεις αρκετό υπόλοιπο wallet για το claim fee.",
  skipper_not_eligible: "Το προφίλ σου δεν είναι εγκεκριμένο.",
  request_expired: "Η πρόταση έληξε.",
  already_covered: "Η δουλειά καλύφθηκε ήδη από κάποιον άλλον.",
};

// Κρατάει το ίδιο κατώφλι με το reliability_min_history στη βάση (0027).
const MIN_RELIABILITY_HISTORY = 3;

// Πρόταση από τη διαχείριση, όχι αίτημα πελάτη: ήρθε επειδή σε διάλεξαν
// ονομαστικά, και αξίζει να διαβάζεται διαφορετικά από ένα ερώτημα που έφυγε
// σε πολλούς.
const OFFER_LABEL = {
  admin_direct: "Πρόταση από τη διαχείριση",
  admin_replacement: "Αντικατάσταση — ο πελάτης έμεινε χωρίς πλήρωμα",
};

function PingsInbox({ skipperId, onClaimed }) {
  const { refreshNotifications } = useAuth();
  const [pings, setPings] = useState([]);
  const [defaultFee, setDefaultFee] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setPings(await listMyPings(skipperId));
  }
  useEffect(() => {
    load();
    // Το κόστος της διεκδίκησης δίπλα στο κουμπί που το χρεώνει.
    getPlatformSetting("skipper_claim_fee").then(setDefaultFee).catch(() => {});
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
      {pending.map((p) => (
        <PingCard
          key={p.id}
          p={p}
          fee={p.booking_requests.claim_fee_amount != null ? Number(p.booking_requests.claim_fee_amount) : defaultFee}
          busy={busyId === p.booking_requests.id}
          onClaim={() => handleClaim(p.booking_requests.id)}
          onDecline={() => handleDecline(p.booking_requests.id)}
        />
      ))}
    </div>
  );
}

// Δικό της component (όχι απλώς inline μέσα στο .map) ώστε κάθε κάρτα να
// έχει το δικό της showBreakdown — ίδιο μοτίβο με το SkipperCard της
// αναζήτησης: ο πελάτης βλέπει την ανάλυση του επαγγελματία πριν διαλέξει,
// οπότε ο επαγγελματίας πρέπει συμμετρικά να μπορεί να δει την ανάλυση του
// πελάτη πριν αποφασίσει να διεκδικήσει.
function PingCard({ p, fee, busy, onClaim, onDecline }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const r = p.booking_requests;
  const cp = r.client_profiles;
  const isOffer = r.origin && r.origin !== "client";

  return (
    <div
      style={{
        ...card,
        // Μια πρόταση που σου έγινε ονομαστικά δεν πρέπει να χάνεται
        // ανάμεσα σε αιτήματα που έφυγαν σε δέκα άτομα.
        borderLeft: isOffer ? `3px solid ${colors.ink}` : card.borderLeft,
      }}
    >
      {isOffer && (
        <p style={{ ...muted, fontSize: 12, margin: "0 0 8px", color: colors.ink, fontWeight: 500 }}>
          {OFFER_LABEL[r.origin] || "Πρόταση από τη διαχείριση"}
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 15 }}>
            {r.ports?.name} · {r.boat_types?.name}
          </div>
          {(r.party_size != null || r.private_cabin != null) && (
            <p style={{ ...muted, fontSize: 13, margin: "2px 0 0" }}>
              {r.party_size != null && <>Άτομα: {r.party_size}</>}
              {r.party_size != null && r.private_cabin != null ? " · " : ""}
              {r.private_cabin != null && <>Ιδιωτική καμπίνα: {r.private_cabin ? "Ναι" : "Όχι"}</>}
            </p>
          )}
          <p style={{ ...muted, margin: "6px 0 0" }}>
            <span style={money}>{r.start_date}</span> → <span style={money}>{r.end_date}</span>
          </p>
          <p style={{ ...muted, fontSize: 12, margin: "2px 0 0" }}>Στάλθηκε {formatDateTime(r.created_at)}</p>
          {isOffer ? (
            <p style={{ ...muted, margin: "4px 0 0" }}>
              Σε επέλεξαν απευθείας για αυτή τη δουλειά.
              {r.note && <> «{r.note}»</>}
            </p>
          ) : (
            <>
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
                {cp?.rating_count > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowBreakdown((v) => !v)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
                    aria-expanded={showBreakdown}
                  >
                    <span style={{ ...money, color: colors.ink }}>{cp.rating_avg.toFixed(1)}</span>
                    {" ★ "}
                    <span style={money}>({cp.rating_count})</span>
                  </button>
                ) : (
                  <>
                    <span style={{ ...money, color: colors.ink }}>—</span>
                    {" ★ "}
                    <span style={money}>(0)</span>
                  </>
                )}
              </p>
              {showBreakdown && cp?.rating_count > 0 && (
                <div
                  style={{
                    margin: "6px 0 0",
                    padding: "10px 12px",
                    background: colors.bgSoft || "#F7F5F0",
                    borderRadius: 8,
                  }}
                >
                  {CLIENT_CATEGORIES.map((c) => (
                    <div
                      key={c.key}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "3px 0" }}
                    >
                      <span style={{ fontSize: 12.5, color: colors.inkSoft }}>{c.label}</span>
                      <Stars rating={cp[`rating_avg_${c.key}`]} count={cp.rating_count} size={11} showEmptyLabel={false} />
                    </div>
                  ))}
                </div>
              )}
              {(cp?.nationalities?.name || cp?.client_languages?.length > 0) && (
                <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
                  {cp?.nationalities?.name}
                  {cp?.nationalities?.name && cp?.client_languages?.length > 0 ? " · " : ""}
                  {cp?.client_languages?.map((cl) => cl.languages?.name).filter(Boolean).join(", ")}
                </p>
              )}
            </>
          )}
          {/* Το ποσό δίπλα στην απόφαση, όχι στο πορτοφόλι μετά. */}
          {fee != null && (
            <p style={{ ...muted, fontSize: 12.5, margin: "6px 0 0" }}>
              {Number(fee) === 0 ? (
                "Χωρίς χρέωση διεκδίκησης."
              ) : (
                <>
                  Με τη διεκδίκηση χρεώνεσαι <span style={{ ...money, color: colors.ink }}>{fee}€</span>.
                </>
              )}
            </p>
          )}
        </div>
        {/* Declining counts as answering. Without it, the only way to look
            responsive would be to claim everything — exactly the behaviour
            the score should discourage. */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <button style={button("primary")} disabled={busy} onClick={onClaim}>
            {busy ? "..." : "Διεκδίκηση"}
          </button>
          <button style={button("secondary")} disabled={busy} onClick={onDecline}>
            Δεν με ενδιαφέρει
          </button>
        </div>
      </div>
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
  const { session, profile, userRow, loading, refresh, loadError, notifications, isAdmin } = useAuth();
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
  // The account that runs the platform can also hold a professional profile
  // — the owner both hires crew and sometimes takes charters personally,
  // and reaches it through the same dashboard as anyone else rather than a
  // special admin-only version of it.
  if (userRow?.role !== "skipper" && !isAdmin)
    return <div style={container}>Αυτή η σελίδα είναι μόνο για επαγγελματίες.</div>;
  if (!profile) return <MissingProfile userRow={userRow} isAdmin={isAdmin} refresh={refresh} loadError={loadError} />;

  // Πόσα περιστατικά υπάρχουν συνολικά να μιλήσουν για κάποιον.
  const history = (profile.completed_bookings_count || 0) + (profile.cancellation_flag_count || 0);

  return (
    <div style={container}>
      <h1 style={h1}>Ο πίνακάς μου</h1>
      <PendingReviewBanner />

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
            viewerRole={profile.role || "skipper"}
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
          {/* Η έγκαιρη ειδοποίηση είναι το ζητούμενο, οπότε λέγεται φωναχτά.
              Χωρίς αυτό, ο μόνος τρόπος να μη φαίνεσαι κακός ήταν να μην
              ακυρώσεις ποτέ — που σημαίνει να το κρύψεις μέχρι την τελευταία
              στιγμή, ακριβώς η συμπεριφορά που κοστίζει περισσότερο. */}
          {standing?.cancellations > 0 && standing.cancellationLoad / standing.cancellations <= 0.3 && (
            <span style={badge("success")}>Ειδοποιεί έγκαιρα</span>
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
        {/* Κάτω από τρία περιστατικά δεν δείχνουμε ποσοστό. Μία ακύρωση στην
            πρώτη δουλειά έβγαζε «0%» — νούμερο που δεν περιγράφει κανέναν,
            μόνο το ότι δεν υπάρχει ακόμα ιστορικό να περιγραφεί. */}
        <b
          style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}
          title={
            history < MIN_RELIABILITY_HISTORY
              ? "Χρειάζονται τουλάχιστον 3 ολοκληρωμένες ή ακυρωμένες κρατήσεις"
              : undefined
          }
        >
          {history >= MIN_RELIABILITY_HISTORY && profile.reliability_percentage != null
            ? `${profile.reliability_percentage}%`
            : "—"}
        </b>
      </div>

      {/* Λέγεται μόνο όταν υπάρχει κάτι να ειπωθεί. Ο επαγγελματίας πρέπει να
          ξέρει ότι οι ακυρώσεις τον κατεβάζουν στη σειρά — και κυρίως ότι το
          πόσο εξαρτάται από το πότε ειδοποιεί, γιατί αυτό είναι το μόνο
          κομμάτι που ελέγχει ο ίδιος. */}
      {standing?.cancellations > 0 && standing.cancelStanding != null && (
        <p style={{ ...muted, fontSize: 12.5, margin: "10px 2px 0", lineHeight: 1.5 }}>
          {standing.cancellations === 1 ? "1 ακύρωση" : `${standing.cancellations} ακυρώσεις`} στο ιστορικό σου.
          {standing.cancelStanding >= 99
            ? " Επειδή ειδοποίησες έγκαιρα, σχεδόν δεν επηρεάζουν τη θέση σου στις αναζητήσεις."
            : standing.cancelStanding >= 90
            ? " Επηρεάζουν ελαφρά τη θέση σου στις αναζητήσεις."
            : " Επηρεάζουν αισθητά τη θέση σου στις αναζητήσεις."}
          {" Όσο πιο νωρίς ειδοποιείς, τόσο λιγότερο μετράει η κάθε μία."}
        </p>
      )}

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
