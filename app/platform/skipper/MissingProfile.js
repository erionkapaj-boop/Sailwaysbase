"use client";
import { useState } from "react";
import { createMissingProfile } from "../../../lib/platform/db";
import { container, card, h1, muted, button, colors } from "../../../lib/platform/theme";

// Its own module rather than a named export from the dashboard's page.js:
// the profile and wallet pages both need it, and importing from that page
// dragged the entire dashboard — calendar, booking panels, pings inbox —
// into their bundles for the sake of one error card.
export default function MissingProfile({ refresh, loadError, isAdmin = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A failed read is a different problem from a genuinely absent row —
  // creating a second profile would not fix it and may not even be possible.
  if (loadError) {
    return (
      <div style={container}>
        <h1 style={h1}>Πίνακας επαγγελματία</h1>
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

  // Two different people land here for two different reasons. A skipper
  // account without a profile row is a bug — the row should have been
  // created at registration and wasn't. An admin without one hasn't done
  // anything wrong; they just haven't opted into a professional profile
  // yet, which is a normal starting state, not an error to explain away.
  return (
    <div style={container}>
      <h1 style={h1}>{isAdmin ? "Προφίλ επαγγελματία" : "Πίνακας επαγγελματία"}</h1>
      <div style={{ ...card, borderColor: isAdmin ? colors.border : colors.danger }}>
        {isAdmin ? (
          <>
            <b>Δεν έχεις ακόμα προφίλ επαγγελματία.</b>
            <p style={muted}>
              Ο λογαριασμός σου διαχειρίζεται όλη την πλατφόρμα και μπορεί επίσης να κάνει κρατήσεις σαν πελάτης.
              Αν θέλεις να εμφανίζεσαι και να δέχεσαι δουλειές σαν επαγγελματίας, φτιάξε το προφίλ σου εδώ — θα
              χρειαστεί να το εγκρίνεις μετά από τις «Εγκρίσεις», όπως κάθε άλλο προφίλ.
            </p>
          </>
        ) : (
          <>
            <b>Δεν βρέθηκε προφίλ επαγγελματία για τον λογαριασμό σου.</b>
            <p style={muted}>
              Ο λογαριασμός σου υπάρχει, αλλά η γραμμή προφίλ δεν δημιουργήθηκε (π.χ. λόγω διακοπής κατά την
              εγγραφή). Πάτα το κουμπί για να τη φτιάξουμε τώρα.
            </p>
          </>
        )}
        <button style={button("primary")} disabled={busy} onClick={recreate}>
          {busy ? "..." : "Δημιουργία προφίλ επαγγελματία"}
        </button>
        {error && <p style={{ color: colors.danger, marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  );
}
