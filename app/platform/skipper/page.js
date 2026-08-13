"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import {
  listMyPings,
  claimBookingRequest,
  listMyBookingsAsSkipper,
  createMissingProfile,
} from "../../../lib/platform/db";
import AvailabilityCalendar from "./AvailabilityCalendar";
import BookingPanel from "../components/BookingPanel";
import { container, card, h1, sectionLabel, muted, button, colors, money } from "../../../lib/platform/theme";

const CLAIM_ERRORS = {
  request_not_open: "Το αίτημα δεν είναι πια ανοιχτό — κάποιος άλλος πρόλαβε ή έληξε.",
  already_resolved: "Έχεις ήδη απαντήσει σε αυτό το αίτημα.",
  date_overlap: "Έχεις ήδη επιβεβαιωμένη κράτηση που επικαλύπτεται με αυτές τις ημερομηνίες.",
  insufficient_wallet: "Δεν έχεις αρκετό υπόλοιπο wallet για το claim fee.",
  skipper_not_eligible: "Το προφίλ σου δεν είναι εγκεκριμένο.",
};

function PingsInbox({ skipperId, onClaimed }) {
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
    } catch (err) {
      const code = (err.message || "").match(/[a-z_]+/)?.[0];
      setError(CLAIM_ERRORS[code] || err.message || String(err));
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
              <button style={button("primary")} disabled={busyId === r.id} onClick={() => handleClaim(r.id)}>
                {busyId === r.id ? "..." : "Διεκδίκηση"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MissingProfile({ userRow, refresh, loadError }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A failed read is a different problem from a genuinely absent row —
  // creating a second profile would not fix it and may not even be possible.
  if (loadError) {
    return (
      <div style={container}>
        <h1 style={h1}>Πίνακας Skipper</h1>
        <div style={{ ...card, borderColor: colors.danger }}>
          <b>Δεν ήταν δυνατή η φόρτωση του προφίλ σου.</b>
          <p style={muted}>Σφάλμα από τη βάση δεδομένων:</p>
          <p style={{ color: colors.danger, fontFamily: "monospace", fontSize: 13, wordBreak: "break-word" }}>
            {loadError}
          </p>
          <button style={button("secondary")} onClick={refresh}>
            Δοκίμασε ξανά
          </button>
        </div>
      </div>
    );
  }

  async function recreate() {
    setBusy(true);
    setError("");
    try {
      await createMissingProfile("skipper");
      await refresh();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={container}>
      <h1 style={h1}>Πίνακας Skipper</h1>
      <div style={{ ...card, borderColor: colors.danger }}>
        <b>Δεν βρέθηκε προφίλ skipper για τον λογαριασμό σου.</b>
        <p style={muted}>
          Ο λογαριασμός σου υπάρχει, αλλά η γραμμή προφίλ δεν δημιουργήθηκε (π.χ. λόγω διακοπής κατά την
          εγγραφή). Πάτα το κουμπί για να τη φτιάξουμε τώρα.
        </p>
        <button style={button("primary")} disabled={busy} onClick={recreate}>
          {busy ? "..." : "Δημιουργία προφίλ skipper"}
        </button>
        {error && <p style={{ color: colors.danger, marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  );
}

export default function SkipperDashboard() {
  const { session, profile, userRow, loading, refresh, loadError } = useAuth();
  const [bookings, setBookings] = useState([]);

  async function loadBookings() {
    if (profile?.id) setBookings(await listMyBookingsAsSkipper(profile.id));
  }
  useEffect(() => {
    loadBookings();
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
          <BookingPanel key={b.id} booking={b} viewerRole="skipper" viewerUserId={userRow.id} onChanged={loadBookings} />
        ))}
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
          marginTop: 32,
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
        <AvailabilityCalendar skipperId={profile.id} bookings={bookings} onChanged={loadBookings} />
      </div>
    </div>
  );
}
