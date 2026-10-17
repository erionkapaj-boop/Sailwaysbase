"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Icon from "../components/Icon";
import { useLocalData } from "../useLocalData";
import { tNow } from "../../../lib/platform/tNow";
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

// users.photo_url is written by the account owner themselves (RLS lets them
// update their own row, and the column isn't guarded), so it's untrusted
// input on an admin screen: a "javascript:" URL in an <a href> runs in the
// admin's session on click (React 18 only warns), and a quote or paren breaks
// out of a CSS url(). Real uploads are always https storage URLs.
export function safeImageUrl(url) {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function cssImage(url) {
  const safe = safeImageUrl(url);
  return safe ? `url(${JSON.stringify(safe)}) center/cover` : null;
}

// photoUrl is opt-in — only the accounts list passes it today. Every other
// Row/RowMain caller (bookings, disputes, offers, coverage) is unaffected.
export function RowMain({ title, meta, photoUrl, titleUser, metaUser }) {
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
            background: cssImage(photoUrl) || "#EFEDE8",
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
          {...(titleUser ? { "data-user-text": "" } : {})}
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
          <span {...(metaUser ? { "data-user-text": "" } : {})} style={{ ...muted, fontSize: 12.5, display: "block", marginTop: 3 }}>{meta}</span>
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
  claimed: "success",
  missed: "neutral",
};

// Ετικέτες στη γλώσσα της σελίδας (namespace AdminUi). Διαβάζονται ως απλές
// ιδιότητες (STATUS_LABEL[value]), ώστε οι οθόνες που τις χρησιμοποιούν να μη
// χρειάζονται hook.
function labelMap(group, keys) {
  const out = {};
  for (const k of keys) Object.defineProperty(out, k, { get: () => tNow("AdminUi", `${group}.${k}`), enumerable: true });
  return out;
}

export const STATUS_LABEL = labelMap("status", [
  "confirmed",
  "completed",
  "cancelled_by_client",
  "cancelled_by_skipper",
  "open",
  "matched",
  "expired_unclaimed",
  "cancelled",
  "pending",
  "approved",
  "rejected",
  "active",
  "draft",
  "suspended",
  "client",
  "skipper",
  "admin",
  "deleted",
  "claimed",
  "missed",
  "pending_payment",
]);

export function Status({ value }) {
  if (!value) return null;
  return <span style={badge(STATUS_TONE[value] || "neutral")}>{STATUS_LABEL[value] || value}</span>;
}

export const WALLET_TYPE_LABEL = labelMap("wallet", [
  "purchase",
  "deposit",
  "request_fee",
  "claim_fee",
  "refund_credit",
  "adjustment",
]);

const GENDER_KEYS = ["male", "female", "other"];

// "Waiting for how long" in the one unit that matters for a queue — days
// never turn into a calendar date, however long it has been.
export function waitingFor(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return tNow("AdminUi", "waiting.now");
  if (mins < 60) return tNow("AdminUi", "waiting.minutes", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tNow("AdminUi", "waiting.hours", { n: hours });
  return tNow("AdminUi", "waiting.days", { n: Math.floor(hours / 24) });
}

export function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age -= 1;
  return age;
}

// What an approval actually rests on. The approvals list used to show a name,
// a phone and a price — nothing to approve against.
// omit: αναγνωριστικά γραμμών (role, license, experience, age, gender, price)·
// δέχεται και την εμφανιζόμενη ετικέτα, για οθόνες που τη στέλνουν ακόμα.
export function ProCredentials({ profile, roleLabel, omit = [] }) {
  const t = useTranslations("AdminUi");
  const L = useLocalData();
  if (!profile) return null;
  const age = ageFrom(profile.date_of_birth);
  const items = [
    ["role", roleLabel],
    [
      "license",
      [profile.license_number, profile.license_type && t("credentials.licenseType", { type: L.text(profile.license_type) })]
        .filter(Boolean)
        .join(" · ") || "—",
    ],
    ["experience", profile.years_experience != null ? t("credentials.years", { n: profile.years_experience }) : "—"],
    ["age", age != null ? t("credentials.age", { n: age }) : "—"],
    [
      "gender",
      GENDER_KEYS.includes(profile.gender) ? t(`gender.${profile.gender}`) : L.text(profile.gender) || "—",
    ],
    ["price", profile.price_per_day != null ? t("credentials.price", { price: profile.price_per_day }) : "—"],
  ].filter(([k]) => !omit.includes(k) && !omit.includes(t(`credentials.label.${k}`)));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", fontSize: 13.5 }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <span style={{ ...muted, fontSize: 13 }}>{t(`credentials.label.${k}`)}</span>
          <span style={{ color: colors.ink }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function VerifyHintText() {
  const t = useTranslations("AdminUi");
  return t("verifyHint");
}

// Shown wherever the verify button is — the button alone never said what it
// was vouching for. Στοιχείο React (όχι κείμενο), ώστε να διαβάζει τη γλώσσα
// της σελίδας: χρησιμοποιείται όπου θα μπορούσε να μπει κείμενο, π.χ. {VERIFY_HINT}.
export const VERIFY_HINT = <VerifyHintText />;


// ---- Εικόνα πρώτα: πλακίδια με εικονίδιο, αριθμό και μία λέξη· ετικέτες· αναδυόμενα φίλτρα με πλήθος. ----
const TILE_TONE = {
  brand: { bg: "#E8F0F4", fg: "#2F5F7A" },
  warn: { bg: "#FBF1DD", fg: "#9A6A12" },
  danger: { bg: "#F7E4E1", fg: "#A63A2E" },
  success: { bg: "#E3F1E9", fg: "#2E7355" },
  neutral: { bg: "#EFEDE8", fg: colors.inkSoft },
};

export function IconDisc({ icon, tone = "neutral", size = 40 }) {
  const c = TILE_TONE[tone] || TILE_TONE.neutral;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: c.bg, color: c.fg }}>
      <Icon name={icon} size={Math.round(size * 0.52)} />
    </span>
  );
}

// Ένα μέγεθος με την εικόνα του: εικονίδιο, μεγάλος αριθμός, μία λέξη. Πατιέται και ανοίγει τη λίστα του.
export function KpiTile({ icon, value, label, tone = "neutral", href, kpi }) {
  const live = value > 0;
  const c = TILE_TONE[live ? tone : "neutral"];
  return (
    <Link href={href} data-kpi={kpi} data-kpi-value={value} aria-label={`${label}: ${value}`} style={{ ...panel, display: "flex", flexDirection: "column", gap: 10, padding: "14px 14px 12px", textDecoration: "none", boxSizing: "border-box", minWidth: 0 }}>
      <IconDisc icon={icon} tone={live ? tone : "neutral"} />
      <span style={{ ...money, fontSize: 28, fontWeight: 600, lineHeight: 1, color: live ? c.fg : colors.ink }}>{value}</span>
      <span style={{ ...muted, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </Link>
  );
}

export function KpiGrid({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>{children}</div>;
}

// Γρήγορη ενέργεια: εικονίδιο πάνω, μία λέξη κάτω.
export function ActionTile({ icon, label, href, tone = "brand" }) {
  return (
    <Link href={href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: "1 1 0", minWidth: 84, padding: "12px 8px", textDecoration: "none", ...panel, boxSizing: "border-box" }}>
      <IconDisc icon={icon} tone={tone} size={44} />
      <span style={{ fontSize: 13, color: colors.ink, textAlign: "center" }}>{label}</span>
    </Link>
  );
}

// Μικρή ετικέτα με χρώμα: ρόλος, κατάσταση, ενέργεια.
export function Chip({ tone = "neutral", icon, children, ...rest }) {
  const c = TILE_TONE[tone] || TILE_TONE.neutral;
  return (
    <span {...rest} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: radius.pill, background: c.bg, color: c.fg, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", lineHeight: 1.4 }}>
      {icon && <Icon name={icon} size={12} stroke={2} />}
      {children}
    </span>
  );
}

// Φίλτρα σε μία γραμμή με πλήθος, όπως τα segmented tabs: items = [{ key, label, icon, count }].
export function Segments({ items, value, onChange }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "12px 16px", borderBottom: `1px solid ${colors.border}`, background: colors.bg, scrollbarWidth: "none" }}>
      {items.map((x) => {
        const on = x.key === value;
        return (
          <button key={x.key} type="button" role="tab" aria-selected={on} data-segment={x.key} onClick={() => onChange(x.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 12px", borderRadius: radius.pill, border: `1px solid ${on ? colors.ink : colors.border}`, background: on ? colors.ink : colors.card, color: on ? "#fff" : colors.ink, fontFamily: "inherit", fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
            {x.icon && <Icon name={x.icon} size={15} />}
            {x.label}
            {x.count != null && <span style={{ fontSize: 12, opacity: on ? 0.85 : 0.6 }}>{x.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export { TILE_TONE };

export { button, money, muted, colors, radius };
