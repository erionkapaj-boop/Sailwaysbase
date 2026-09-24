"use client";
import { useEffect, useState } from "react";
import {
  listAvailabilityWindows,
  addAvailabilityWindow,
  removeAvailabilityWindow,
  listAvailabilityBlocks,
  addAvailabilityBlock,
  removeAvailabilityBlock,
  listLookups,
} from "../../../lib/platform/db";
import DateRangeCalendar from "../components/DateRangeCalendar";
import { CalendarStyles, MonthNav, MonthGrid, TONES, addDaysKey } from "../components/calendar/Calendar";
import {
  card,
  sectionLabel,
  muted,
  button,
  colors,
  radius,
  fontSans,
  shadow,
} from "../../../lib/platform/theme";
import { formatDate, formatDateRange } from "../../../lib/platform/notifications";


function pad(n) {
  return String(n).padStart(2, "0");
}
// Local-date formatting throughout — toISOString() converts to UTC and can
// shift the day near midnight, which is exactly wrong for a date picker.
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

const chip = (active) => ({
  padding: "8px 14px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});


// ----------------------------------------------------------------------------
// Ζητήθηκε ρητά: το ημερολόγιο να μοιάζει με ό,τι χρησιμοποιεί κανείς
// καθημερινά για να κλείσει διακοπές/ξενοδοχείο, όχι με δικό του σύστημα
// που χρειάζεται εξήγηση. Η λύση δεν είναι να εξηγηθεί καλύτερα το παλιό
// σύστημα (δύο πατήματα πάνω στο πλέγμα, χωρίς ζωντανή προεπισκόπηση) —
// είναι να ΞΑΝΑΧΡΗΣΙΜΟΠΟΙΗΘΕΙ το ήδη υπάρχον, γνώριμο DateRangeCalendar
// (αυτό που βλέπει ο πελάτης όταν διαλέγει πότε θέλει πλήρωμα): πιάνεις
// μια ημέρα, βλέπεις το διάστημα να γεμίζει ζωντανά καθώς κινείσαι προς τη
// δεύτερη, ίδιο σε όλη την εφαρμογή.
//
// Το κύριο πλέγμα εδώ κάτω μένει ξεχωριστό ρόλο: δείχνει τι έχεις ήδη
// δηλώσει (διαθέσιμο/κλειστό/κράτηση), όχι πώς δηλώνεις κάτι καινούργιο.
// Η προσθήκη γίνεται πάντα μέσα από ένα από τα δύο ρητά κουμπιά από πάνω,
// ποτέ πατώντας απευθείας πάνω στο πλέγμα — έτσι δεν υπάρχει "λειτουργία"
// να θυμάται κανείς ότι είναι ενεργή.
// ----------------------------------------------------------------------------
export default function AvailabilityCalendar({ skipperId, bookings = [], onChanged }) {
  const [windows, setWindows] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [regions, setRegions] = useState([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [detail, setDetail] = useState(null); // date string — προβολή ήδη δηλωμένης ημέρας
  const [addSheet, setAddSheet] = useState(null); // "open" | "close" | null
  const [range, setRange] = useState({ startDate: "", endDate: "" });
  const [sheetRegionIds, setSheetRegionIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [w, b] = await Promise.all([listAvailabilityWindows(skipperId), listAvailabilityBlocks(skipperId)]);
      setWindows(w);
      setBlocks(b);
    } catch (err) {
      setError(err.message || String(err));
    }
  }
  useEffect(() => {
    load();
    listLookups().then((l) => setRegions(l.regions)).catch(() => {});
  }, [skipperId]);

  const today = fmt(new Date());

  function isBooked(dateStr) {
    return bookings.some(
      (b) =>
        (b.status === "confirmed" || b.status === "completed") &&
        b.start_date <= dateStr &&
        dateStr <= b.end_date
    );
  }
  function windowsFor(dateStr) {
    return windows.filter((w) => w.start_date <= dateStr && dateStr <= w.end_date);
  }
  function blocksFor(dateStr) {
    return blocks.filter((b) => b.start_date <= dateStr && dateStr <= b.end_date);
  }
  // A confirmed booking outranks everything (it's committed, not a
  // preference), then a self-imposed block, then the declared window.
  function cellState(dateStr) {
    if (isBooked(dateStr)) return "booked";
    if (blocksFor(dateStr).length > 0) return "blocked";
    if (windowsFor(dateStr).length > 0) return "available";
    return "empty";
  }
  // Identifies which window(s)/regions cover a day, so consecutive days that
  // belong to the same declared block can be told apart from a boundary
  // into a different one (different regions, or a gap).
  function daySignature(dateStr) {
    const ws = windowsFor(dateStr);
    if (ws.length === 0) return null;
    const names = [
      ...new Set(ws.flatMap((w) => (w.availability_window_regions || []).map((r) => r.regions?.name).filter(Boolean))),
    ].sort();
    return names.join(",");
  }
  function dayLabel(dateStr) {
    const ws = windowsFor(dateStr);
    if (ws.length === 0) return null;
    const names = [
      ...new Set(ws.flatMap((w) => (w.availability_window_regions || []).map((r) => r.regions?.name).filter(Boolean))),
    ];
    if (names.length === 0) return null;
    return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
  }

  function bookedInRange(a, b) {
    if (!a || !b) return false;
    const [start, end] = a <= b ? [a, b] : [b, a];
    for (let d = parseISO(start); fmt(d) <= end; d.setDate(d.getDate() + 1)) {
      if (isBooked(fmt(d))) return true;
    }
    return false;
  }

  function openAddSheet(kind, prefillStart) {
    setError("");
    setRange({ startDate: prefillStart || "", endDate: "" });
    setSheetRegionIds([]);
    setAddSheet(kind);
    setDetail(null);
  }
  function closeAddSheet() {
    setAddSheet(null);
    setRange({ startDate: "", endDate: "" });
    setSheetRegionIds([]);
  }

  async function confirmAdd() {
    setError("");
    if (!range.startDate || !range.endDate) {
      setError("Διάλεξε αρχή και τέλος διαστήματος στο ημερολόγιο παραπάνω.");
      return;
    }
    if (bookedInRange(range.startDate, range.endDate)) {
      setError("Το διάστημα περιλαμβάνει ημέρες με κράτηση. Διάλεξε άλλες μέρες.");
      return;
    }
    if (addSheet === "open" && sheetRegionIds.length === 0) {
      setError("Διάλεξε τουλάχιστον μία περιοχή.");
      return;
    }
    setBusy(true);
    try {
      if (addSheet === "open") {
        await addAvailabilityWindow(skipperId, { startDate: range.startDate, endDate: range.endDate, regionIds: sheetRegionIds });
      } else {
        await addAvailabilityBlock(skipperId, { startDate: range.startDate, endDate: range.endDate });
      }
      closeAddSheet();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function closeSingleDay(dateStr) {
    setBusy(true);
    setError("");
    try {
      await addAvailabilityBlock(skipperId, { startDate: dateStr, endDate: dateStr });
      setDetail(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reopenBlock(id) {
    setBusy(true);
    try {
      await removeAvailabilityBlock(id);
      await load();
      onChanged?.();
      setDetail(null);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeWindow(id) {
    setBusy(true);
    try {
      await removeAvailabilityWindow(id);
      await load();
      onChanged?.();
      setDetail(null);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  function onDayClick(dateStr) {
    if (dateStr < today) return;
    const state = cellState(dateStr);
    if (state === "booked") return;
    // Μια ήδη δηλωμένη ή κλειστή ημέρα ανοίγει την προβολή της (διαγραφή/
    // ξανά-άνοιγμα) — μια ελεύθερη ημέρα ανοίγει κατευθείαν τη γνώριμη
    // φόρμα προσθήκης, με αυτή την ημέρα ήδη προεπιλεγμένη ως αρχή.
    if (state === "empty") {
      openAddSheet("open", dateStr);
    } else {
      setDetail(dateStr);
    }
  }

  // Συνεχόμενες μέρες με την ίδια κατάσταση (και, για τη διαθεσιμότητα,
  // τις ίδιες περιοχές) σχηματίζουν μία λωρίδα με στρογγυλά άκρα.
  function runKey(key) {
    if (key < today) return null;
    const st = cellState(key);
    if (st === "empty") return null;
    return st === "available" ? `available:${daySignature(key)}` : st;
  }
  function availabilityDayProps(key) {
    const isPast = key < today;
    const state = cellState(key);
    const base = { disabled: isPast || state === "booked", onClick: onDayClick };
    if (isPast || state === "empty") return base;
    const me = runKey(key);
    const prevSame = runKey(addDaysKey(key, -1)) === me;
    const nextSame = runKey(addDaysKey(key, 1)) === me;
    const band = prevSame && nextSame ? "mid" : prevSame ? "end" : nextSame ? "start" : "single";
    return {
      ...base,
      band,
      tone: state,
      strike: state === "blocked",
      sub: state === "available" && !prevSame ? dayLabel(key) : null,
      ariaLabel: `${formatDate(key)}: ${state === "available" ? "διαθέσιμο" : state === "blocked" ? "κλειστό" : "κράτηση"}`,
    };
  }

  return (
    <div style={{ ...card, position: "relative" }}>
      <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
        Δήλωσε πότε είσαι διαθέσιμος για δουλειά ή κλείσε τις μέρες που λείπεις.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <button type="button" style={{ ...button("primary"), flex: "1 1 200px" }} onClick={() => openAddSheet("open")}>
          + Νέο διάστημα διαθεσιμότητας
        </button>
        <button type="button" style={{ ...button("secondary"), flex: "1 1 200px" }} onClick={() => openAddSheet("close")}>
          Δήλωσε απουσία
        </button>
      </div>

      <CalendarStyles />
      <MonthNav
        month={month}
        onPrev={() => setMonth((m) => addMonths(m, -1))}
        onNext={() => setMonth((m) => addMonths(m, 1))}
      />
      <MonthGrid month={month} dayProps={availabilityDayProps} />

      <div style={{ display: "flex", gap: 16, fontSize: 12.5, marginTop: 16, flexWrap: "wrap", color: colors.inkSoft }}>
        {[
          ["available", "Διαθέσιμο"],
          ["blocked", "Κλειστό"],
          ["booked", "Κράτηση"],
        ].map(([tone, text]) => (
          <span key={tone} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 18, height: 10, borderRadius: 5, background: TONES[tone].band, display: "inline-block" }} />
            {text}
          </span>
        ))}
      </div>

      {error && !addSheet && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}

      {/* Πάτημα σε ημέρα που ήδη έχει κάτι δηλωμένο: τι την καλύπτει, με
          δυνατότητα διαγραφής, ή ξεκίνα καινούργιο διάστημα από εδώ. */}
      {detail && (
        <div style={sheetOverlayStyle} onClick={() => setDetail(null)}>
          <div role="dialog" aria-modal="true" style={sheetStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ ...sectionLabel, margin: "0 0 10px" }}>{formatDate(detail)}</h3>

            {blocksFor(detail).map((b) => (
              <div
                key={b.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}
              >
                <span style={{ fontSize: 13 }}>
                  Κλειστό: {formatDateRange(b.start_date, b.end_date)}
                  <span style={{ ...muted, fontSize: 12, display: "block" }}>Δεν δέχεσαι κρατήσεις</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  style={{ ...button("secondary"), padding: "6px 10px", fontSize: 12 }}
                  onClick={() => reopenBlock(b.id)}
                >
                  Ξανα-άνοιγμα
                </button>
              </div>
            ))}

            {windowsFor(detail).map((w) => (
              <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: 13 }}>
                  {formatDateRange(w.start_date, w.end_date)}
                  <br />
                  <span style={{ ...muted, fontSize: 12 }}>
                    {(w.availability_window_regions || []).map((r) => r.regions?.name).join(", ")}
                  </span>
                </span>
                <button type="button" disabled={busy} style={{ ...button("secondary"), padding: "6px 10px", fontSize: 12 }} onClick={() => removeWindow(w.id)}>
                  Διαγραφή
                </button>
              </div>
            ))}
            {windowsFor(detail).length === 0 && blocksFor(detail).length === 0 && (
              <p style={{ ...muted, fontSize: 13 }}>Δεν έχεις δηλώσει τίποτα για αυτή την ημέρα.</p>
            )}

            {error && <p style={{ color: colors.danger, fontSize: 13, margin: "10px 0 0" }}>{error}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {cellState(detail) === "available" && (
                <button type="button" disabled={busy} style={{ ...button("secondary"), flex: 1 }} onClick={() => closeSingleDay(detail)}>
                  Κλείσε αυτή την ημέρα
                </button>
              )}
              <button type="button" style={{ ...button("secondary"), flex: 1 }} onClick={() => openAddSheet("open", detail)}>
                + Νέο διάστημα από εδώ
              </button>
              <button type="button" style={button("primary")} onClick={() => setDetail(null)}>
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Προσθήκη καινούργιου διαστήματος — ίδιο ημερολόγιο-με-ζωντανή-
          προεπισκόπηση που βλέπει ο πελάτης όταν κλείνει πλήρωμα, αντί για
          ξεχωριστό, άγνωστο σύστημα. */}
      {addSheet && (
        <div style={sheetOverlayStyle} onClick={closeAddSheet}>
          <div role="dialog" aria-modal="true" style={{ ...sheetStyle, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ ...sectionLabel, margin: "0 0 12px" }}>
              {addSheet === "open" ? "Νέο διάστημα διαθεσιμότητας" : "Δήλωσε απουσία"}
            </h3>

            <DateRangeCalendar
              startDate={range.startDate}
              endDate={range.endDate}
              minDate={today}
              startLabel="Από"
              endLabel="Έως"
              bare
              maxMonths={1}
              onChange={({ startDate, endDate }) => {
                setRange({ startDate, endDate });
                setError("");
              }}
            />

            {addSheet === "open" && (
              <div style={{ marginTop: 16 }}>
                <p style={{ ...muted, fontSize: 13, margin: "0 0 10px" }}>
                  Σε ποιες περιοχές είσαι διαθέσιμος. Ένας πελάτης που ζητά ένα λιμάνι
                  μέσα σε μια από αυτές θα σε βρίσκει, ακόμα κι αν δεν έχεις δηλώσει ποτέ εκείνο το λιμάνι.
                </p>
                <button
                  type="button"
                  style={{ ...chip(regions.length > 0 && sheetRegionIds.length === regions.length), marginBottom: 10 }}
                  onClick={() =>
                    setSheetRegionIds((ids) => (ids.length === regions.length ? [] : regions.map((r) => r.id)))
                  }
                >
                  Όλες οι περιοχές
                </button>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {regions.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      style={chip(sheetRegionIds.includes(r.id))}
                      onClick={() =>
                        setSheetRegionIds((ids) => (ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id]))
                      }
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" disabled={busy} style={{ ...button("primary"), flex: 1 }} onClick={confirmAdd}>
                {busy ? "Αποθήκευση…" : "Αποθήκευση"}
              </button>
              <button type="button" style={button("secondary")} onClick={closeAddSheet}>
                Άκυρο
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const sheetOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(22,40,60,0.35)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 40,
  padding: 16,
};
const sheetStyle = {
  background: colors.card,
  borderRadius: radius.lg,
  border: `1px solid ${colors.border}`,
  padding: 20,
  width: "100%",
  maxWidth: 440,
  boxShadow: shadow.raised,
  maxHeight: "85vh",
  overflowY: "auto",
};
