"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthProvider, useAuth } from "./AuthContext";
import Footer, { AppFooter } from "./components/Footer";
import Logo from "./components/Logo";
import NotificationPanel from "./components/NotificationPanel";
import MessagesPanel from "./components/MessagesPanel";
import Avatar from "./components/Avatar";
import AccountMenu from "./components/AccountMenu";
import { SECTIONS as ADMIN_SECTIONS, badgeCount, ADMIN_COUNTS_EVENT } from "./admin/AdminShell";
import { adminOverview } from "../../lib/platform/db";
import { hasPendingBroadcast } from "../../lib/platform/pendingBroadcast";
import { hasPendingDelivery } from "../../lib/platform/pendingDelivery";
import { nav, colors, fontSans, container, card, h1, muted, button } from "../../lib/platform/theme";

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
function AccountNavBar({ name, photoUrl, loading, items, activeHref, onSignOut, notifications, refreshNotifications }) {
  const unreadNotifications = notifications?.pendingRequests ?? 0;
  const unreadBookingIds = notifications?.unreadBookingIds ?? [];

  return (
    <div style={{ ...nav, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", columnGap: 10 }}>
      <AccountMenu items={items} activeHref={activeHref} onSignOut={onSignOut} />

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
function buildMenuItems({ role, isAdmin, adminCounts }) {
  const items = [{ href: "/platform", label: "Αρχική" }];
  const own = [];
  own.push({ href: "/platform/requests", label: "Αιτήματα" });
  own.push({ href: "/platform/bookings", label: isAdmin ? "Οι κρατήσεις μου" : "Κρατήσεις" });
  if (role === "skipper" || isAdmin) own.push({ href: "/platform/availability", label: "Η διαθεσιμότητά μου" });
  own.push({ href: "/platform/profile", label: "Το προφίλ μου" });
  own.push({ href: "/platform/wallet", label: "Το πορτοφόλι μου" });

  if (!isAdmin) {
    own[0].group = true;
    return [...items, ...own];
  }

  // For an admin the console comes first — it's what they opened the app for
  // — and their own personal pages move to a group of their own at the end.
  for (const s of ADMIN_SECTIONS)
    items.push({
      href: s.href,
      label: s.label,
      heading: s.heading,
      prefix: !s.exact,
      badge: badgeCount(s.badge, adminCounts),
    });
  own[0].heading = "Ο λογαριασμός μου";
  return [...items, ...own];
}

function NavBar() {
  const { session, userRow, profile, loading, signOut, role, isAdmin, notifications, refreshNotifications } = useAuth();
  const t = useTranslations("Nav");
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
    return (
      <AccountNavBar
        name={profile?.full_name || userRow?.full_name || (isAdmin ? "Διαχειριστής" : undefined)}
        photoUrl={profile?.photo_url || userRow?.photo_url}
        loading={loading}
        items={buildMenuItems({ role, isAdmin, adminCounts })}
        activeHref={pathname}
        onSignOut={signOut}
        notifications={notifications}
        refreshNotifications={refreshNotifications}
      />
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
@keyframes sf-drawer-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sf-drawer-slide { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes sf-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
`;

// Deliberately loud and always on screen. The whole point of this mode is
// that the page is indistinguishable from the real thing, which is exactly
// what makes forgetting you are in it easy — so the one difference has to be
// impossible to miss.
function ViewAsBanner() {
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
        Βλέπεις ως <b>{viewingAs.name || viewingAs.phone}</b>. Μόνο ανάγνωση.
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
        Έξοδος
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
        <h1 style={{ ...h1, fontSize: 20 }}>Ο λογαριασμός σου ελέγχεται</h1>
        <p style={{ ...muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          Ελέγχουμε κάθε νέα εγγραφή, συνήθως μέσα στην ημέρα.
          Δεν χρειάζεται να κάνεις τίποτα άλλο.
        </p>
        <p style={{ ...muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          Μέχρι τότε μπορείς να ψάχνεις και να διαλέγεις επαγγελματίες· η αποστολή αιτήματος ενεργοποιείται μόλις
          εγκριθεί ο λογαριασμός σου. Δεν έχεις χρεωθεί τίποτα.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          <Link href={resume || "/platform"} style={{ ...button("primary"), textDecoration: "none" }}>
            {resume ? "Γύρνα στις επιλογές σου" : "Συνέχισε την αναζήτηση"}
          </Link>
          <Link href="/platform/contact" style={{ ...button("secondary"), textDecoration: "none" }}>
            Επικοινώνησε μαζί μας
          </Link>
        </div>
        <button
          type="button"
          onClick={signOut}
          style={{ background: "none", border: "none", padding: 0, marginTop: 16, cursor: "pointer", color: colors.inkSoft, fontSize: 13, textDecoration: "underline", fontFamily: "inherit" }}
        >
          Αποσύνδεση
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
  const { userRow, viewingAs } = useAuth();
  const pathname = usePathname();
  if (!userRow?.pin_change_required || viewingAs || pathname.startsWith("/platform/set-pin")) return children;
  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <div style={{ ...card, marginTop: 20, textAlign: "center" }}>
        <h1 style={{ ...h1, fontSize: 20 }}>Όρισε τον δικό σου κωδικό</h1>
        <p style={{ ...muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          Μπήκες με προσωρινό κωδικό από την ομάδα μας. Για την ασφάλειά σου, διάλεξε τώρα έναν δικό σου — τον
          προσωρινό τον γνωρίζει και κάποιος άλλος.
        </p>
        <Link
          href="/platform/set-pin?change=1&required=1"
          style={{ ...button("primary"), textDecoration: "none", display: "block", marginTop: 20 }}
        >
          Ορισμός κωδικού
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

export default function PlatformShell({ children }) {
  return (
    <AuthProvider>
      <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      <div className="platform-scope" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <ViewAsBanner />
        <NavBar />
        <div style={{ flex: 1 }}>
          <PinChangeGate>
            <VerificationGate>{children}</VerificationGate>
          </PinChangeGate>
        </div>
        <SiteFooter />
      </div>
    </AuthProvider>
  );
}
