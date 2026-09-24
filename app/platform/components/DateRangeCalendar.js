"use client";
import { useEffect, useState } from "react";
import { colors, fontSans, radius } from "../../../lib/platform/theme";
import { formatDateRange } from "../../../lib/platform/notifications";
import {
  CalendarStyles,
  MonthNav,
  MonthGrid,
  addMonths,
  startOfMonth,
  parseISO,
  todayKey,
  daysBetween,
  shortDay,
  useMonthCount,
} from "./calendar/Calendar";

// Επιλογή διαστήματος, ίδια σε όλη την εφαρμογή. Πάνω από το πλέγμα δύο
// «θέσεις» (Αναχώρηση / Επιστροφή): η ενεργή έχει περίγραμμα, οπότε από
// την πρώτη ματιά φαίνεται ότι ζητούνται δύο ημερομηνίες και ποια
// περιμένει τώρα. Μετά το πρώτο πάτημα ενεργοποιείται αμέσως η Επιστροφή
// και, όσο κινείσαι πάνω στις μέρες, το διάστημα γεμίζει ζωντανά.
export default function DateRangeCalendar({
  startDate,
  endDate,
  onChange,
  minDate,
  startLabel = "Αναχώρηση",
  endLabel = "Επιστροφή",
  bare = false,
  maxMonths = 2,
}) {
  const floor = minDate || todayKey();
  const [month, setMonth] = useState(() => startOfMonth(startDate ? parseISO(startDate) : new Date()));
  // "start" | "end" | "done" (διάστημα πλήρες: καμία θέση δεν περιμένει)
  const [active, setActive] = useState(!startDate ? "start" : !endDate ? "end" : "done");
  const [hovered, setHovered] = useState(null);
  const [wrapRef, count] = useMonthCount(maxMonths, 300);

  // Αν αλλάξει απ' έξω (π.χ. «Καθαρισμός» από τον γονέα), ακολουθεί.
  useEffect(() => {
    if (!startDate) setActive("start");
  }, [startDate]);

  function pick(key) {
    if (key < floor) return;
    if (active !== "end" || !startDate) {
      onChange({ startDate: key, endDate: "" });
      setActive("end");
    } else if (key < startDate) {
      // Πιο νωρίς από την αναχώρηση: γίνεται η νέα αναχώρηση.
      onChange({ startDate: key, endDate: "" });
    } else {
      onChange({ startDate, endDate: key });
      setActive("done");
    }
    setHovered(null);
  }

  const choosingEnd = active === "end" && startDate;
  const previewEnd = choosingEnd && hovered && hovered >= startDate ? hovered : null;
  const rangeEnd = endDate || previewEnd;
  const isPreview = !endDate && !!previewEnd;

  function dayProps(key) {
    const disabled = key < floor;
    const base = { disabled, onClick: pick, onHover: choosingEnd ? setHovered : undefined };
    if (!startDate) return base;
    const tone = isPreview ? "preview" : "range";
    if (!rangeEnd) {
      if (key === startDate) return { ...base, filled: true, band: "single", tone, pulse: true };
      return base;
    }
    if (key === startDate && key === rangeEnd) return { ...base, filled: true, band: "single", tone };
    if (key === startDate) return { ...base, filled: true, band: "start", tone };
    if (key === rangeEnd) return { ...base, filled: !isPreview, outline: isPreview, band: "end", tone };
    if (key > startDate && key < rangeEnd) return { ...base, band: "mid", tone };
    return base;
  }

  const days = startDate && endDate ? daysBetween(startDate, endDate) + 1 : null;

  const slot = (which, label, value, placeholder) => {
    const isActive = active === which && !(which === "end" && !startDate);
    return (
      <button
        type="button"
        onClick={() => {
          if (which === "end" && !startDate) return;
          setActive(which);
        }}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          padding: "10px 14px",
          borderRadius: radius.md,
          border: `1.5px solid ${isActive ? colors.ink : "transparent"}`,
          background: isActive ? colors.card : "transparent",
          boxShadow: isActive ? "0 2px 10px rgba(22,40,60,0.10)" : "none",
          cursor: which === "end" && !startDate ? "default" : "pointer",
          fontFamily: fontSans,
          transition: "border-color .15s ease, background-color .15s ease, box-shadow .15s ease",
        }}
      >
        <span
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: isActive ? colors.ink : colors.inkSoft,
          }}
        >
          {label}
        </span>
        <span
          style={{
            display: "block",
            marginTop: 3,
            fontSize: 15,
            fontWeight: value ? 600 : 400,
            color: value ? colors.ink : colors.inkSoft,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {value ? shortDay(value) : placeholder}
        </span>
      </button>
    );
  };

  const prompt = !startDate
    ? `Πάτησε την ημέρα ${startLabel === "Αναχώρηση" ? "αναχώρησης" : "έναρξης"}.`
    : !endDate
    ? `Τώρα πάτησε την ημέρα ${endLabel === "Επιστροφή" ? "επιστροφής" : "λήξης"}.`
    : null;

  return (
    <div
      ref={wrapRef}
      style={
        bare
          ? { width: "100%" }
          : {
              width: "100%",
              boxSizing: "border-box",
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.lg,
              padding: 16,
            }
      }
    >
      <CalendarStyles />
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          marginBottom: 16,
          background: "#F1F4F5",
          borderRadius: radius.md + 4,
        }}
      >
        {slot("start", startLabel, startDate, "Επίλεξε")}
        {slot("end", endLabel, endDate, "Επίλεξε")}
      </div>

      <MonthNav
        month={month}
        count={count}
        onPrev={() => setMonth((m) => addMonths(m, -1))}
        onNext={() => setMonth((m) => addMonths(m, 1))}
        prevDisabled={addMonths(month, 0) <= startOfMonth(parseISO(floor))}
      />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 28 }}>
        {Array.from({ length: count }).map((_, i) => (
          <MonthGrid key={i} month={addMonths(month, i)} dayProps={dayProps} onLeave={() => setHovered(null)} />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginTop: 14,
          minHeight: 22,
          fontFamily: fontSans,
          fontSize: 13.5,
        }}
      >
        <span style={{ color: prompt ? colors.ink : colors.inkSoft, fontWeight: prompt ? 500 : 400 }}>
          {prompt ||
            `${days} ${days === 1 ? "ημέρα" : "ημέρες"} · ${formatDateRange(startDate, endDate)}`}
        </span>
        {startDate && (
          <button
            type="button"
            onClick={() => {
              onChange({ startDate: "", endDate: "" });
              setActive("start");
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: fontSans,
              fontSize: 13.5,
              color: colors.ink,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              flexShrink: 0,
            }}
          >
            Καθαρισμός
          </button>
        )}
      </div>
    </div>
  );
}
