"use client";
import Link from "next/link";
import { colors, radius, muted, money, fontSans, badge, button } from "../../../lib/platform/theme";

// Building blocks for the console.
//
// Written as a small set of primitives rather than styling each screen
// separately: this page is going to keep growing — wallets, bank transfers,
// scheduling, whatever comes next — and the only way that stays readable is
// if a new section is assembled from parts that already look right, instead
// of being designed again from scratch each time.
//
// Density is the point. An operations screen is read by someone who opens it
// forty times a day and needs to find one number, so it favours tight rows,
// aligned figures and quiet chrome over the generous spacing that suits the
// pages a customer sees once.

export const panel = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  overflow: "hidden",
};

export function Panel({ title, subtitle, action, children, padded = true }) {
  return (
    <section style={{ ...panel, marginBottom: 16 }}>
      {(title || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "13px 16px",
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <span style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: fontSans,
                fontSize: 13,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: colors.inkSoft,
              }}
            >
              {title}
            </h2>
            {subtitle && (
              <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>{subtitle}</p>
            )}
          </span>
          {action}
        </header>
      )}
      <div style={padded ? { padding: 16 } : undefined}>{children}</div>
    </section>
  );
}

// A figure and what it means. `tone` marks the ones that are a call to action
// rather than a fact, so "3 waiting for you" doesn't look like "412 users".
export function Metric({ label, value, hint, tone = "plain", href, onClick }) {
  const isAction = tone === "attention" && value > 0;
  const clickable = Boolean(href || onClick);
  const inner = (
    <>
      <div style={{ ...muted, fontSize: 12, letterSpacing: "0.02em" }}>{label}</div>
      <div
        style={{
          ...money,
          fontSize: 24,
          fontWeight: 600,
          marginTop: 6,
          color: isAction ? colors.warn : colors.ink,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint && <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>{hint}</div>}
    </>
  );

  const style = {
    ...panel,
    padding: "14px 16px",
    display: "block",
    textDecoration: "none",
    textAlign: "left",
    width: "100%",
    // Same trap as Row: 100% plus padding overflows its grid column, which
    // on a phone pushed the second column off the side of the screen.
    boxSizing: "border-box",
    fontFamily: "inherit",
    cursor: clickable ? "pointer" : "default",
    borderColor: isAction ? colors.warn : colors.border,
    background: isAction ? "#FBF6EC" : colors.card,
  };

  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={style}>
        {inner}
      </button>
    );
  }
  // href was accepted and folded into `clickable` (the pointer cursor, the
  // hover-ready styling) but nothing ever turned it into an actual link — a
  // tile that looked clickable and did nothing on tap.
  if (href) {
    return (
      <Link href={href} style={style}>
        {inner}
      </Link>
    );
  }
  return <div style={style}>{inner}</div>;
}

export function MetricGrid({ children, min = 150 }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 10,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

// Rows inside a panel: hairline-separated, no card-per-item. A list of forty
// bookings as forty rounded boxes is unreadable; as forty rows it's a table.
export function Row({ children, onClick, tone }) {
  const base = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    // Without this, a row with more than a couple of side actions (e.g. the
    // users list once it grew a third button) had nowhere to put them:
    // RowMain's flex:1 got squeezed toward zero width instead, truncating a
    // name down to a single letter and breaking its meta line one word per
    // line. Wrapping lets the actions drop to their own line instead.
    flexWrap: "wrap",
    gap: 12,
    width: "100%",
    // Without this the 32px of horizontal padding is added *to* the 100%,
    // so every row sat 32px wider than the panel and its right-hand column
    // was clipped by the panel's overflow:hidden.
    boxSizing: "border-box",
    padding: "12px 16px",
    borderBottom: `1px solid ${colors.border}`,
    background: tone === "attention" ? "#FBF6EC" : "transparent",
    textAlign: "left",
    fontFamily: "inherit",
    border: "none",
    borderTop: "none",
    borderLeft: "none",
    borderRight: "none",
  };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ ...base, cursor: "pointer" }}>
        {children}
      </button>
    );
  }
  return <div style={base}>{children}</div>;
}

// photoUrl is opt-in — only the accounts list passes it today. Every other
// Row/RowMain caller (bookings, disputes, offers, coverage) is unaffected.
export function RowMain({ title, meta, photoUrl }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 160, flex: "1 1 200px" }}>
      {photoUrl !== undefined && (
        // eslint-disable-next-line @next/next/no-img-element
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            flexShrink: 0,
            background: photoUrl ? `url(${photoUrl}) center/cover` : "#EFEDE8",
          }}
          aria-hidden="true"
        />
      )}
      {/* flex-basis 200px (not 0): gives the name/meta column a floor it
          won't shrink past, so a crowded action cluster wraps to its own
          line below instead of squeezing this down to an unreadable
          sliver. */}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: "block",
            fontSize: 14,
            fontWeight: 500,
            color: colors.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        {meta && (
          <span style={{ ...muted, fontSize: 12.5, display: "block", marginTop: 3 }}>{meta}</span>
        )}
      </span>
    </span>
  );
}

export function Empty({ children }) {
  return <p style={{ ...muted, fontSize: 13, padding: "18px 16px", margin: 0 }}>{children}</p>;
}

export function Toolbar({ children }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: `1px solid ${colors.border}`,
        background: colors.bg,
      }}
    >
      {children}
    </div>
  );
}

export const STATUS_TONE = {
  confirmed: "success",
  completed: "neutral",
  cancelled_by_client: "danger",
  cancelled_by_skipper: "danger",
  open: "brand",
  matched: "success",
  expired_unclaimed: "warn",
  cancelled: "danger",
  pending: "warn",
  approved: "success",
  rejected: "danger",
  active: "success",
  draft: "warn",
  suspended: "danger",
  deleted: "neutral",
};

export const STATUS_LABEL = {
  confirmed: "Επιβεβαιωμένη",
  completed: "Ολοκληρώθηκε",
  cancelled_by_client: "Ακύρωση πελάτη",
  cancelled_by_skipper: "Ακύρωση επαγγελματία",
  open: "Ανοιχτό",
  matched: "Βρέθηκε",
  expired_unclaimed: "Έληξε άκαρπο",
  cancelled: "Ακυρώθηκε",
  pending: "Σε αναμονή",
  approved: "Εγκεκριμένο",
  rejected: "Απορρίφθηκε",
  active: "Ενεργός",
  draft: "Ημιτελής",
  suspended: "Σε αναστολή",
  client: "Πελάτης",
  skipper: "Επαγγελματίας",
  admin: "Admin",
  deleted: "Διαγραμμένος",
};

export function Status({ value }) {
  if (!value) return null;
  return <span style={badge(STATUS_TONE[value] || "neutral")}>{STATUS_LABEL[value] || value}</span>;
}

export { button, money, muted, colors, radius };
