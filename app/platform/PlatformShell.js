"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { displayName } from "../../lib/platform/names";
import { AuthProvider, useAuth } from "./AuthContext";
import Footer, { AppFooter } from "./components/Footer";
import Logo from "./components/Logo";
import NotificationPanel from "./components/NotificationPanel";
import MessagesPanel from "./components/MessagesPanel";
import LanguageSwitcher from "./components/LanguageSwitcher";
import HomeAppsMenu from "./components/HomeAppsMenu";
import Avatar from "./components/Avatar";
import AccountMenu from "./components/AccountMenu";
import FeedbackProvider from "./components/FeedbackProvider";
import SideNav, { SIDENAV_CSS } from "./components/SideNav";
import { NAV_CSS } from "./components/NavGroups";
import HealthWatch from "./components/HealthWatch";
import { SECTIONS as ADMIN_SECTIONS, badgeCount, ADMIN_COUNTS_EVENT } from "./admin/AdminShell";
import { adminOverview, setMyLocale } from "../../lib/platform/db";
import { hasPendingBroadcast } from "../../lib/platform/pendingBroadcast";
import { hasPendingDelivery } from "../../lib/platform/pendingDelivery";
import { isEnabledLocale, LOCALE_COOKIE } from "../../lib/platform/i18n";
import { nav, colors, fontSans, container, card, h1, muted, button, tapTarget } from "../../lib/platform/theme";

const navLink = {
  fontSize: 14,
  fontWeight: 400,
  fontFamily: fontSans,
  color: colors.inkSoft,
  textDecoration: "none",
  padding: "6px 4px",
  whiteSpace: "nowrap",
};

// One header for every signed-in account, professional or not: menu on the
// left, who you are in the middle, notifications and messages on the right.
// A client having fewer menu items is not a reason to give them a different
// header shape — the parts they do have should sit where they sit everywhere
// else. Roles beyond skipper (hostess, cook, deckhand) come through here
// unchanged, since nothing in it is specific to what someone does on a boat.
function AccountNavBar({ name, photoUrl, loading, items, activeHref, onSignOut, notifications, refreshNotifications, hideMenuOnWide }) {
  const unreadNotifications = notifications?.pendingRequests ?? 0;
  const unreadBookingIds = notifications?.unreadBookingIds ?? [];

  return (
    <div data-sf-header style={{ ...nav, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", columnGap: 10 }}>
      <AccountMenu items={items} activeHref={activeHref} onSignOut={onSignOut} hideOnWide={hideMenuOnWide} />

      <Link
        href="/platform"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", minWidth: 0 }}
      >
        <Avatar src={photoUrl} name={loading ? "" : name} size={34} />
        <span
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: colors.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: loading ? 60 : undefined,
          }}
        >
          {name || ""}
        </span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
        <LanguageSwitcher />
        <NotificationPanel count={unreadNotifications} onRead={refreshNotifications} />
        <MessagesPanel count={unreadBookingIds.length} />
      </div>
    </div>
  );
}

// Ένα μενού, ίδιο για κάθε λογαριασμό — πελάτη, επαγγελματία, admin — αντί
// για τρία ξεχωριστά μενού που έλεγαν το ίδιο πράγμα με διαφορετικά λόγια.
// Το "Αιτήματα" καλύπτει και τις δύο κατευθύνσεις (εισερχόμενα ως
// επαγγελματίας, εξερχόμενα ως πελάτης) μέσα στην ίδια σελίδα, όχι σε δύο
// διαφορετικά μενού· το ίδιο για "Κρατήσεις". Το "Η διαθεσιμότητά μου" έχει
// νόημα μόνο για όποιον έχει (ή μπορεί να έχει) επαγγελματικό προφίλ.
//
// Πριν εδώ έμπαινε μόνο ένας σύνδεσμος «Πίνακας διαχείρισης», και όλες οι
// επιμέρους ενότητες του admin ζούσαν σε μια δεύτερη, οριζόντια λωρίδα
// κάτω από αυτό το ίδιο μενού (AdminNav) — δύο συστήματα πλοήγησης στην ίδια
// οθόνη, το ένα από τα δύο πάντα οριζόντιο scroll σε κινητό. Τώρα όλες οι
// ενότητες μπαίνουν εδώ, σε ομάδες με επικεφαλίδα — ένα μόνο μενού, παντού.
// Το admin_SECTIONS ζει στο AdminShell.js (χρειάζεται και εκεί, για το ποια
// σελίδα είναι «ενεργή»), οπότε εισάγεται αντί να ξαναγραφτεί.
function buildMenuItems({ role, isAdmin, isOwner, adminCounts, t }) {
  const items = [{ href: "/platform", label: t("menuHome") }];
  const own = [];
  own.push({ href: "/platform/requests", label: t("menuRequests") });
  own.push({ href: "/platform/bookings", label: isAdmin ? t("menuMyBookings") : t("menuBookings") });
  if (role === "skipper" || isAdmin) own.push({ href: "/platform/availability", label: t("menuAvailability") });
  own.push({ href: "/platform/profile", label: t("menuProfile") });
  own.push({ href: "/platform/wallet", label: "Credits" });

  if (!isAdmin) {
    own[0].group = true;
    return [...items, ...own];
  }

  // For an admin the console comes first — it's what they opened the app for
  // — and their own personal pages move to a group of their own at the end.
  for (const s of ADMIN_SECTIONS.filter((x) => isOwner || !x.ownerOnly))
    items.push({
      href: s.href,
      label: s.label,
      heading: s.heading,
      prefix: !s.exact,
      badge: badgeCount(s.badge, adminCounts),
    });
  own[0].heading = t("menuAccount");
  return [...items, ...own];
}

function NavBar() {
  const { session, userRow, profile, loading, signOut, role, isAdmin, isOwner, notifications, refreshNotifications } = useAuth();
  const t = useTranslations("Nav");
  const ts = useTranslations("Shell");
  const headerLocale = useLocale();
  const pathname = usePathname();
  // Δεν διαβάζεται από το AdminCountsContext: αυτό το provider ζει μέσα στο
  // app/platform/admin/layout.js, πιο βαθιά στο δέντρο από εδώ (το μενού
  // είναι πλέον site-wide, όχι μόνο admin), οπότε το context δεν θα έφτανε
  // ποτέ ως εδώ. Ίδιο RPC, δικό του μικρό fetch — ασήμαντο κόστος για ένα
  // κλικ στο μενού, κι έτσι το κόκκινο badge δουλεύει σε ΚΑΘΕ σελίδα, όχι
  // μόνο μέσα στο admin console.
  const [adminCounts, setAdminCounts] = useState({});
  useEffect(() => {
    if (!isAdmin) return;
    const load = () => adminOverview().then(setAdminCounts).catch(() => {});
    load();
    window.addEventListener(ADMIN_COUNTS_EVENT, load);
    return () => window.removeEventListener(ADMIN_COUNTS_EVENT, load);
  }, [isAdmin, pathname]);

  if (session && (isAdmin || role === "skipper" || role === "client")) {
    const menuItems = buildMenuItems({ role, isAdmin, isOwner, adminCounts, t: ts });
    return (
      <>
        <AccountNavBar
          name={displayName(profile, headerLocale) || displayName(userRow, headerLocale) || (isAdmin ? ts("adminName") : undefined)}
          photoUrl={profile?.photo_url || userRow?.photo_url}
          loading={loading}
          items={menuItems}
          activeHref={pathname}
          onSignOut={signOut}
          notifications={notifications}
          refreshNotifications={refreshNotifications}
          hideMenuOnWide={isAdmin}
        />
        {/* Διαχειριστής σε πλατιά οθόνη: η ίδια λίστα μόνιμα αριστερά, παντού (βλ. SideNav). */}
        {isAdmin && <SideNav items={menuItems} activeHref={pathname} onSignOut={signOut} />}
      </>
    );
  }

  // Αρχική, χωρίς σύνδεση: μόνο οι τελείες αριστερά, γλώσσα και Σύνδεση δεξιά.
  // Το λογότυπο είναι ήδη στο κέντρο της σελίδας.
  if (pathname === "/platform") {
    return (
      <div style={{ ...nav, borderBottom: "none", background: "transparent", backdropFilter: "none", position: "static", padding: "10px 14px" }}>
        <HomeAppsMenu />
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <LanguageSwitcher compact />
          <Link href="/platform/login" style={{ ...navLink, ...tapTarget, color: colors.ink, fontSize: 15 }}>
            {t("login")}
          </Link>
        </div>
      </div>
    );
  }

  // Signed out: the plain marketing header.
  return (
    <div style={{ ...nav, flexWrap: "wrap", rowGap: 8, columnGap: 12 }}>
      <Link href="/platform" style={{ textDecoration: "none" }} aria-label={t("homeAriaLabel")}>
        <Logo />
      </Link>
      {/* Header carries Login only — no search link (the home page is the
          search entry point) and deliberately no sign-up: registration is a
          step inside the flow, at the SMS OTP moment, not a separate door. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", rowGap: 8 }}>
        <LanguageSwitcher />
        <Link href="/platform/login" style={{ ...navLink, color: colors.ink }}>
          {t("login")}
        </Link>
      </div>
    </div>
  );
}

// Everything here is inline-styled, which can't express :focus-visible or
// ::placeholder. This one scoped style block covers the accessibility
// requirements (visible focus ring on every interactive element) without
// pulling in a CSS framework — and stays scoped to .platform-scope so the
// pre-existing app is unaffected.
const globalStyles = `
.platform-scope :is(button, a, input, select, textarea):focus-visible {
  outline: 2px solid ${colors.ink};
  outline-offset: 2px;
  border-radius: 6px;
}
.platform-scope ::placeholder { color: ${colors.inkSoft}; opacity: 0.7; }
.platform-scope button:disabled { opacity: 0.45; cursor: not-allowed; }
.platform-scope a:hover { color: ${colors.ink}; }
.platform-scope input[type=date]::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.65; }
.platform-scope input[type=date]::-webkit-calendar-picker-indicator:hover { opacity: 1; }
.platform-scope .sf-cta:hover { background: ${colors.ink}; color: #fff; }
.platform-scope .sf-cta:active { background: ${colors.brandDark}; color: #fff; }
${NAV_CSS}
${SIDENAV_CSS}
@keyframes sf-drawer-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sf-drawer-slide { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes sf-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
/* Όποιος έχει ζητήσει «λιγότερη κίνηση» από το σύστημά του δεν βλέπει κινήσεις. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
`;

// Deliberately loud and always on screen. The whole point of this mode is
// that the page is indistinguishable from the real thing, which is exactly
// what makes forgetting you are in it easy — so the one difference has to be
// impossible to miss.
function ViewAsBanner() {
  const t = useTranslations("Shell");
  const { viewingAs, stopViewAs } = useAuth();
  if (!viewingAs) return null;
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: colors.warn,
        color: "#fff",
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        fontSize: 13,
        fontFamily: fontSans,
      }}
    >
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t.rich("viewingAs", { name: viewingAs.name || viewingAs.phone, b: (c) => <b>{c}</b> })}
      </span>
      <button
        type="button"
        onClick={stopViewAs}
        style={{
          background: "rgba(255,255,255,0.2)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.5)",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        {t("viewAsExit")}
      </button>
    </div>
  );
}

// 0075: an account created without real SMS OTP (no provider configured
// yet) starts with users.phone_verified_at = null and has to wait for an
// admin to confirm it's a real person (Χρήστες → «Επαλήθευση») before it
// can do anything account-specific. Blocks only the "act as a member"
// pages — home, search, the delivery form, and the auth/legal pages a not-yet-verified (or
// signed-out) visitor still needs to reach stay open, same as before.
const VERIFICATION_GATED_PREFIXES = [
  "/platform/requests",
  "/platform/bookings",
  "/platform/wallet",
  "/platform/availability",
  // Only the list of one's own delivery requests — the delivery form itself
  // stays open like search does: picking is fine while waiting, sending is
  // what waits (blocked in the UI and by 0083).
  "/platform/delivery/requests",
  "/platform/profile",
];

function VerificationGate({ children }) {
  const t = useTranslations("Shell");
  const { userRow, isAdmin, signOut } = useAuth();
  const pathname = usePathname();
  // Read after mount only — localStorage doesn't exist during the server render.
  const [resume, setResume] = useState(null);
  useEffect(() => {
    if (hasPendingBroadcast()) setResume("/platform/search");
    else if (hasPendingDelivery()) setResume("/platform/delivery");
  }, []);

  const pending = userRow && !userRow.phone_verified_at && !isAdmin;
  const onGatedPage = VERIFICATION_GATED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!pending || !onGatedPage) return children;

  // Used to offer nothing but "Αποσύνδεση" — a dead end for someone who had
  // just registered and wanted to get on with their search. Browsing and
  // picking stay open while they wait; only sending (which charges) waits.
  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <div style={{ ...card, marginTop: 20, textAlign: "center" }}>
        <h1 style={{ ...h1, fontSize: 20 }}>{t("pendingTitle")}</h1>
        <p style={{ ...muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          {t("pendingLine1")}
        </p>
        <p style={{ ...muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          {t("pendingLine2")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          <Link href={resume || "/platform"} style={{ ...button("primary"), textDecoration: "none" }}>
            {resume ? t("backToChoices") : t("continueSearch")}
          </Link>
          <Link href="/platform/contact" style={{ ...button("secondary"), textDecoration: "none" }}>
            {t("contactUs")}
          </Link>
        </div>
        <button
          type="button"
          onClick={signOut}
          style={{ background: "none", border: "none", padding: 0, marginTop: 16, cursor: "pointer", color: colors.inkSoft, fontSize: 13, textDecoration: "underline", fontFamily: "inherit" }}
        >
          {t("logout")}
        </button>
      </div>
    </div>
  );
}

// A temporary PIN from the admin (Ξέχασα τον κωδικό → επικοινωνία) is only a
// way back in, never meant to stay: until the person picks their own, every
// page except set-pin itself asks for it first. Skipped while an admin is
// only viewing as someone (userRow is theirs then, the session isn't).
function PinChangeGate({ children }) {
  const t = useTranslations("Shell");
  const { userRow, viewingAs } = useAuth();
  const pathname = usePathname();
  if (!userRow?.pin_change_required || viewingAs || pathname.startsWith("/platform/set-pin")) return children;
  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <div style={{ ...card, marginTop: 20, textAlign: "center" }}>
        <h1 style={{ ...h1, fontSize: 20 }}>{t("pinTitle")}</h1>
        <p style={{ ...muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          {t("pinBody")}
        </p>
        <Link
          href="/platform/set-pin?change=1&required=1"
          style={{ ...button("primary"), textDecoration: "none", display: "block", marginTop: 20 }}
        >
          {t("pinSet")}
        </Link>
      </div>
    </div>
  );
}

// Signed in gets the slim app-footer everywhere (client, professional, and
// admin dashboards alike); signed out — the marketing pages — keeps the full
// legal footer.
function SiteFooter() {
  const { session } = useAuth();
  return session ? <AppFooter /> : <Footer />;
}

// Το κέλυφος κάτω από τον πάροχο σύνδεσης: κεφαλίδα, περιεχόμενο, υποσέλιδο. Ο διαχειριστής σε πλατιά
// οθόνη έχει το μόνιμο αριστερό μενού (SideNav): περιεχόμενο ΚΑΙ υποσέλιδο μετακινούνται δεξιά του,
// ώστε τίποτα να μη χάνεται πίσω του.
function ShellBody({ children }) {
  const { session, isAdmin } = useAuth();
  const side = Boolean(session && isAdmin);
  // Η γλώσσα της σελίδας στον browser (βοηθά και ορθογραφικό έλεγχο, και
  // προγράμματα ανάγνωσης οθόνης), και διαθέσιμη σε κώδικα εκτός React
  // (activeLocale στο lib/platform/i18n.js).
  const locale = useLocale();
  const { userRow } = useAuth();
  const router = useRouter();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  // Η γλώσσα ακολουθεί τον λογαριασμό: σε συσκευή που δεν έχει ξαναδιαλέξει
  // γλώσσα, ανοίγει στη γλώσσα του λογαριασμού· αν έχει διαλέξει, η επιλογή
  // της συσκευής γράφεται στον λογαριασμό.
  const accountLocale = userRow?.locale;
  useEffect(() => {
    if (!accountLocale || !isEnabledLocale(accountLocale)) return;
    const saved = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
      ?.split("=")[1];
    if (!saved && accountLocale !== locale) {
      document.cookie = `${LOCALE_COOKIE}=${accountLocale}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    } else if (saved && isEnabledLocale(saved) && saved !== accountLocale) {
      setMyLocale(saved).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLocale]);
  return (
    <div className="platform-scope" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <ViewAsBanner />
      <NavBar />
      <div className={side ? "sf-with-sidenav" : undefined} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1 }}>
          <PinChangeGate>
            <VerificationGate>{children}</VerificationGate>
          </PinChangeGate>
        </div>
        <SiteFooter />
      </div>
    </div>
  );
}

export default function PlatformShell({ children }) {
  return (
    <AuthProvider>
      <FeedbackProvider>
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
        <HealthWatch />
        <ShellBody>{children}</ShellBody>
      </FeedbackProvider>
    </AuthProvider>
  );
}
