"use client";
import { useEffect, useRef, useState } from "react";
import { colors, fontSans } from "../../../../lib/platform/theme";

// ----------------------------------------------------------------------------
// Ένα σύστημα ημερολογίου για όλη την εφαρμογή (κράτηση, διαθεσιμότητα,
// μεταφορές, αναθέσεις admin). Ίδια μορφή παντού:
//   · κάθε μέρα είναι στρογγυλό κουμπί με hover/πάτημα,
//   · αρχή και τέλος διαστήματος: γεμάτος κύκλος,
//   · ενδιάμεσες μέρες: συνεχής λωρίδα που ενώνει τις δύο άκρες,
//   · σήμερα: τελεία κάτω από τον αριθμό, παρελθόν: αχνό, όχι πατήσιμο.
// ----------------------------------------------------------------------------

export const WEEKDAYS = ["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"];
export const MONTH_NAMES = [
  "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
  "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
];
const MONTH_GEN = [
  "Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου",
  "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου",
];
const WEEKDAY_SHORT = ["Κυρ", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ"];

const pad = (n) => String(n).padStart(2, "0");
// Τοπική μορφή: το toISOString() περνά σε UTC και μπορεί να αλλάξει μέρα.
export const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const todayKey = () => fmt(new Date());
export const addDaysKey = (key, n) => {
  const d = parseISO(key);
  d.setDate(d.getDate() + n);
  return fmt(d);
};
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

// «Πέμ 24 Σεπ» — για τις θέσεις Αναχώρηση/Επιστροφή.
export function shortDay(key) {
  if (!key) return "";
  const d = parseISO(key);
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_GEN[d.getMonth()].slice(0, 3)}`;
}
// «24 Σεπτεμβρίου 2026» — για πεδία φόρμας.
export function longDay(key) {
  if (!key) return "";
  const d = parseISO(key);
  return `${d.getDate()} ${MONTH_GEN[d.getMonth()]} ${d.getFullYear()}`;
}

// Χρώματα λωρίδας ανά τόνο. «range»: επιλογή του χρήστη. Τα υπόλοιπα για
// το ημερολόγιο διαθεσιμότητας (διαθέσιμο / κλειστό / κράτηση).
export const TONES = {
  range: { band: "#E6EDF0", edge: colors.ink, edgeText: "#fff", text: colors.ink },
  preview: { band: "#EEF3F5", edge: colors.ink, edgeText: "#fff", text: colors.ink },
  available: { band: "rgba(195,161,100,0.24)", edge: "#B8955A", edgeText: "#fff", text: colors.ink },
  blocked: { band: "#ECEAE6", edge: "#9A968F", edgeText: "#fff", text: colors.inkSoft },
  booked: { band: colors.ink, edge: colors.ink, edgeText: "#fff", text: "#fff" },
};

const CSS = `
.sf-cal-day {
  position: relative; z-index: 1;
  width: 100%; max-width: 44px; aspect-ratio: 1 / 1;
  margin: 0 auto; padding: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-radius: 50%; border: 1.5px solid transparent;
  background: transparent; color: ${colors.ink};
  font-family: ${fontSans}; font-size: 15px; font-weight: 500;
  font-variant-numeric: tabular-nums; line-height: 1;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: background-color .12s ease, border-color .12s ease, transform .08s ease, color .12s ease;
}
.sf-cal-day:hover:not(:disabled):not([data-edge="1"]) { border-color: ${colors.ink}; }
.sf-cal-day:active:not(:disabled) { transform: scale(0.92); }
.sf-cal-day:focus-visible { outline: 2px solid ${colors.accent}; outline-offset: 2px; }
.sf-cal-day:disabled { cursor: default; color: #C3CBD2; font-weight: 400; opacity: 1 !important; }
.sf-cal-day[data-strike="1"] span.sf-cal-num { text-decoration: line-through; }
.sf-cal-nav {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid ${colors.border}; background: ${colors.card}; color: ${colors.ink};
  display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer;
  transition: background-color .12s ease, border-color .12s ease;
}
.sf-cal-nav:hover:not(:disabled) { border-color: ${colors.ink}; }
.sf-cal-nav:disabled { opacity: .35; cursor: default; }
@keyframes sf-cal-pulse { 0% { box-shadow: 0 0 0 0 rgba(22,40,60,.18); } 100% { box-shadow: 0 0 0 8px rgba(22,40,60,0); } }
`;

export function CalendarStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

function Chevron({ dir }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Μήνας/μήνες με βελάκια. `count` μήνες δίπλα-δίπλα (2 σε φαρδιά οθόνη).
export function MonthNav({ month, count = 1, onPrev, onNext, prevDisabled }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", marginBottom: 14, minHeight: 36 }}>
      <button type="button" className="sf-cal-nav" aria-label="Προηγούμενος μήνας" onClick={onPrev} disabled={prevDisabled}>
        <Chevron dir="left" />
      </button>
      <div style={{ flex: 1, display: "flex", justifyContent: "space-around" }}>
        {Array.from({ length: count }).map((_, i) => {
          const m = addMonths(month, i);
          return (
            <span key={i} style={{ fontFamily: fontSans, fontSize: 16, fontWeight: 600, color: colors.ink }}>
              {MONTH_NAMES[m.getMonth()]} {m.getFullYear()}
            </span>
          );
        })}
      </div>
      <button type="button" className="sf-cal-nav" aria-label="Επόμενος μήνας" onClick={onNext}>
        <Chevron dir="right" />
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Πλέγμα ενός μήνα. Για κάθε μέρα το `dayProps(key)` επιστρέφει:
//   { disabled, tone, band: "none"|"mid"|"start"|"end"|"single",
//     filled (γεμάτος κύκλος), today, strike, sub (μικρό κείμενο κάτω),
//     onClick, onHover, ariaLabel }
// Οι λωρίδες κλείνουν στρογγυλεμένα στην αρχή/τέλος κάθε εβδομάδας, ώστε
// ένα διάστημα που αλλάζει γραμμή να διαβάζεται σωστά.
// ----------------------------------------------------------------------------
export function MonthGrid({ month, dayProps, onLeave }) {
  const first = startOfMonth(month);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  const today = todayKey();

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            style={{ fontFamily: fontSans, fontSize: 12, fontWeight: 500, color: colors.inkSoft, textAlign: "center", padding: "4px 0" }}
          >
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 4 }} onMouseLeave={onLeave}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const key = fmt(d);
          const p = dayProps(key) || {};
          const tone = TONES[p.tone] || TONES.range;
          const col = i % 7;
          const band = p.band || "none";
          const isMonthStart = d.getDate() === 1;
          const isMonthEnd = d.getDate() === last.getDate();
          // Στρογγυλεμένο άκρο λωρίδας: αρχή/τέλος διαστήματος, εβδομάδας ή μήνα.
          const roundLeft = band === "start" || band === "single" || col === 0 || isMonthStart;
          const roundRight = band === "end" || band === "single" || col === 6 || isMonthEnd;
          let bandStyle = null;
          if (band !== "none") {
            const half = p.filled && (band === "start" || band === "end");
            bandStyle = {
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              height: "min(44px, 100cqw)",
              left: half && band === "start" ? "50%" : roundLeft ? "max(0px, calc(50% - min(22px, 50cqw)))" : 0,
              right: half && band === "end" ? "50%" : roundRight ? "max(0px, calc(50% - min(22px, 50cqw)))" : 0,
              background: tone.band,
              borderTopLeftRadius: roundLeft && !(half && band === "start") ? 22 : 0,
              borderBottomLeftRadius: roundLeft && !(half && band === "start") ? 22 : 0,
              borderTopRightRadius: roundRight && !(half && band === "end") ? 22 : 0,
              borderBottomRightRadius: roundRight && !(half && band === "end") ? 22 : 0,
            };
            if (band === "single" && p.filled) bandStyle = null;
          }
          const isToday = key === today;
          return (
            <div key={key} style={{ position: "relative", display: "flex", alignItems: "center", minHeight: 46, containerType: "inline-size" }}>
              {bandStyle && <span aria-hidden="true" style={bandStyle} />}
              <button
                type="button"
                className="sf-cal-day"
                disabled={p.disabled}
                data-edge={p.filled ? "1" : "0"}
                data-strike={p.strike ? "1" : "0"}
                aria-label={p.ariaLabel || longDay(key)}
                aria-pressed={p.filled || band !== "none" ? true : undefined}
                onClick={() => p.onClick?.(key)}
                onMouseEnter={() => p.onHover?.(key)}
                style={
                  p.filled
                    ? { background: tone.edge, borderColor: tone.edge, color: tone.edgeText, fontWeight: 600, animation: p.pulse ? "sf-cal-pulse 1.4s ease-out infinite" : undefined }
                    : band !== "none"
                    ? { color: tone.text, fontWeight: 500 }
                    : p.outline
                    ? { borderColor: colors.ink }
                    : undefined
                }
              >
                <span className="sf-cal-num">{d.getDate()}</span>
                {p.sub && (
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 500,
                      marginTop: 2,
                      maxWidth: "92%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      opacity: 0.85,
                    }}
                  >
                    {p.sub}
                  </span>
                )}
                {isToday && !p.filled && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      bottom: 5,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: band !== "none" && p.tone === "booked" ? "#fff" : colors.accent,
                    }}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Πόσοι μήνες χωρούν δίπλα-δίπλα στο πλάτος του γονικού στοιχείου.
export function useMonthCount(max = 2, minWidthPerMonth = 300) {
  const ref = useRef(null);
  const [count, setCount] = useState(1);
  useEffect(() => {
    if (!ref.current || max < 2) return;
    const el = ref.current;
    const update = () => setCount(Math.max(1, Math.min(max, Math.floor(el.clientWidth / minWidthPerMonth))));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max, minWidthPerMonth]);
  return [ref, count];
}
