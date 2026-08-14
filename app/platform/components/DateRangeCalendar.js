"use client";
import { useState } from "react";
import { card, muted, button, colors, radius, fontSans, fontMono, calendarDay } from "../../../lib/platform/theme";

const WEEKDAYS = ["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"];
const MONTH_NAMES = [
  "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
  "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
];

const pad = (n) => String(n).padStart(2, "0");
// Local formatting — toISOString() shifts to UTC and can land on the wrong
// day near midnight, which is precisely wrong for picking dates.
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

// Two taps make a range, same gesture as the availability calendar so the
// two never have to be learned separately. Replaces a pair of native date
// inputs, which on mobile means two modal pickers and no sense of how long
// the trip actually is.
export default function DateRangeCalendar({ startDate, endDate, onChange, minDate }) {
  const today = fmt(new Date());
  const floor = minDate || today;
  const [month, setMonth] = useState(() => {
    const anchor = startDate ? new Date(startDate) : new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });
  // Set once the first tap lands, cleared when the range completes.
  const [pendingStart, setPendingStart] = useState(null);
  const [hovered, setHovered] = useState(null);

  function handleDay(key) {
    if (key < floor) return;
    if (pendingStart) {
      const [s, e] = pendingStart <= key ? [pendingStart, key] : [key, pendingStart];
      setPendingStart(null);
      setHovered(null);
      onChange({ startDate: s, endDate: e });
    } else {
      setPendingStart(key);
      setHovered(null);
      onChange({ startDate: key, endDate: "" });
    }
  }

  // While picking the second date, preview the span under the cursor so the
  // length of the booking is visible before committing to it.
  const previewEnd = pendingStart && hovered ? hovered : null;
  const spanStart = pendingStart && previewEnd ? (pendingStart <= previewEnd ? pendingStart : previewEnd) : startDate;
  const spanEnd = pendingStart && previewEnd ? (pendingStart <= previewEnd ? previewEnd : pendingStart) : endDate;

  function inSpan(key) {
    if (!spanStart || !spanEnd) return false;
    return key >= spanStart && key <= spanEnd;
  }
  const isEdge = (key) => key === spanStart || key === spanEnd;

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));

  const nights =
    startDate && endDate
      ? Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1
      : null;

  return (
    <div style={{ ...card, padding: 16, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          style={{ ...button("secondary"), padding: "6px 12px" }}
        >
          ‹
        </button>
        <span style={{ fontFamily: fontSans, fontSize: 15, fontWeight: 600 }}>
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          style={{ ...button("secondary"), padding: "6px 12px" }}
        >
          ›
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 6, width: "100%" }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ ...muted, fontSize: 11, textAlign: "center" }}>
            {w}
          </div>
        ))}
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, width: "100%", boxSizing: "border-box" }}
        onMouseLeave={() => setHovered(null)}
      >
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const key = fmt(d);
          const disabled = key < floor;
          const selected = inSpan(key);
          const edge = selected && isEdge(key);

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => handleDay(key)}
              onMouseEnter={() => pendingStart && setHovered(key)}
              style={{
                minHeight: 38,
                minWidth: 0,
                boxSizing: "border-box",
                padding: 0,
                borderRadius: radius.sm,
                border: "1px solid transparent",
                cursor: disabled ? "default" : "pointer",
                fontFamily: fontMono,
                fontSize: 12,
                // Edges solid, the days between them tinted — the shape of
                // the stay reads at a glance instead of two isolated dots.
                background: edge ? colors.ink : selected ? calendarDay.available.bg : "transparent",
                color: edge ? "#fff" : disabled ? colors.inkSoft : colors.ink,
                opacity: disabled ? 0.3 : 1,
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 13, color: colors.inkSoft, minHeight: 20 }}>
        {pendingStart && !endDate
          ? "Διάλεξε και την ημέρα επιστροφής."
          : nights
          ? `${startDate} → ${endDate} · ${nights} ${nights === 1 ? "ημέρα" : "ημέρες"}`
          : "Διάλεξε ημερομηνία αναχώρησης."}
      </div>
    </div>
  );
}
