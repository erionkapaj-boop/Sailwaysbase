"use client";
import TrustLine from "./TrustLine";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
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

const SELECT_ERROR_CODES = [
  "request_not_open",
  "decision_window_closed",
  "case_closed",
  "already_covered",
  "not_a_candidate",
  "candidate_no_longer_eligible",
  "candidate_no_longer_available",
  "candidate_cannot_pay",
];

function identityLine(s, t) {
  const parts = [];
  if (s.nationality_country) parts.push(`${s.nationality_flag ? s.nationality_flag + " " : ""}${s.nationality_country}`);
  if (s.age) parts.push(t("age", { age: s.age }));
  if (s.languages?.length > 0) parts.push(s.languages.join(", "));
  return parts.join(" · ");
}

// Κάρτα υποψηφίου αντικαταστάτη — ίδια ανώνυμα στοιχεία με την αναζήτηση
// (skipper_public): καμία φωτογραφία, όνομα ή τηλέφωνο. Αυτά αποκαλύπτονται
// μόνο μετά την επιβεβαίωση, ακριβώς όπως σε κάθε άλλη κράτηση.
function CandidateCard({ s, days, busy, onSelect }) {
  const t = useTranslations("ReplacementCandidates");
  const highlights = computeCrewHighlights(s);
  return (
    <div style={{ ...card, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...money, fontSize: 18, fontWeight: 700 }}>
            {s.price_per_day}€<span style={{ ...muted, fontFamily: "inherit", fontSize: 13, fontWeight: 400 }}> {t("perDay")}</span>
          </div>
          {days > 0 && (
            <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>
              <span style={money}>{Number(s.price_per_day) * days}€</span> {t("forDays", { days })}
            </div>
          )}
          {identityLine(s, t) && <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>{identityLine(s, t)}</div>}
          <div style={{ margin: "8px 0" }}>
            <Stars rating={s.rating_avg} count={s.rating_count} size={14} />
          </div>
                    <TrustLine s={s} />
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
          {busy ? "…" : t("confirm")}
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
  const t = useTranslations("ReplacementCandidates");
  const f = useFormat();
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
        t("confirmQuestion"),
        { tone: "primary", confirmLabel: t("confirmYes") }
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
      setError(SELECT_ERROR_CODES.includes(code) ? t(code) : friendlyError(err));
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
          {t("found", { count: candidates.length })}
        </b>
        {offer?.client_decide_by && (
          <p style={{ fontSize: 13, margin: "6px 0 0", color: colors.ink }}>
            {t.rich("decideBy", { date: f.dateTime(offer.client_decide_by), b: (c) => <b style={{ fontWeight: 600 }}>{c}</b> })}
          </p>
        )}
        <p style={{ ...muted, fontSize: 13, margin: "6px 0 0", lineHeight: 1.5 }}>
          {t("noExtraCharge")}
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
