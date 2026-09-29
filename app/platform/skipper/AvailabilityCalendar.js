"use client";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { trackFlow, noteFailure } from "../../../lib/platform/health";
import { useEffect, useState } from "react";
import {
  listAvailabilityWindows,
  setAvailabilityPeriod,
  removeAvailabilityWindow,
  listAvailabilityBlocks,
  addAvailabilityBlock,
  removeAvailabilityBlock,
  listLookups,
} from "../../../lib/platform/db";
import DateRangeCalendar from "../components/DateRangeCalendar";
import { CalendarStyles, MonthNav, MonthGrid, TONES, addDaysKey } from "../components/calendar/Calendar";
import { card, sectionLabel, muted, button, colors, radius, shadow } from "../../../lib/platform/theme";
import { formatDate, formatDateRange } from "../../../lib/platform/notifications";
import { periodColor, regionColor, toneFor } from "../../../lib/platform/regionTones";

function pad(n) {
  return String(n).padStart(2, "0");
}
// Τοπική ημερομηνία — το toISOString() μετατρέπει σε UTC και μετακινεί τη μέρα.
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
const maxKey = (a, b) => (a > b ? a : b);
const minKey = (a, b) => (a < b ? a : b);

const namesOf = (w) => (w.availability_window_regions || []).map((r) => r.regions?.name).filter(Boolean).sort();

const chip = (active) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "8px 14px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});
const dot = (color, size = 8) => ({ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flex: "none" });

// ----------------------------------------------------------------------------
// Διαθεσιμότητα σε περιόδους: κάθε περίοδος έχει ημερομηνίες και περιοχές.
// Το ημερολόγιο δείχνει κάθε περίοδο με το χρώμα της περιοχής της· η λίστα
// «Οι περίοδοί μου» από κάτω είναι η ίδια πληροφορία ως κείμενο, και από
// εκεί (ή πατώντας μια μέρα) αλλάζει ή σβήνεται μια περίοδος. Νέα περίοδος
// πάνω σε υπάρχουσα αλλάζει μόνο τις κοινές μέρες — και το λέει πριν την
// αποθήκευση.
// ----------------------------------------------------------------------------
export default function AvailabilityCalendar({ skipperId, bookings = [], onChanged }) {
  const [windows, setWindows] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [regions, setRegions] = useState([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  // Ένα παράθυρο για όλα: { mode: "open"|"close", editKind?: "period"|"absence", editId? }
  const [sheet, setSheet] = useState(null);
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
      setError(friendlyError(err));
    }
  }
  useEffect(() => {
    load();
    listLookups().then((l) => setRegions(l.regions)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipperId]);

  const today = fmt(new Date());

  function isBooked(dateStr) {
    return bookings.some(
      (b) => (b.status === "confirmed" || b.status === "completed") && b.start_date <= dateStr && dateStr <= b.end_date
    );
  }
  const windowsFor = (d) => windows.filter((w) => w.start_date <= d && d <= w.end_date);
  const blocksFor = (d) => blocks.filter((b) => b.start_date <= d && d <= b.end_date);

  // Κράτηση > απουσία > διαθεσιμότητα.
  function cellState(d) {
    if (isBooked(d)) return "booked";
    if (blocksFor(d).length > 0) return "blocked";
    if (windowsFor(d).length > 0) return "available";
    return "empty";
  }
  function colorFor(d) {
    const ws = windowsFor(d);
    return periodColor([...new Set(ws.flatMap(namesOf))]);
  }

  function bookedInRange(a, b) {
    if (!a || !b) return false;
    for (let d = parseISO(a); fmt(d) <= b; d.setDate(d.getDate() + 1)) if (isBooked(fmt(d))) return true;
    return false;
  }

  function openNew(prefillStart) {
    trackFlow("availability", "open");
    setError("");
    setRange({ startDate: prefillStart || "", endDate: "" });
    setSheetRegionIds([]);
    setSheet({ mode: "open" });
  }
  function openEdit(w) {
    setError("");
    setRange({ startDate: maxKey(w.start_date, today), endDate: w.end_date });
    setSheetRegionIds((w.availability_window_regions || []).map((r) => r.region_id));
    setSheet({ mode: "open", editKind: "period", editId: w.id });
  }
  function openAbsence(b) {
    setError("");
    setRange({ startDate: maxKey(b.start_date, today), endDate: b.end_date });
    setSheetRegionIds([]);
    setSheet({ mode: "close", editKind: "absence", editId: b.id });
  }
  const setMode = (mode) => {
    setError("");
    setSheet((s) => ({ ...s, mode }));
  };
  function closeSheet() {
    setSheet(null);
    setRange({ startDate: "", endDate: "" });
    setSheetRegionIds([]);
  }

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      setError(friendlyError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!range.startDate || !range.endDate) {
      setError("Διάλεξε αρχή και τέλος στο ημερολόγιο.");
      noteFailure("missing_dates");
      return;
    }
    const editingAbsence = sheet.editKind === "absence";
    if (sheet.mode === "close") {
      if (bookedInRange(range.startDate, range.endDate)) {
        setError("Το διάστημα περιλαμβάνει ημέρες με κράτηση. Διάλεξε άλλες μέρες.");
        noteFailure("booked_in_range");
        return;
      }
      // Η απουσία μπαίνει πάνω από ό,τι έχει δηλωθεί· η διαθεσιμότητα από κάτω
      // μένει και ξαναφαίνεται αν ακυρωθεί η απουσία.
      const ok = await run(async () => {
        if (editingAbsence) await removeAvailabilityBlock(sheet.editId);
        await addAvailabilityBlock(skipperId, { startDate: range.startDate, endDate: range.endDate });
      });
      if (ok) {
        trackFlow("availability", "done");
        closeSheet();
      }
      return;
    }
    if (sheetRegionIds.length === 0) {
      setError("Διάλεξε τουλάχιστον μία περιοχή.");
      noteFailure("region_required");
      return;
    }
    const ok = await run(async () => {
      if (editingAbsence) await removeAvailabilityBlock(sheet.editId);
      await setAvailabilityPeriod({
        startDate: range.startDate,
        endDate: range.endDate,
        regionIds: sheetRegionIds,
        replaceId: sheet.editKind === "period" ? sheet.editId : null,
      });
    });
    if (ok) {
      trackFlow("availability", "done");
      closeSheet();
    }
  }

  async function removeCurrent() {
    const ok = await run(() =>
      sheet.editKind === "absence" ? removeAvailabilityBlock(sheet.editId) : removeAvailabilityWindow(sheet.editId)
    );
    if (ok) closeSheet();
  }

  function onDayClick(d) {
    if (d < today) return;
    const state = cellState(d);
    if (state === "booked") return;
    if (state === "empty") openNew(d);
    else if (state === "blocked") openAbsence(blocksFor(d)[0]);
    else openEdit(windowsFor(d)[0]);
  }

  // Συνεχόμενες μέρες της ίδιας περιόδου (ή της ίδιας κατάστασης) = μία λωρίδα.
  function runKey(key) {
    if (key < today) return null;
    const st = cellState(key);
    if (st === "empty") return null;
    return st === "available" ? `w:${windowsFor(key).map((w) => w.id).join(",")}` : st;
  }
  function dayProps(key) {
    const isPast = key < today;
    const state = cellState(key);
    const base = { disabled: isPast || state === "booked", onClick: onDayClick };
    if (isPast || state === "empty") return base;
    const me = runKey(key);
    const prevSame = runKey(addDaysKey(key, -1)) === me;
    const nextSame = runKey(addDaysKey(key, 1)) === me;
    const band = prevSame && nextSame ? "mid" : prevSame ? "end" : nextSame ? "start" : "single";
    const names = state === "available" ? [...new Set(windowsFor(key).flatMap(namesOf))] : [];
    return {
      ...base,
      band,
      tone: state === "available" ? toneFor(colorFor(key)) : state,
      strike: state === "blocked",
      ariaLabel: `${formatDate(key)}: ${
        state === "available" ? `διαθέσιμο · ${names.join(", ")}` : state === "blocked" ? "απουσία" : "κράτηση"
      }`,
    };
  }

  // Περίοδοι και απουσίες από σήμερα και μετά, με χρονολογική σειρά.
  const upcoming = [
    ...windows.filter((w) => w.end_date >= today).map((w) => ({ type: "period", item: w, start: w.start_date })),
    ...blocks.filter((b) => b.end_date >= today).map((b) => ({ type: "absence", item: b, start: b.start_date })),
  ].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const usedRegions = [...new Set(windows.filter((w) => w.end_date >= today).flatMap(namesOf))].sort();

  // Τι θα αλλάξει με την αποθήκευση: μέρες άλλων περιόδων που καλύπτει η νέα.
  const selectedNames = regions.filter((r) => sheetRegionIds.includes(r.id)).map((r) => r.name);
  const overlaps =
    sheet && range.startDate && range.endDate
      ? windows
          .filter(
            (w) =>
              // Στην αλλαγή περιόδου, η ίδια η περίοδος δεν «αντικαθίσταται» —
              // εκτός αν οι μέρες της γίνονται απουσία.
              !(sheet.mode === "open" && sheet.editKind === "period" && w.id === sheet.editId) &&
              w.start_date <= range.endDate &&
              w.end_date >= range.startDate
          )
          .map((w) => ({
            from: maxKey(w.start_date, range.startDate),
            to: minKey(w.end_date, range.endDate),
            names: namesOf(w),
          }))
      : [];

  return (
    <div style={{ ...card, position: "relative" }}>
      <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
        Δήλωσε πού είσαι διαθέσιμος και πότε λείπεις. Κάθε περιοχή έχει το δικό της χρώμα.
      </p>

      <button type="button" style={{ ...button("primary"), width: "100%", marginBottom: 20 }} onClick={() => openNew()}>
        + Νέα περίοδος
      </button>

      <CalendarStyles />
      <MonthNav month={month} onPrev={() => setMonth((m) => addMonths(m, -1))} onNext={() => setMonth((m) => addMonths(m, 1))} />
      <MonthGrid month={month} dayProps={dayProps} />

      <div style={{ display: "flex", gap: "8px 16px", fontSize: 12.5, marginTop: 16, flexWrap: "wrap", color: colors.inkSoft }}>
        {usedRegions.map((n) => (
          <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={dot(regionColor(n))} />
            {n}
          </span>
        ))}
        {[
          ["blocked", "Απουσία"],
          ["booked", "Κράτηση"],
        ].map(([tone, label]) => (
          <span key={tone} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 16, height: 8, borderRadius: 4, background: TONES[tone].band, display: "inline-block" }} />
            {label}
          </span>
        ))}
      </div>

      {error && !sheet && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}

      <h3 style={{ ...sectionLabel, margin: "26px 0 8px" }}>Οι περίοδοί μου</h3>
      {upcoming.length === 0 && <p style={{ ...muted, fontSize: 13.5, margin: 0 }}>Δεν έχεις δηλώσει περιόδους.</p>}
      <div>
        {upcoming.map(({ type, item }) => {
          const isPeriod = type === "period";
          const names = isPeriod ? namesOf(item) : [];
          return (
            <button
              key={`${type}-${item.id}`}
              type="button"
              onClick={() => (isPeriod ? openEdit(item) : openAbsence(item))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                width: "100%",
                textAlign: "left",
                padding: "12px 4px",
                background: "none",
                border: "none",
                borderBottom: `1px solid ${colors.border}`,
                cursor: "pointer",
                fontFamily: "inherit",
                color: colors.ink,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 4,
                  alignSelf: "stretch",
                  minHeight: 34,
                  borderRadius: 2,
                  background: isPeriod ? periodColor(names) : TONES.blocked.edge,
                  opacity: isPeriod ? 1 : 0.5,
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14.5, fontWeight: 500, display: "block" }}>{formatDateRange(item.start_date, item.end_date)}</span>
                <span style={{ ...muted, fontSize: 13, display: "block", marginTop: 2 }}>
                  {isPeriod ? names.join(" · ") : "Απουσία"}
                </span>
              </span>
              <span aria-hidden="true" style={{ color: colors.inkSoft, fontSize: 18 }}>
                ›
              </span>
            </button>
          );
        })}
      </div>

      {/* Νέα περίοδος / αλλαγή περιόδου / απουσία */}
      {sheet && (
        <div style={overlay} onClick={closeSheet}>
          <div role="dialog" aria-modal="true" style={{ ...sheetBox, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ ...sectionLabel, margin: "0 0 12px" }}>
              {sheet.mode === "close" ? "Απουσία" : sheet.editKind === "period" ? "Αλλαγή περιόδου" : "Νέα περίοδος"}
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

            {/* Διαθέσιμος ή απουσία, για τις μέρες που διάλεξες. */}
            <div
              role="radiogroup"
              aria-label="Κατάσταση"
              style={{ display: "flex", marginTop: 16, padding: 3, background: colors.seaGlass, borderRadius: radius.pill }}
            >
              {[
                ["open", "Διαθέσιμος"],
                ["close", "Απουσία"],
              ].map(([m, label]) => {
                const on = sheet.mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      minHeight: 40,
                      borderRadius: radius.pill,
                      border: "none",
                      background: on ? colors.card : "transparent",
                      boxShadow: on ? "0 1px 3px rgba(22,40,60,0.12)" : "none",
                      color: on ? colors.ink : colors.inkSoft,
                      fontFamily: "inherit",
                      fontSize: 14,
                      fontWeight: on ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {sheet.mode === "close" && (
              <p style={{ ...muted, fontSize: 13, margin: "12px 0 0", lineHeight: 1.5 }}>
                Δεν εμφανίζεσαι σε αναζητήσεις αυτές τις μέρες. Ό,τι διαθεσιμότητα έχεις δηλώσει μένει από κάτω.
              </p>
            )}

            {sheet.mode === "open" && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    aria-pressed={regions.length > 0 && sheetRegionIds.length === regions.length}
                    style={chip(regions.length > 0 && sheetRegionIds.length === regions.length)}
                    onClick={() => setSheetRegionIds((ids) => (ids.length === regions.length ? [] : regions.map((r) => r.id)))}
                  >
                    Όλες
                  </button>
                  {regions.map((r, i) => {
                    const on = sheetRegionIds.includes(r.id);
                    return (
                      <button
                        type="button"
                        key={r.id}
                        aria-pressed={on}
                        style={chip(on)}
                        onClick={() => setSheetRegionIds((ids) => (ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id]))}
                      >
                        <i style={{ ...dot(regionColor(r.name, i)), boxShadow: on ? "0 0 0 1.5px #fff" : "none" }} />
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {overlaps.length > 0 && (
              <div style={{ marginTop: 14, padding: "10px 12px", background: colors.seaGlass, borderRadius: radius.md, fontSize: 13, lineHeight: 1.55 }}>
                {overlaps.map((o, i) => (
                  <div key={i}>
                    {formatDateRange(o.from, o.to)}: {o.names.join(" · ") || "—"} →{" "}
                    {sheet.mode === "close" ? "Απουσία" : selectedNames.join(" · ") || "νέα περιοχή"}
                  </div>
                ))}
              </div>
            )}

            {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" disabled={busy} style={{ ...button("primary"), flex: 1 }} onClick={save}>
                {busy ? "Αποθήκευση…" : "Αποθήκευση"}
              </button>
              <button type="button" style={button("secondary")} onClick={closeSheet}>
                Άκυρο
              </button>
            </div>

            {sheet.editId && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button type="button" disabled={busy} style={{ ...linkBtn, color: colors.danger }} onClick={removeCurrent}>
                  {sheet.editKind === "absence" ? "Ακύρωση απουσίας" : "Διαγραφή περιόδου"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(22,40,60,0.35)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 40,
  padding: 16,
};
const sheetBox = {
  background: colors.card,
  borderRadius: radius.lg,
  border: `1px solid ${colors.border}`,
  padding: 20,
  width: "100%",
  maxWidth: 440,
  boxShadow: shadow.raised,
  maxHeight: "88vh",
  overflowY: "auto",
};
const linkBtn = {
  background: "none",
  border: "none",
  padding: "10px 0",
  minHeight: 40,
  fontFamily: "inherit",
  fontSize: 13.5,
  color: colors.ink,
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
};
