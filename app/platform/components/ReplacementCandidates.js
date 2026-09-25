"use client";
import { useEffect, useState } from "react";
import {
  getOpenReplacementOffer,
  clientListReplacementCandidates,
  clientSelectReplacementCandidate,
} from "../../../lib/platform/db";
import { computeCrewHighlights } from "../../../lib/platform/roles";
import { card, muted, button, badge, colors, money } from "../../../lib/platform/theme";
import Stars from "./Stars";
import { useConfirm } from "./ConfirmDialog";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { formatDateTime } from "../../../lib/platform/notifications";

const SELECT_ERRORS = {
  request_not_open: "Η επιλογή δεν έγινε — είτε διάλεξες ήδη, είτε η πρόταση έκλεισε.",
  decision_window_closed: "Πέρασε η προθεσμία επιλογής. Ψάχνουμε ξανά και θα σε ειδοποιήσουμε.",
  case_closed: "Η αναζήτηση αντικαταστάτη έχει κλείσει.",
  already_covered: "Η κράτηση καλύφθηκε ήδη με άλλον τρόπο.",
  not_a_candidate: "Αυτός δεν είναι πια διαθέσιμος. Διάλεξε από τη λίστα από κάτω.",
  candidate_no_longer_eligible: "Αυτός ο επαγγελματίας δεν είναι πια διαθέσιμος.",
  candidate_no_longer_available: "Αυτός ο επαγγελματίας έχει πλέον άλλη κράτηση στις ίδιες ημερομηνίες.",
  candidate_cannot_pay: "Αυτός ο επαγγελματίας δεν μπορεί πλέον να αναλάβει.",
};

function identityLine(s) {
  const parts = [];
  if (s.nationality_country) parts.push(`${s.nationality_flag ? s.nationality_flag + " " : ""}${s.nationality_country}`);
  if (s.age) parts.push(`${s.age} ετών`);
  if (s.languages?.length > 0) parts.push(s.languages.join(", "));
  return parts.join(" · ");
}

// Κάρτα υποψηφίου αντικαταστάτη — ίδια ανώνυμα στοιχεία με την αναζήτηση
// (skipper_public): καμία φωτογραφία, όνομα ή τηλέφωνο. Αυτά αποκαλύπτονται
// μόνο μετά την επιβεβαίωση, ακριβώς όπως σε κάθε άλλη κράτηση.
function CandidateCard({ s, days, busy, onSelect }) {
  const highlights = computeCrewHighlights(s);
  return (
    <div style={{ ...card, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...money, fontSize: 18, fontWeight: 700 }}>
            {s.price_per_day}€<span style={{ ...muted, fontFamily: "inherit", fontSize: 13, fontWeight: 400 }}> /ημέρα</span>
          </div>
          {days > 0 && (
            <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>
              <span style={money}>{Number(s.price_per_day) * days}€</span> για {days} {days === 1 ? "ημέρα" : "ημέρες"}
            </div>
          )}
          {identityLine(s) && <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>{identityLine(s)}</div>}
          <div style={{ margin: "8px 0" }}>
            <Stars rating={s.rating_avg} count={s.rating_count} size={14} />
          </div>
          {s.reliability_percentage != null && (
            <div style={{ ...muted, fontSize: 12.5 }}>
              <span style={{ ...money, color: colors.ink }}>{s.reliability_percentage}%</span> αξιοπιστία
            </div>
          )}
          {highlights.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {highlights.map((h) => (
                <span key={h} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}>
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>
        <button style={{ ...button("primary"), flexShrink: 0 }} disabled={busy} onClick={onSelect}>
          {busy ? "…" : "Επιβεβαίωση"}
        </button>
      </div>
    </div>
  );
}

// Εμφανίζεται στην κάρτα μιας κράτησης που ακύρωσε ο επαγγελματίας, όσο
// υπάρχει ανοιχτή πρόταση αντικατάστασης με τουλάχιστον έναν υποψήφιο.
// Ξεχωριστό component (όχι inline στο BookingPanel) γιατί φέρνει δικά του
// δεδομένα ασύγχρονα, ανεξάρτητα από το αν η κράτηση είναι ανοιχτή/κλειστή.
function tripDays(start, end) {
  if (!start || !end) return 0;
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

export default function ReplacementCandidates({ bookingId, startDate, endDate, onChanged }) {
  const [offer, setOffer] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  async function load() {
    try {
      const o = await getOpenReplacementOffer(bookingId);
      setOffer(o);
      setCandidates(o ? await clientListReplacementCandidates(o.id) : []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function handleSelect(skipperId) {
    if (
      !(await confirm(
        "Επιβεβαίωση αυτού του επαγγελματία; Η κράτηση κλειδώνει αμέσως μαζί του και δεν αλλάζει ξανά.",
        { tone: "primary", confirmLabel: "Ναι, αυτόν" }
      ))
    )
      return;
    setBusyId(skipperId);
    setError("");
    try {
      await clientSelectReplacementCandidate(offer.id, skipperId);
      onChanged?.();
    } catch (err) {
      const code = (err.message || "").match(/[a-z_]+/)?.[0];
      setError(SELECT_ERRORS[code] || friendlyError(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!loaded || candidates.length === 0) return null;

  return (
    <div style={{ padding: "0 18px 14px" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ ...card, background: "#FBF6EC", borderColor: colors.accent, padding: "14px 16px", marginBottom: 12 }}>
        <b style={{ fontWeight: 600, fontSize: 14 }}>
          {candidates.length === 1 ? "Βρέθηκε ένας διαθέσιμος αντικαταστάτης" : `Βρέθηκαν ${candidates.length} διαθέσιμοι αντικαταστάτες`}
        </b>
        {offer?.client_decide_by && (
          <p style={{ fontSize: 13, margin: "6px 0 0", color: colors.ink }}>
            Διάλεξε έως <b style={{ fontWeight: 600 }}>{formatDateTime(offer.client_decide_by)}</b> — μετά οι επιλογές
            λήγουν και ψάχνουμε ξανά.
          </p>
        )}
        <p style={{ ...muted, fontSize: 13, margin: "6px 0 0", lineHeight: 1.5 }}>
          Δες τις επιλογές — χωρίς όνομα ή τηλέφωνο, όπως και στην αναζήτηση. Δεν πληρώνεις τίποτα επιπλέον. Μόλις
          επιβεβαιώσεις έναν, η κράτηση κλειδώνει μαζί του και οι υπόλοιποι σταματούν να είναι διαθέσιμοι.
        </p>
      </div>
      {error && <p style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>{error}</p>}
      {candidates.map((s) => (
        <CandidateCard
          key={s.id}
          s={s}
          days={tripDays(startDate, endDate)}
          busy={busyId !== null}
          onSelect={() => handleSelect(s.id)}
        />
      ))}
      {confirmDialog}
    </div>
  );
}
