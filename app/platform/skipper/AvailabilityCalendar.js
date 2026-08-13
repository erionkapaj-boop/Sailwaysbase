"use client";
import { useEffect, useState } from "react";
import {
  listAvailabilityWindows,
  addAvailabilityWindow,
  removeAvailabilityWindow,
  listLookups,
} from "../../../lib/platform/db";
import {
  card,
  sectionLabel,
  muted,
  button,
  colors,
  radius,
  fontSerif,
  fontMono,
  calendarDay,
  shadow,
} from "../../../lib/platform/theme";

const WEEKDAYS = ["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"];
const MONTH_NAMES = [
  "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
  "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
];

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

export default function AvailabilityCalendar({ skipperId, bookings = [], onChanged }) {
  const [windows, setWindows] = useState([]);
  const [ports, setPorts] = useState([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selStart, setSelStart] = useState(null);
  const [detail, setDetail] = useState(null); // date string
  const [sheet, setSheet] = useState(null); // { startDate, endDate, bulk }
  const [sheetAllPorts, setSheetAllPorts] = useState(false);
  const [sheetPortIds, setSheetPortIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setWindows(await listAvailabilityWindows(skipperId));
    } catch (err) {
      setError(err.message || String(err));
    }
  }
  useEffect(() => {
    load();
    listLookups().then((l) => setPorts(l.ports)).catch(() => {});
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
  function cellState(dateStr) {
    if (isBooked(dateStr)) return "booked";
    if (windowsFor(dateStr).length > 0) return "available";
    return "empty";
  }
  // Identifies which window(s)/ports cover a day, so consecutive days that
  // belong to the same declared block can be told apart from a boundary
  // into a different one (different ports, or a gap).
  function daySignature(dateStr) {
    const ws = windowsFor(dateStr);
    if (ws.length === 0) return null;
    if (ws.some((w) => w.all_ports)) return "ALL";
    const names = [
      ...new Set(ws.flatMap((w) => (w.availability_window_ports || []).map((p) => p.ports?.name).filter(Boolean))),
    ].sort();
    return names.join(",");
  }
  function dayLabel(dateStr) {
    const ws = windowsFor(dateStr);
    if (ws.length === 0) return null;
    if (ws.some((w) => w.all_ports)) return "Παντού";
    const names = [
      ...new Set(ws.flatMap((w) => (w.availability_window_ports || []).map((p) => p.ports?.name).filter(Boolean))),
    ];
    if (names.length === 0) return null;
    return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
  }

  function monthDayKeys() {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const keys = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) keys.push(fmt(d));
    return keys;
  }
  // Splits the visible month into contiguous non-booked runs, so a booked
  // day in the middle of the month doesn't block bulk-marking the rest of it.
  function bulkRanges() {
    const keys = monthDayKeys();
    const ranges = [];
    let runStart = null;
    for (let i = 0; i < keys.length; i++) {
      const booked = isBooked(keys[i]);
      if (!booked && runStart === null) runStart = keys[i];
      if (booked && runStart !== null) {
        ranges.push([runStart, keys[i - 1]]);
        runStart = null;
      }
    }
    if (runStart !== null) ranges.push([runStart, keys[keys.length - 1]]);
    return ranges;
  }
  function bookedInRange(a, b) {
    const [start, end] = a <= b ? [a, b] : [b, a];
    for (let d = parseISO(start); fmt(d) <= end; d.setDate(d.getDate() + 1)) {
      if (isBooked(fmt(d))) return true;
    }
    return false;
  }

  function onDayClick(dateStr) {
    if (dateStr < today) return;
    setError("");
    const state = cellState(dateStr);
    if (state === "booked") return;

    if (selStart) {
      if (bookedInRange(selStart, dateStr)) {
        setError("Το διάστημα περιλαμβάνει ημέρες με κράτηση — δοκίμασε γύρω τους.");
        setSelStart(null);
        return;
      }
      const [start, end] = selStart <= dateStr ? [selStart, dateStr] : [dateStr, selStart];
      setSheet({ startDate: start, endDate: end });
      setSelStart(null);
      return;
    }

    if (state === "available") {
      setDetail(dateStr);
      return;
    }
    setSelStart(dateStr);
  }

  function openBulkSheet() {
    setError("");
    setSheet({ bulk: true });
  }

  async function confirmSheet() {
    if (!sheetAllPorts && sheetPortIds.length === 0) {
      setError("Διάλεξε τουλάχιστον ένα λιμάνι, ή «Από οπουδήποτε».");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ranges = sheet.bulk ? bulkRanges() : [[sheet.startDate, sheet.endDate]];
      for (const [startDate, endDate] of ranges) {
        await addAvailabilityWindow(skipperId, { startDate, endDate, allPorts: sheetAllPorts, portIds: sheetPortIds });
      }
      closeSheet();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }
  function closeSheet() {
    setSheet(null);
    setSheetAllPorts(false);
    setSheetPortIds([]);
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

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const gridDays = [];
  for (let i = 0; i < offset; i++) gridDays.push(null);
  for (let d = 1; d <= last.getDate(); d++) gridDays.push(new Date(month.getFullYear(), month.getMonth(), d));

  const portsByRegion = ports.reduce((acc, p) => {
    (acc[p.region || "Άλλα"] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div style={{ ...card, position: "relative" }}>
      <h2 style={sectionLabel}>Διαθεσιμότητα</h2>
      <p style={{ ...muted, fontSize: 13, margin: "0 0 16px" }}>
        Πάτα μια ελεύθερη ημέρα για αρχή διαστήματος, μετά μια δεύτερη για τέλος. Οι μπλε ημέρες έχουν
        ήδη επιβεβαιωμένη κράτηση και δεν αλλάζουν εδώ.
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} style={{ ...button("secondary"), padding: "6px 12px" }}>
          ‹
        </button>
        <span style={{ fontFamily: fontSerif, fontSize: 18 }}>
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </span>
        <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} style={{ ...button("secondary"), padding: "6px 12px" }}>
          ›
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8, width: "100%", boxSizing: "border-box" }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ ...muted, fontSize: 11, textAlign: "center", letterSpacing: "0.04em" }}>
            {w}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, width: "100%", boxSizing: "border-box" }}>
        {(() => {
          let prevSig = null;
          return gridDays.map((d, i) => {
            if (!d) {
              prevSig = null;
              return <div key={`e${i}`} />;
            }
            const key = fmt(d);
            const state = cellState(key);
            const isPast = key < today;
            const isSelStart = selStart === key;
            // A label repeats visual noise if shown on every day of the same
            // block — only the first day of a contiguous same-coverage run
            // gets it; the rest carry the fill colour alone.
            const sig = state === "available" ? daySignature(key) : null;
            const showLabel = state === "available" && sig !== prevSig;
            prevSig = sig;
            const label = showLabel ? dayLabel(key) : null;
            const tone = state === "booked" ? calendarDay.booked : state === "available" ? calendarDay.available : null;

            return (
              <button
                key={key}
                type="button"
                disabled={state === "booked" || isPast}
                onClick={() => onDayClick(key)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  boxSizing: "border-box",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  minHeight: 50,
                  padding: 2,
                  borderRadius: radius.sm,
                  border: `1px solid ${isSelStart ? colors.accent : "transparent"}`,
                  fontFamily: "inherit",
                  cursor: state === "booked" || isPast ? "default" : "pointer",
                  background: tone?.bg ?? "transparent",
                  color: isPast ? colors.inkSoft : tone?.fg ?? colors.inkSoft,
                  opacity: isPast ? 0.35 : 1,
                }}
              >
                <span style={{ fontFamily: fontMono, fontSize: 12 }}>{d.getDate()}</span>
                {label && (
                  <span style={{ fontSize: 9, lineHeight: 1.1, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                )}
              </button>
            );
          });
        })()}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: colors.inkSoft }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: calendarDay.available.bg, display: "inline-block" }} />
            Διαθέσιμο
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: colors.inkSoft }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: calendarDay.booked.bg, display: "inline-block" }} />
            Κράτηση
          </span>
        </div>
        {selStart ? (
          <button type="button" style={{ ...button("secondary"), padding: "6px 12px", fontSize: 13 }} onClick={() => setSelStart(null)}>
            Άκυρο ({selStart})
          </button>
        ) : (
          <button type="button" style={{ ...button("secondary"), padding: "6px 12px", fontSize: 13 }} onClick={openBulkSheet}>
            Μαρκάρισε όλο τον μήνα
          </button>
        )}
      </div>

      {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}

      {/* Tap on an already-declared day: view what's covering it, delete it,
          or start a fresh (possibly overlapping) range from that date — an
          overlap is how a second port gets added over the same period. */}
      {detail && (
        <div style={sheetOverlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ ...sectionLabel, margin: "0 0 10px" }}>{detail}</h3>
            {windowsFor(detail).map((w) => (
              <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: 13 }}>
                  {w.start_date} → {w.end_date}
                  <br />
                  <span style={{ ...muted, fontSize: 12 }}>
                    {w.all_ports ? "Από οπουδήποτε" : (w.availability_window_ports || []).map((p) => p.ports?.name).join(", ")}
                  </span>
                </span>
                <button type="button" disabled={busy} style={{ ...button("secondary"), padding: "6px 10px", fontSize: 12 }} onClick={() => removeWindow(w.id)}>
                  Διαγραφή
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                type="button"
                style={{ ...button("secondary"), flex: 1 }}
                onClick={() => {
                  setSelStart(detail);
                  setDetail(null);
                }}
              >
                + Νέο διάστημα από εδώ
              </button>
              <button type="button" style={button("primary")} onClick={() => setDetail(null)}>
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm sheet — shared by manual range selection and the bulk
          "mark month" shortcut. */}
      {sheet && (
        <div style={sheetOverlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ ...sectionLabel, margin: "0 0 10px" }}>
              {sheet.bulk ? `Όλος ο ${MONTH_NAMES[month.getMonth()]}` : `${sheet.startDate} → ${sheet.endDate}`}
            </h3>
            <button
              type="button"
              style={{ ...chip(sheetAllPorts), marginBottom: 10 }}
              onClick={() => {
                setSheetAllPorts((v) => !v);
                setSheetPortIds([]);
              }}
            >
              Από οπουδήποτε
            </button>
            {!sheetAllPorts && (
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {Object.entries(portsByRegion).map(([region, list]) => (
                  <div key={region} style={{ marginBottom: 10 }}>
                    <div style={{ ...muted, fontSize: 12, marginBottom: 6 }}>{region}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {list.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          style={chip(sheetPortIds.includes(p.id))}
                          onClick={() =>
                            setSheetPortIds((ids) => (ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]))
                          }
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 10 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" disabled={busy} style={{ ...button("primary"), flex: 1 }} onClick={confirmSheet}>
                {busy ? "Αποθήκευση…" : "Αποθήκευση"}
              </button>
              <button type="button" style={button("secondary")} onClick={closeSheet}>
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
  maxHeight: "80vh",
  overflowY: "auto",
};
