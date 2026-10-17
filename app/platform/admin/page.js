"use client";
import { formatCredits } from "../../../lib/platform/credits";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import AdminShell, { useAdminCounts } from "./AdminShell";
import { Panel, Row, RowMain, Empty, KpiTile, KpiGrid, ActionTile, IconDisc, Chip, colors, muted } from "./ui";
import { useAuth } from "../AuthContext";
import { adminDashboard, adminRecentActivity, adminListAccounts, adminInvisibleProfilesCount } from "../../../lib/platform/db";
import { formatMoney } from "../../../lib/platform/notifications";
import { labelForRole } from "../../../lib/platform/roles";
import { fontSans, radius } from "../../../lib/platform/theme";

// Η Επισκόπηση απαντά σε τρεις ερωτήσεις, με αυτή τη σειρά:
//   1. Θέλει κάτι εμένα τώρα; (εκκρεμότητες, αιτήματα που λήγουν)
//   2. Τι έρχεται; (ταξίδια των επόμενων 7 ημερών)
//   3. Πώς πάει η αγορά; (προσφορά/ζήτηση ανά ιδιότητα, τι χάνεται και πού)
// Κάθε αριθμός οδηγεί κάπου ή λέει τι να κάνεις — τα σκέτα σύνολα
// (χρήστες, ολοκληρωμένες) δεν μένουν εδώ· ζουν στις σελίδες τους.

const ACTIVITY_KINDS = ["booking", "signup", "dispute"];
// Η βάση γράφει τον ρόλο της νέας εγγραφής ως ελληνική λέξη (admin_activity, 0090)·
// εδώ μεταφράζεται στη γλώσσα της σελίδας.
const SIGNUP_ROLE = { "\u03b5\u03c0\u03b1\u03b3\u03b3\u03b5\u03bb\u03bc\u03b1\u03c4\u03af\u03b1\u03c2": "professional", "\u03c0\u03b5\u03bb\u03ac\u03c4\u03b7\u03c2": "client" };
const ACTIVITY_TONE = {
  booking: colors.success,
  signup: colors.accent,
  dispute: colors.danger,
};

// «ζητά Skipper», «ζητά Ναύτη» — η μόνη ιδιότητα με ελληνικό όνομα κλίνεται.
function roleAcc(role, t) {
  return role === "deckhand" ? t("deckhandAcc") : labelForRole(role);
}

// Ημερομηνίες ταξιδιού είναι σκέτες "YYYY-MM-DD": διαβάζονται ως τοπική
// μέρα, αλλιώς το new Date() τις μετακινεί ανάλογα με τη ζώνη ώρας.
function localDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayStart() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}
function daysFromToday(iso) {
  return Math.round((localDay(iso) - todayStart()) / 864e5);
}
function dayName(offset, date, t) {
  if (offset === 0) return t("today");
  if (offset === 1) return t("tomorrow");
  return `${t(`weekdayLong.${date.getDay()}`)} ${date.getDate()}/${date.getMonth() + 1}`;
}
function tripDays(start, end) {
  return Math.round((localDay(end) - localDay(start)) / 864e5) + 1;
}

function countdown(iso, now, t) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return t("countdownExpired");
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return t("countdownMinutes", { m });
  return m === 0 ? t("countdownHours", { h }) : t("countdownHoursMinutes", { h, m });
}

function greeting(t) {
  const h = new Date().getHours();
  if (h >= 5 && h < 13) return t("greetingMorning");
  return t("greetingEvening");
}

const linkStyle = {
  color: colors.ink,
  textDecoration: "underline",
  textDecorationColor: colors.border,
  textUnderlineOffset: 3,
};

function PersonLink({ id, name }) {
  const L = useLocalData();
  const shown = L.name(name);
  if (!id) return <span>{shown || "—"}</span>;
  return (
    <Link href={`/platform/admin/user/${id}`} style={linkStyle}>
      {shown || "—"}
    </Link>
  );
}

function Tel({ phone, children }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 11px",
        borderRadius: radius.pill,
        border: `1px solid ${colors.border}`,
        background: colors.card,
        color: colors.ink,
        fontSize: 13,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true">☎</span>
      {children}
    </a>
  );
}

function SectionTitle({ children, hint }) {
  return (
    <div style={{ margin: "30px 2px 10px" }}>
      <h2
        style={{
          margin: 0,
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: colors.inkSoft,
        }}
      >
        {children}
      </h2>
      {hint && <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Με μια ματιά: τέσσερα πλακίδια, εικονίδιο + αριθμός + μία λέξη.
// ---------------------------------------------------------------------------
function Kpis({ counts }) {
  const t = useTranslations("AdminHome");
  const pending = (counts.pending_verification || 0) + (counts.pending_approvals || 0) + (counts.pending_secondary_roles || 0);
  const replacements = (counts.coverage_needed || 0) + (counts.replacement_awaiting_client || 0);
  return (
    <KpiGrid>
      <KpiTile kpi="pending" icon="shield" tone="warn" value={pending} label={t("kpi.pending")} href="/platform/admin/approvals" />
      <KpiTile kpi="replacements" icon="swap" tone="brand" value={replacements} label={t("kpi.replacements")} href="/platform/admin/replacements" />
      <KpiTile kpi="disputes" icon="flag" tone="danger" value={counts.open_disputes || 0} label={t("kpi.disputes")} href="/platform/admin/disputes" />
      <KpiTile kpi="messages" icon="chat" tone="brand" value={counts.contact_new || 0} label={t("kpi.messages")} href="/platform/admin/messages" />
    </KpiGrid>
  );
}

// ---------------------------------------------------------------------------
// Γρήγορη αναζήτηση χρήστη — ο πιο συχνός λόγος να ανοίξεις τη διαχείριση
// είναι «πάρε με τηλέφωνο ο τάδε».
// ---------------------------------------------------------------------------
function QuickSearch() {
  const t = useTranslations("AdminHome");
  const f = useFormat();
  const L = useLocalData();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      adminListAccounts({ search: term, limit: 6 })
        .then((r) => alive && setResults(r.slice(0, 6)))
        .catch(() => alive && setResults([]));
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const showList = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} style={{ position: "relative", marginTop: 14 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const term = q.trim();
          if (results.length === 1) router.push(`/platform/admin/user/${results[0].id}`);
          else if (term) router.push(`/platform/admin/users?q=${encodeURIComponent(term)}`);
        }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "13px 14px 13px 40px",
            fontSize: 15,
            fontFamily: fontSans,
            color: colors.ink,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            outline: "none",
          }}
        />
        <svg
          aria-hidden="true"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.inkSoft}
          strokeWidth="2"
          strokeLinecap="round"
          style={{ position: "absolute", left: 14, top: 15 }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </form>
      {showList && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: "0 12px 32px rgba(22,40,60,0.12)",
            zIndex: 20,
            overflow: "hidden",
          }}
        >
          {results.length === 0 ? (
            <div style={{ ...muted, fontSize: 13.5, padding: "12px 14px" }}>{t("searchNone", { q: q.trim() })}</div>
          ) : (
            results.map((u) => (
              <Link
                key={u.id}
                href={`/platform/admin/user/${u.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "11px 14px",
                  borderBottom: `1px solid ${colors.border}`,
                  textDecoration: "none",
                  color: colors.ink,
                  fontSize: 14.5,
                }}
              >
                <span
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {L.person(u) || "—"}
                  <span style={{ ...muted, fontSize: 12.5, marginLeft: 8 }}>
                    {u.role === "skipper"
                      ? labelForRole(u.crew_role || "skipper")
                      : u.role === "admin"
                        ? "Admin"
                        : t("client")}
                    {u.status === "suspended" ? ` · ${t("suspended")}` : ""}
                  </span>
                </span>
                <span style={{ ...muted, fontSize: 12.5, flexShrink: 0 }}>{u.phone_number}</span>
              </Link>
            ))
          )}
          <Link
            href={`/platform/admin/users?q=${encodeURIComponent(q.trim())}`}
            style={{
              display: "block",
              padding: "10px 14px",
              fontSize: 13,
              color: colors.inkSoft,
              textDecoration: "none",
            }}
          >
            {t("searchAll")} ›
          </Link>
        </div>
      )}
    </div>
  );
}

function QuickActions() {
  const t = useTranslations("AdminHome");
  const { isOwner } = useAuth();
  return (
    <div data-quick-actions style={{ display: "flex", gap: 10, marginTop: 10 }}>
      {isOwner && <ActionTile icon="coins" label={t("qa.credits")} href="/platform/admin/finance" />}
      {isOwner && <ActionTile icon="plus" label={t("qa.offer")} href="/platform/admin/offers" />}
      <ActionTile icon="cal" label={t("qa.bookings")} href="/platform/admin/bookings?filter=upcoming" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Περιμένουν εσένα — ό,τι δεν κινείται μέχρι να το δεις.
// ---------------------------------------------------------------------------
function waitingRows(counts, t) {
  const pendingParts = [
    counts.pending_verification > 0 && t("pendingVerification", { n: counts.pending_verification }),
    counts.pending_approvals > 0 && t("pendingApprovals", { n: counts.pending_approvals }),
    counts.pending_secondary_roles > 0 && t("pendingSecondary", { n: counts.pending_secondary_roles }),
  ].filter(Boolean);
  const pendingTotal =
    (counts.pending_verification || 0) + (counts.pending_approvals || 0) + (counts.pending_secondary_roles || 0);

  return [
    counts.coverage_needed > 0 && {
      href: "/platform/admin/replacements",
      icon: "swap",
      tone: "danger",
      n: counts.coverage_needed,
      title: t("coverageTitle", { n: counts.coverage_needed }),
      meta: t("coverageMeta"),
    },
    counts.replacement_awaiting_client > 0 && {
      href: "/platform/admin/replacements",
      icon: "clock",
      tone: "warn",
      n: counts.replacement_awaiting_client,
      title: t("awaitingClientTitle", { n: counts.replacement_awaiting_client }),
      meta: t("awaitingClientMeta"),
    },
    pendingTotal > 0 && {
      href: "/platform/admin/approvals",
      icon: "shield",
      tone: "warn",
      n: pendingTotal,
      title: t("pendingTitle"),
      meta: t("pendingMeta", { parts: pendingParts.join(" · ") }),
    },
    counts.contact_new > 0 && {
      href: "/platform/admin/messages",
      icon: "chat",
      tone: "brand",
      n: counts.contact_new,
      title: t("contactTitle", { n: counts.contact_new }),
      meta: t("contactMeta"),
    },
    counts.open_disputes > 0 && {
      href: "/platform/admin/disputes",
      icon: "flag",
      tone: "danger",
      n: counts.open_disputes,
      title: t("disputesTitle", { n: counts.open_disputes }),
      meta: t("disputesMeta"),
    },
    counts.profiles_invisible > 0 && {
      href: "/platform/admin/users?filter=invisible",
      icon: "eye",
      tone: "neutral",
      n: counts.profiles_invisible,
      title: t("invisibleTitle", { n: counts.profiles_invisible }),
      meta: t("invisibleMeta", { n: counts.profiles_invisible }),
    },
  ].filter(Boolean);
}

function WaitingOnYou({ rows }) {
  const t = useTranslations("AdminHome");
  if (rows.length === 0) return null;
  return (
    <>
      <SectionTitle>{t("waitingTitle")}</SectionTitle>
      <Panel padded={false}>
        {rows.map((r) => (
          <Link key={r.title} href={r.href} data-waiting-row style={{ textDecoration: "none" }}>
            <Row>
              <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                <IconDisc icon={r.icon} tone={r.tone} size={42} />
                <span style={{ minWidth: 0, fontSize: 14.5, fontWeight: 500, color: colors.ink }}>{r.title}</span>
              </span>
              <Chip tone={r.tone === "neutral" ? "neutral" : r.tone} icon="chev">{t("review")}</Chip>
            </Row>
          </Link>
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Κινδυνεύουν να χαθούν — αιτήματα που λήγουν τις επόμενες 12 ώρες
// χωρίς να τα έχει αποδεχτεί κανείς. Ένα τηλέφωνο τώρα σώζει μια κράτηση.
// ---------------------------------------------------------------------------
function ExpiringCard({ item, now }) {
  const t = useTranslations("AdminHome");
  const f = useFormat();
  const L = useLocalData();
  const hoursLeft = (new Date(item.expires_at).getTime() - now) / 3600e3;
  const hot = hoursLeft < 3;
  const waiting = item.waiting || [];
  const pinged = Number(item.pinged) || 0;
  const declined = Number(item.declined) || 0;
  const allDeclined = pinged > 0 && declined >= pinged;
  const what = item.kind === "delivery" ? t("deliveryRole", { role: roleAcc(item.role, t) }) : roleAcc(item.role, t);

  let advice;
  if (pinged === 0) advice = t("adviceNone");
  else if (allDeclined) advice = t("adviceDeclined", { n: pinged });
  else if (waiting.length > 0) advice = t("adviceWaiting", { n: waiting.length });

  return (
    <div
      style={{
        padding: "15px 16px",
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: colors.ink,
              lineHeight: 1.35,
            }}
          >
            <PersonLink id={item.client_id} name={item.client_name} /> {t("requests", { what })}
          </div>
          <div style={{ ...muted, fontSize: 13, marginTop: 3 }}>
            {[L.text(item.place), item.region && item.region !== item.place ? L.text(item.region) : null].filter(Boolean).join(", ")}
            {item.place ? " · " : ""}
            {item.start === item.end ? f.date(item.start) : `${f.date(item.start)} → ${f.date(item.end)}`}
          </div>
        </div>
        <span
          title={t("expiresTitle")}
          style={{
            flexShrink: 0,
            padding: "4px 10px",
            borderRadius: radius.pill,
            fontSize: 12.5,
            fontWeight: 600,
            background: hot ? "#F7E4E1" : "#F6EFE2",
            color: hot ? colors.danger : colors.warn,
            whiteSpace: "nowrap",
          }}
        >
          {t("expiresIn", { time: countdown(item.expires_at, now, t) })}
        </span>
      </div>

      <div style={{ fontSize: 13, color: colors.ink, marginTop: 10 }}>
        {pinged > 0 && (
          <span style={{ ...muted, fontSize: 13 }}>
            {t("sentTo", { pinged, declined })}{" "}
          </span>
        )}
        {advice}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <Tel phone={item.client_phone}>{t("client")}</Tel>
        {waiting.map((w) => (
          <Tel key={w.id} phone={w.phone}>
            {L.name(w.name)}
          </Tel>
        ))}
      </div>
    </div>
  );
}

function AtRisk({ items, now }) {
  const t = useTranslations("AdminHome");
  if (items.length === 0) return null;
  return (
    <>
      <SectionTitle hint={t("atRiskHint")}>
        {t("atRiskTitle")}
      </SectionTitle>
      <section
        style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderLeft: `3px solid ${colors.danger}`,
          borderRadius: radius.lg,
          overflow: "hidden",
        }}
      >
        {items.map((it) => (
          <ExpiringCard key={`${it.kind}-${it.id}`} item={it} now={now} />
        ))}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Επόμενες 7 μέρες — μια λωρίδα εβδομάδας και από κάτω οι κρατήσεις
// ανά ημέρα, με πελάτη και επαγγελματία.
// ---------------------------------------------------------------------------
function Upcoming({ items, loaded }) {
  const t = useTranslations("AdminHome");
  const L = useLocalData();
  const [focus, setFocus] = useState(null);
  const days = useMemo(() => {
    const base = todayStart();
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return {
        offset: i,
        date: d,
        items: items.filter((it) => daysFromToday(it.start) === i),
      };
    });
  }, [items]);
  const shown = days.filter((d) => d.items.length > 0 && (focus == null || d.offset === focus));

  return (
    <>
      <SectionTitle>{t("upcomingTitle")}</SectionTitle>
      <Panel padded={false}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          {days.map((d) => {
            const n = d.items.length;
            const active = focus === d.offset;
            return (
              <button
                key={d.offset}
                type="button"
                disabled={n === 0}
                onClick={() => setFocus(active ? null : d.offset)}
                aria-pressed={active}
                aria-label={t("dayTrips", { day: dayName(d.offset, d.date, t), n })}
                style={{
                  background: active ? colors.seaGlass : "none",
                  border: "none",
                  borderRight: d.offset < 7 ? `1px solid ${colors.border}` : "none",
                  padding: "10px 0 9px",
                  cursor: n ? "pointer" : "default",
                  fontFamily: fontSans,
                  color: colors.ink,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    color: d.offset === 0 ? colors.ink : colors.inkSoft,
                    fontWeight: d.offset === 0 ? 700 : 500,
                    letterSpacing: "0.03em",
                  }}
                >
                  {d.offset === 0 ? t("todayShort") : t(`weekdayShort.${d.date.getDay()}`)}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{d.date.getDate()}</span>
                <span style={{ display: "flex", gap: 2, height: 6 }}>
                  {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                    <span
                      key={i}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: colors.accent,
                      }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        {loaded && items.length === 0 && <Empty>{t("upcomingNone")}</Empty>}
        {shown.map((d) => (
          <div key={d.offset}>
            <div
              style={{
                padding: "10px 16px 4px",
                fontSize: 12,
                fontWeight: 600,
                color: d.offset === 0 ? colors.ink : colors.inkSoft,
              }}
            >
              {dayName(d.offset, d.date, t)}
            </div>
            {d.items.map((it) => (
              <div
                key={`${it.kind}-${it.id}`}
                style={{
                  padding: "6px 16px 12px",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14.5,
                      fontWeight: 600,
                      color: colors.ink,
                      minWidth: 0,
                    }}
                  >
                    {L.text(it.place) || "—"}
                    <span style={{ ...muted, fontWeight: 400, fontSize: 13 }}> · {labelForRole(it.role)}</span>
                  </span>
                  <span style={{ ...muted, fontSize: 12.5, flexShrink: 0 }}>
                    {it.kind === "delivery"
                      ? t("delivery")
                      : t("tripDays", { n: tripDays(it.start, it.end) })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: colors.ink, marginTop: 3 }}>
                  <PersonLink id={it.client_id} name={it.client_name} />
                  <span style={{ ...muted }}> {t("with")} </span>
                  <PersonLink id={it.pro_id} name={it.pro_name} />
                </div>
              </div>
            ))}
          </div>
        ))}
        {items.length > 0 && (
          <Link
            href="/platform/admin/bookings?filter=upcoming"
            style={{
              display: "block",
              padding: "11px 16px",
              fontSize: 13,
              color: colors.inkSoft,
              textDecoration: "none",
            }}
          >
            {t("upcomingAll")} ›
          </Link>
        )}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Η αγορά — ανά ιδιότητα, πόσοι είναι διαθέσιμοι τον επόμενο μήνα απέναντι
// σε όσα ζητήθηκαν τον τελευταίο, και πόσα από αυτά βρήκαν άνθρωπο.
// ---------------------------------------------------------------------------
function MarketRow({ m }) {
  const t = useTranslations("AdminHome");
  const requests = Number(m.requests) || 0;
  const matched = Number(m.matched) || 0;
  const lost = Number(m.lost) || 0;
  const rest = Math.max(0, requests - matched - lost);
  const approved = Number(m.approved) || 0;
  const available = Number(m.available) || 0;
  const short = available === 0 && (requests > 0 || Number(m.open) > 0);
  const decided = matched + lost;
  const pct = decided > 0 ? Math.round((matched / decided) * 100) : null;

  return (
    <div
      style={{
        padding: "13px 16px",
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>{labelForRole(m.role)}</span>
        <span
          style={{
            fontSize: 13,
            color: short ? colors.danger : colors.ink,
            fontWeight: short ? 600 : 400,
          }}
        >
          {t("available", { n: available })}
          <span style={{ ...muted, fontWeight: 400 }}> {t("availableOf", { n: approved })}</span>
        </span>
      </div>

      {requests > 0 ? (
        <>
          <div
            aria-hidden="true"
            style={{
              display: "flex",
              height: 7,
              borderRadius: 4,
              overflow: "hidden",
              background: colors.seaGlass,
              marginTop: 9,
            }}
          >
            <span
              style={{
                width: `${(matched / requests) * 100}%`,
                background: colors.success,
              }}
            />
            <span
              style={{
                width: `${(rest / requests) * 100}%`,
                background: "#C9D3D1",
              }}
            />
            <span
              style={{
                width: `${(lost / requests) * 100}%`,
                background: colors.danger,
              }}
            />
          </div>
          <div style={{ ...muted, fontSize: 12.5, marginTop: 6 }}>
            {t("marketRequests", { requests, matched })}
            {lost > 0 ? ` · ${t("marketLost", { n: lost })}` : ""}
            {pct != null ? ` · ${t("marketRate", { pct })}` : ""}
          </div>
        </>
      ) : (
        <div style={{ ...muted, fontSize: 12.5, marginTop: 6 }}>{t("marketNone")}</div>
      )}
      {short && (
        <div style={{ fontSize: 12.5, color: colors.danger, marginTop: 5 }}>
          {approved === 0 ? t("marketNoApproved") : t("marketNoAvailability")}{" "}
          {approved > 0 && (
            <Link
              href={`/platform/admin/users?tab=pro&crew=${m.role}`}
              style={{ color: colors.danger, whiteSpace: "nowrap" }}
            >
              {t("marketView")} ›
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Market({ market }) {
  const t = useTranslations("AdminHome");
  if (!market?.length) return null;
  return (
    <>
      <SectionTitle hint={t("marketHint")}>
        {t("marketTitle")}
      </SectionTitle>
      <Panel padded={false}>
        {market.map((m) => (
          <MarketRow key={m.role} m={m} />
        ))}
        {market.some((m) => Number(m.requests) > 0) && (
          <div
            style={{
              display: "flex",
              gap: 14,
              padding: "10px 16px",
              fontSize: 11.5,
              color: colors.inkSoft,
              flexWrap: "wrap",
            }}
          >
            <Legend color={colors.success}>{t("legendMatched")}</Legend>
            <Legend color="#C9D3D1">{t("legendOpen")}</Legend>
            <Legend color={colors.danger}>{t("legendExpired")}</Legend>
          </div>
        )}
      </Panel>
    </>
  );
}

function Legend({ color, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 6. Τι αξίζει να ξέρεις — συμπεράσματα που αλλιώς θα έπρεπε να βγάλεις μόνος
// συγκρίνοντας νούμερα, και τα αιτήματα που χάθηκαν (ένα τηλέφωνο στον
// πελάτη μπορεί να τον κρατήσει).
// ---------------------------------------------------------------------------
function buildInsights(dash, counts, t, L) {
  const out = [];
  // Οι ελλείψεις ανά ιδιότητα φαίνονται ήδη (με κόκκινο) στην «Αγορά» —
  // εδώ μόνο ό,τι δεν φαίνεται αλλού.
  const weak = (dash.regions || [])
    .filter((r) => Number(r.lost) >= 2 && Number(r.lost) / Math.max(1, Number(r.requests)) >= 0.35)
    .sort((a, b) => Number(b.lost) - Number(a.lost))[0];
  if (weak) {
    out.push({
      tone: "warn",
      text: t("insightWeak", { region: L.text(weak.region), lost: weak.lost, requests: weak.requests }),
    });
  }
  const top = (dash.regions || [])[0];
  if (top && Number(top.requests) >= 3 && top !== weak) {
    out.push({
      tone: "plain",
      text: t("insightTop", { region: L.text(top.region), requests: top.requests }),
    });
  }
  if (dash.dormant_clients > 0) {
    out.push({
      tone: "plain",
      text: t("insightDormant", { n: dash.dormant_clients }),
      href: "/platform/admin/users?tab=client",
      cta: t("ctaClients"),
    });
  }
  if (counts.suspended_count > 0) {
    out.push({
      tone: "plain",
      text: t("insightSuspended", { n: counts.suspended_count }),
      href: "/platform/admin/users?tab=suspended",
      cta: t("ctaView"),
    });
  }
  return out;
}

const TONE_DOT = {
  danger: colors.danger,
  warn: colors.accent,
  plain: colors.inkSoft,
};

function Insights({ insights, lost }) {
  const t = useTranslations("AdminHome");
  if (insights.length === 0 && lost.length === 0) return null;
  return (
    <>
      <SectionTitle>{t("insightsTitle")}</SectionTitle>
      <Panel padded={false}>
        {insights.map((i, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              gap: 12,
              padding: "13px 16px",
              borderBottom: `1px solid ${colors.border}`,
              alignItems: "flex-start",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: TONE_DOT[i.tone],
                marginTop: 7,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 14,
                color: colors.ink,
                lineHeight: 1.5,
                flex: 1,
              }}
            >
              {i.text}
              {i.href && (
                <>
                  {" "}
                  <Link
                    href={i.href}
                    style={{
                      color: colors.inkSoft,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {i.cta} ›
                  </Link>
                </>
              )}
            </span>
          </div>
        ))}
        {lost.length > 0 && <LostList lost={lost} />}
      </Panel>
    </>
  );
}

function LostList({ lost }) {
  const t = useTranslations("AdminHome");
  const f = useFormat();
  const L = useLocalData();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "13px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: fontSans,
          color: colors.ink,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: colors.danger,
            marginTop: 7,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 14, lineHeight: 1.5, flex: 1 }}>
          {t("lostSummary", { n: lost.length })}{" "}
          <span
            style={{
              color: colors.inkSoft,
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            {open ? t("close") : t("whoWere")} {open ? "▴" : "▾"}
          </span>
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 6px 35px" }}>
          <p style={{ ...muted, fontSize: 12.5, margin: "0 0 6px" }}>
            {t("lostNote")}
          </p>
          {lost.map((l) => (
            <div
              key={l.id}
              style={{
                padding: "9px 0",
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: colors.ink }}>
                    <PersonLink id={l.client_id} name={l.client_name} />
                    <span style={{ ...muted, fontSize: 13 }}> · {labelForRole(l.role)}</span>
                  </div>
                  <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>
                    {[L.text(l.place || l.region), `${f.date(l.start)} → ${f.date(l.end)}`].filter(Boolean).join(" · ")}
                    {Number(l.pinged) === 0 ? ` · ${t("notSent")}` : ""}
                  </div>
                </div>
                <Tel phone={l.client_phone}>{t("call")}</Tel>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Η εβδομάδα σε τέσσερις αριθμούς, μαζί με την προηγούμενη για σύγκριση.
// ---------------------------------------------------------------------------
function Delta({ now, prev, unit = "" }) {
  const t = useTranslations("AdminHome");
  const a = Number(now) || 0;
  const b = Number(prev) || 0;
  if (a === b) return <span style={{ ...muted, fontSize: 12 }}>{t("deltaSame")}</span>;
  const up = a > b;
  return (
    <span style={{ fontSize: 12, color: up ? colors.success : colors.inkSoft }}>
      {up ? "▲" : "▼"} {t("deltaFrom", { b, unit })}
    </span>
  );
}

function Week({ week }) {
  const t = useTranslations("AdminHome");
  const { isOwner } = useAuth();
  if (!week) return null;
  const cells = [
    {
      key: "signups",
      v: week.signups,
      p: week.signups_prev,
      href: "/platform/admin/users?tab=all",
    },
    { key: "requests", v: week.requests, p: week.requests_prev },
    {
      key: "bookings",
      v: week.bookings,
      p: week.bookings_prev,
      href: "/platform/admin/bookings",
    },
    // Οι πωλήσεις: μόνο για τον ιδιοκτήτη (0112).
    isOwner && {
      key: "sales",
      v: week.sales_eur,
      p: week.sales_eur_prev,
      money: true,
      href: "/platform/admin/finance",
    },
  ].filter(Boolean);
  return (
    <>
      <SectionTitle hint={t("weekHint")}>{t("weekTitle")}</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 1,
          background: colors.border,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          overflow: "hidden",
        }}
      >
        {cells.map((c) => {
          const body = (
            <>
              <div style={{ ...muted, fontSize: 12.5 }}>{t(`week.${c.key}`)}</div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: colors.ink,
                  margin: "4px 0 2px",
                  letterSpacing: "-0.02em",
                }}
              >
                {c.money ? `${formatMoney(c.v ?? 0)}€` : (c.v ?? "—")}
              </div>
              <Delta now={c.v} prev={c.p} unit={c.money ? "€" : ""} />
            </>
          );
          const style = {
            background: colors.card,
            padding: "14px 16px",
            textDecoration: "none",
            display: "block",
          };
          return c.href ? (
            <Link key={c.key} href={c.href} style={style}>
              {body}
            </Link>
          ) : (
            <div key={c.key} style={style}>
              {body}
            </div>
          );
        })}
      </div>
      {Number(week.refunds) > 0 && (
        <p style={{ ...muted, fontSize: 12.5, margin: "8px 2px 0" }}>
          {t(Math.abs(Number(week.refunds)) === 1 ? "refundsOne" : "refundsMany", { credits: formatCredits(week.refunds) })}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 8. Πρόσφατη δραστηριότητα — λίγες γραμμές, με επιλογή για περισσότερες.
// ---------------------------------------------------------------------------
function Activity({ activity }) {
  const t = useTranslations("AdminHome");
  const f = useFormat();
  const L = useLocalData();
  const [all, setAll] = useState(false);
  const list = all ? activity : activity.slice(0, 6);
  return (
    <>
      <SectionTitle>{t("activityTitle")}</SectionTitle>
      <Panel padded={false}>
        {activity.length === 0 && <Empty>{t("activityNone")}</Empty>}
        {list.map((a, i) => {
          const row = (
          <Row key={`${a.kind}-${a.at}-${i}`}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: ACTIVITY_TONE[a.kind] || colors.inkSoft,
                  flexShrink: 0,
                }}
              />
              <RowMain
                title={a.kind === "signup" ? L.name(a.label) : L.text(a.label)}
                meta={`${ACTIVITY_KINDS.includes(a.kind) ? t(`activity.${a.kind}`) : a.kind}${a.detail ? ` · ${a.kind === "signup" && SIGNUP_ROLE[a.detail] ? t(`activity.signupRole.${SIGNUP_ROLE[a.detail]}`) : L.text(a.detail)}` : ""}`}
              />
            </span>
            <span style={{ ...muted, fontSize: 11.5, flexShrink: 0 }}>{f.timeAgo(a.at)}</span>
            {a.href && <span style={{ ...muted, fontSize: 18, marginLeft: 6 }}>›</span>}
          </Row>
          );
          // Κάθε γραμμή ανοίγει ό,τι αφορά (0090): τον χρήστη ή τις αναφορές.
          return a.href ? (
            <Link key={`${a.kind}-${a.at}-${i}`} href={a.href} style={{ textDecoration: "none", color: "inherit" }}>
              {row}
            </Link>
          ) : (
            row
          );
        })}
        {activity.length > 6 && (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            style={{
              width: "100%",
              padding: "11px 16px",
              background: "none",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: fontSans,
              fontSize: 13,
              color: colors.inkSoft,
            }}
          >
            {all ? t("less") : t("more", { count: activity.length - 6 })}
          </button>
        )}
      </Panel>
    </>
  );
}

export default function AdminOverview() {
  const t = useTranslations("AdminHome");
  const f = useFormat();
  const L = useLocalData();
  const menuCounts = useAdminCounts();
  const [invisible, setInvisible] = useState(0);
  const counts = { ...menuCounts, profiles_invisible: invisible };
  const { userRow } = useAuth();
  const [dash, setDash] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const load = () => {
      adminDashboard()
        .then((d) => {
          setDash(d);
          setError(false);
        })
        .catch(() => setError(true));
      adminRecentActivity(18)
        .then(setActivity)
        .catch(() => {});
      adminInvisibleProfilesCount()
        .then(setInvisible)
        .catch(() => {});
    };
    load();
    // Οι αντίστροφες μετρήσεις «λήγει σε…» προχωρούν κάθε λεπτό· τα δεδομένα
    // ξαναδιαβάζονται κάθε 5 λεπτά, όσο η καρτέλα μένει ανοιχτή.
    const tick = setInterval(() => setNow(Date.now()), 60e3);
    const refresh = setInterval(load, 5 * 60e3);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, []);

  const loaded = !!dash;
  const d = dash || {};
  const expiring = (d.expiring || []).filter((e) => new Date(e.expires_at).getTime() > now);
  const upcoming = d.upcoming || [];
  const rows = waitingRows(counts, t);
  const insights = loaded ? buildInsights(d, counts, t, L) : [];

  const nameOf = L.person(userRow);
  const firstName = (nameOf || "").trim().split(/\s+/)[0];
  const today = new Date();
  const dateLine = `${t(`weekdayLong.${today.getDay()}`)} ${today.getDate()} ${f.monthNames("genitive")[today.getMonth()]}`;

  return (
    <AdminShell
      title={`${greeting(t)}${firstName ? `, ${firstName}` : ""}`}
      subtitle={dateLine.replace(/^./, (c) => c.toUpperCase())}
    >
      <Kpis counts={counts} />
      <QuickSearch />
      <QuickActions />

      {error && (
        <p style={{ fontSize: 13, color: colors.danger, margin: "18px 2px 0" }}>
          {t("loadFailed")}
        </p>
      )}

      <WaitingOnYou rows={rows} />
      <AtRisk items={expiring} now={now} />
      <Upcoming items={upcoming} loaded={loaded} />
      <Market market={d.market} />
      <Insights insights={insights} lost={d.lost || []} />
      <Week week={d.week} />
      <Activity activity={activity} />
    </AdminShell>
  );
}
