"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DateRangeCalendar from "../DateRangeCalendar";
import { CalendarStyles, MonthNav, MonthGrid, addMonths, startOfMonth, parseISO, todayKey, longDay } from "./Calendar";
import { colors, radius, fontSans, button, shadow } from "../../../../lib/platform/theme";
import { formatDateRange } from "../../../../lib/platform/notifications";

// Μία ημερομηνία, με το ίδιο πλέγμα που χρησιμοποιεί όλη η εφαρμογή.
export function SingleCalendar({ value, onChange, minDate, bare = false }) {
  const floor = minDate ?? todayKey();
  const [month, setMonth] = useState(() => startOfMonth(value ? parseISO(value) : new Date()));
  return (
    <div
      style={
        bare
          ? { width: "100%" }
          : { width: "100%", boxSizing: "border-box", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 16 }
      }
    >
      <CalendarStyles />
      <MonthNav
        month={month}
        onPrev={() => setMonth((m) => addMonths(m, -1))}
        onNext={() => setMonth((m) => addMonths(m, 1))}
        prevDisabled={floor ? month <= startOfMonth(parseISO(floor)) : false}
      />
      <MonthGrid
        month={month}
        dayProps={(key) => ({
          disabled: floor ? key < floor : false,
          onClick: onChange,
          ...(key === value ? { filled: true, band: "single", tone: "range" } : {}),
        })}
      />
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke={colors.inkSoft} strokeWidth="1.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke={colors.inkSoft} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Πεδίο φόρμας που ανοίγει το ημερολόγιο σε φύλλο (κάτω στο κινητό, στο
// κέντρο στον υπολογιστή). mode="single": value = "YYYY-MM-DD".
// mode="range": value = { startDate, endDate }.
export default function DateField({
  mode = "single",
  value,
  onChange,
  minDate,
  placeholder,
  title,
  startLabel = "Από",
  endLabel = "Έως",
  invalid = false,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const text =
    mode === "single"
      ? value
        ? longDay(value)
        : ""
      : value?.startDate && value?.endDate
      ? formatDateRange(value.startDate, value.endDate)
      : "";

  const rangeReady = mode === "range" && draft?.startDate && draft?.endDate;

  const sheet =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="sf-datesheet"
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(22,40,60,0.38)",
              zIndex: 70,
              display: "flex",
              justifyContent: "center",
              padding: 12,
            }}
          >
            <style dangerouslySetInnerHTML={{ __html: `.sf-datesheet{align-items:flex-end}@media(min-width:640px){.sf-datesheet{align-items:center}}` }} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title || placeholder}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 440,
                maxHeight: "92vh",
                overflowY: "auto",
                boxSizing: "border-box",
                background: colors.card,
                borderRadius: radius.lg + 4,
                boxShadow: shadow.raised,
                padding: "18px 18px 16px",
              }}
            >
              {title && (
                <div style={{ fontFamily: fontSans, fontSize: 17, fontWeight: 600, color: colors.ink, margin: "2px 2px 14px" }}>
                  {title}
                </div>
              )}
              {mode === "single" ? (
                <SingleCalendar
                  bare
                  value={value}
                  minDate={minDate}
                  onChange={(key) => {
                    onChange(key);
                    setOpen(false);
                  }}
                />
              ) : (
                <>
                  <DateRangeCalendar
                    bare
                    maxMonths={1}
                    startDate={draft?.startDate || ""}
                    endDate={draft?.endDate || ""}
                    minDate={minDate}
                    startLabel={startLabel}
                    endLabel={endLabel}
                    onChange={setDraft}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button type="button" style={button("secondary")} onClick={() => setOpen(false)}>
                      Άκυρο
                    </button>
                    <button
                      type="button"
                      disabled={!rangeReady}
                      style={{ ...button("primary"), flex: 1, opacity: rangeReady ? 1 : 0.45 }}
                      onClick={() => {
                        onChange(draft);
                        setOpen(false);
                      }}
                    >
                      Εφαρμογή
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "11px 13px",
          borderRadius: radius.md,
          border: `1px solid ${invalid ? colors.danger : colors.border}`,
          background: colors.card,
          fontFamily: fontSans,
          fontSize: 15,
          color: text ? colors.ink : colors.inkSoft,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {text || placeholder || (mode === "single" ? "Επίλεξε ημερομηνία" : "Επίλεξε διάστημα")}
        </span>
        <CalendarIcon />
      </button>
      {sheet}
    </>
  );
}
