"use client";
import { useCallback, useEffect, useState } from "react";
import { Toolbar, Row, RowMain, Empty, colors, muted, money, button } from "./ui";
import { CREW_ROLES, labelForRole } from "../../../lib/platform/roles";
import {
  adminSearchAvailability,
  adminCreateOffer,
  adminAssignReplacement,
  adminListSettings,
  listLookups,
} from "../../../lib/platform/db";

// Picking people and sending them a job is one action with two starting
// points — a cancellation that needs covering, and a charter of your own — so
// it is one component. Written twice it would have drifted: the fee rule, the
// expiry clamp and the "who is actually free" query all have to stay identical
// whichever screen you came from.

const control = {
  padding: "8px 11px",
  fontSize: 14,
  fontFamily: "inherit",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: colors.card,
  color: colors.ink,
  boxSizing: "border-box",
  minWidth: 0,
};

// Same dense control, but for a <select>: redraws the arrow by hand instead
// of the raw per-browser default, matching the fix applied to every other
// dropdown on the platform.
const selectControl = {
  ...control,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  paddingRight: 28,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${colors.inkSoft.replace(
    "#",
    "%23"
  )}' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 9px center",
  cursor: "pointer",
};

const ERRORS = {
  already_covered: "Έχει ήδη καλυφθεί από κάποιον άλλον.",
  offer_already_open: "Υπάρχει ήδη ανοιχτή πρόταση για αυτή την ακύρωση — απόσυρέ την πρώτα.",
  skipper_already_booked: "Έχει ήδη κράτηση σε αυτές τις ημερομηνίες.",
  skipper_not_eligible: "Το προφίλ του δεν είναι εγκεκριμένο.",
  invalid_skipper_selection: "Κάποιος από τους επιλεγμένους δεν είναι εγκεκριμένος.",
  cannot_hire_self: "Δεν μπορείς να αναθέσεις δουλειά στον εαυτό σου.",
  not_awaiting_cover: "Αυτή η κράτηση δεν περιμένει κάλυψη.",
  role_mismatch: "Κάποιος από τους επιλεγμένους έχει άλλη ιδιότητα από τη ζητούμενη.",
  missing_job_details: "Συμπλήρωσε ημερομηνίες, λιμάνι και τύπο σκάφους.",
  invalid_date_range: "Η λήξη είναι πριν από την έναρξη.",
  no_skippers_selected: "Δεν έχεις επιλέξει κανέναν.",
};

function message(err) {
  const code = (err.message || "").match(/[a-z_]+/)?.[0];
  return ERRORS[code] || err.message || String(err);
}

export default function OfferComposer({ job = null, onDone }) {
  const replacing = Boolean(job);

  const [lookups, setLookups] = useState({ boatTypes: [], ports: [] });
  const [defaultFee, setDefaultFee] = useState(null);

  const [role, setRole] = useState(job?.crew_role || "skipper");
  const [startDate, setStartDate] = useState(job?.start_date || "");
  const [endDate, setEndDate] = useState(job?.end_date || "");
  const [portId, setPortId] = useState(job?.port_id || "");
  const [boatTypeId, setBoatTypeId] = useState("");

  const [results, setResults] = useState(null);
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const [fee, setFee] = useState("");
  const [expiresHours, setExpiresHours] = useState(24);

  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!replacing) listLookups().then(setLookups).catch(() => {});
    adminListSettings()
      .then((rows) => setDefaultFee(rows.find((r) => r.key === "skipper_claim_fee")?.value ?? null))
      .catch(() => {});
  }, [replacing]);

  const search = useCallback(
    async (e) => {
      e?.preventDefault();
      if (!startDate || !endDate) return;
      setBusy(true);
      setError("");
      setPicked([]);
      try {
        setResults(
          await adminSearchAvailability({
            role,
            startDate,
            endDate,
            // A replacement is tied to its port; a charter of your own is not
            // necessarily, so leaving it blank means "anywhere".
            portId: (replacing ? job?.port_id : portId) || null,
          })
        );
      } catch (err) {
        setError(message(err));
      } finally {
        setBusy(false);
      }
    },
    [role, startDate, endDate, portId, replacing, job?.port_id]
  );

  // A cancellation arrives with its dates already known; there is nothing to
  // fill in, so the list is there when the row opens.
  useEffect(() => {
    if (replacing && job?.start_date && job?.end_date) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.booking_id]);

  function toggle(id) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function send() {
    if (picked.length === 0) return;
    setSending(true);
    setError("");
    try {
      await adminCreateOffer({
        skipperIds: picked,
        role,
        startDate,
        endDate,
        portId: portId || null,
        boatTypeId: boatTypeId || null,
        replacesBookingId: job?.booking_id || null,
        claimFee: fee === "" ? null : fee,
        note,
        expiresHours: Number(expiresHours),
      });
      setPicked([]);
      setNote("");
      setResults(null);
      onDone?.();
    } catch (err) {
      setError(message(err));
    } finally {
      setSending(false);
    }
  }

  // Kept alongside the offer, not replaced by it: this is the case where you
  // already sorted it out on the phone and only need the booking to exist.
  // Nobody is charged, because nobody accepted anything here.
  async function assignDirect(skipperId) {
    setAssigningId(skipperId);
    setError("");
    try {
      await adminAssignReplacement(job.booking_id, skipperId);
      onDone?.();
    } catch (err) {
      setError(message(err));
    } finally {
      setAssigningId(null);
    }
  }

  const feeShown = fee === "" ? defaultFee : Number(fee);
  // The search happily answers "who is free anywhere", but a job has a place
  // — and, for a skipper, a boat — that booking_requests has never allowed
  // to be unknown. So the gap is stated here rather than left to come back
  // as a database error after you have already chosen the people. A boat
  // type only means anything for a skipper; hostess (or any future
  // non-skipper role) doesn't operate one.
  const missingDetails = !replacing && (!portId || (role === "skipper" && !boatTypeId));

  return (
    <>
      <Toolbar>
        <form onSubmit={search} style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
          <select
            style={{ ...selectControl, flex: "1 1 130px" }}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={replacing}
          >
            {CREW_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            style={{ ...control, flex: "1 1 140px" }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={replacing}
          />
          <input
            type="date"
            style={{ ...control, flex: "1 1 140px" }}
            min={startDate || undefined}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={replacing}
          />
          {!replacing && (
            <>
              <select
                style={{ ...selectControl, flex: "1 1 160px" }}
                value={portId}
                onChange={(e) => setPortId(e.target.value)}
              >
                <option value="">Οποιοδήποτε λιμάνι</option>
                {lookups.ports.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {role === "skipper" && (
                <select
                  style={{ ...selectControl, flex: "1 1 150px" }}
                  value={boatTypeId}
                  onChange={(e) => setBoatTypeId(e.target.value)}
                >
                  <option value="">Τύπος σκάφους…</option>
                  {lookups.boatTypes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          <button type="submit" style={button("secondary")} disabled={busy}>
            {busy ? "…" : "Ποιοι είναι ελεύθεροι"}
          </button>
        </form>
      </Toolbar>

      {error && <p style={{ color: colors.danger, fontSize: 13, padding: "10px 16px", margin: 0 }}>{error}</p>}
      {results === null && <Empty>Διάλεξε ιδιότητα και ημερομηνίες.</Empty>}
      {results?.length === 0 && <Empty>Κανένας διαθέσιμος για αυτές τις ημερομηνίες.</Empty>}

      {results?.map((s) => {
        const on = picked.includes(s.skipper_id);
        return (
          <Row key={s.skipper_id} tone={on ? "attention" : undefined}>
            <label style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flex: 1, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(s.skipper_id)}
                style={{ width: 16, height: 16, flexShrink: 0, accentColor: colors.ink }}
              />
              <RowMain
                title={s.full_name || "(χωρίς όνομα)"}
                meta={
                  <>
                    <span style={money}>{s.phone_number}</span> · <span style={money}>{s.price_per_day}€</span>/ημέρα ·{" "}
                    {labelForRole(s.crew_role)}
                    {s.rating_count > 0 ? (
                      <>
                        {" · "}
                        <span style={money}>{Number(s.rating_avg).toFixed(1)}</span>★ (
                        <span style={money}>{s.rating_count}</span>)
                      </>
                    ) : (
                      " · χωρίς αξιολογήσεις"
                    )}
                    {s.reliability_percentage != null && (
                      <>
                        {" · "}
                        <span style={money}>{s.reliability_percentage}%</span> αξιοπιστία
                      </>
                    )}
                  </>
                }
              />
            </label>
            {replacing && (
              <button
                style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12, flexShrink: 0 }}
                disabled={assigningId === s.skipper_id}
                onClick={() => assignDirect(s.skipper_id)}
                title="Το έκλεισες στο τηλέφωνο — γράψε την κράτηση χωρίς χρέωση και χωρίς αποδοχή."
              >
                {assigningId === s.skipper_id ? "…" : "Άμεση ανάθεση"}
              </button>
            )}
          </Row>
        );
      })}

      {results?.length > 0 && (
        <div style={{ padding: 16, borderTop: `1px solid ${colors.border}`, background: colors.bg }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ ...muted, fontSize: 12, flex: "2 1 220px" }}>
              Σημείωμα προς τον επαγγελματία
              <input
                style={{ ...control, width: "100%", marginTop: 4 }}
                placeholder="π.χ. Ναύλο 4 ημερών, οικογένεια με 2 παιδιά"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label style={{ ...muted, fontSize: 12, flex: "1 1 130px" }}>
              Χρέωση αποδοχής (€)
              <input
                type="number"
                min={0}
                style={{ ...control, width: "100%", marginTop: 4 }}
                placeholder={defaultFee != null ? String(defaultFee) : "προεπιλογή"}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </label>
            <label style={{ ...muted, fontSize: 12, flex: "1 1 130px" }}>
              Ισχύει για
              <select
                style={{ ...selectControl, width: "100%", marginTop: 4 }}
                value={expiresHours}
                onChange={(e) => setExpiresHours(e.target.value)}
              >
                <option value={3}>3 ώρες</option>
                <option value={12}>12 ώρες</option>
                <option value={24}>24 ώρες</option>
                <option value={48}>48 ώρες</option>
              </select>
            </label>
          </div>

          {/* Said out loud before you send it, because it is the part that
              costs someone money and the part they will ask you about. */}
          <p style={{ ...muted, fontSize: 12.5, margin: "0 0 10px" }}>
            {missingDetails
              ? "Για να σταλεί η πρόταση χρειάζεται συγκεκριμένο λιμάνι και τύπος σκάφους."
              : picked.length === 0
              ? "Διάλεξε ποιοι θα τη λάβουν. Τη δουλειά την παίρνει όποιος αποδεχτεί πρώτος."
              : feeShown === 0
              ? `Θα σταλεί σε ${picked.length} άτομα χωρίς χρέωση. Την παίρνει όποιος αποδεχτεί πρώτος.`
              : `Θα σταλεί σε ${picked.length} άτομα. Όποιος αποδεχτεί πρώτος πληρώνει ${feeShown ?? "—"}€ και οι υπόλοιποι δεν χρεώνονται.`}
          </p>

          <button
            style={button("primary")}
            disabled={sending || picked.length === 0 || missingDetails}
            onClick={send}
          >
            {sending ? "Αποστολή…" : `Αποστολή πρότασης${picked.length ? ` (${picked.length})` : ""}`}
          </button>
        </div>
      )}
    </>
  );
}
