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
import AccountMenu from "./components/AccountMenu";
import { SECTIONS as ADMIN_SECTIONS } from "./admin/AdminShell";
import { hasStashedAdminSession, returnToAdminSession } from "../../lib/platform/db";
import { nav, colors, fontSans } from "../../lib/platform/theme";

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
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          // Reserved from the first frame so the row doesn't shift sideways
          // once the profile finishes loading.
          <span
            aria-hidden="true"
            style={{ width: 34, height: 34, borderRadius: "50%", background: colors.border, flexShrink: 0 }}
          />
        )}
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
function buildMenuItems({ role, isAdmin }) {
  const items = [{ href: "/platform", label: "Αρχική" }];
  items.push({ href: "/platform/requests", label: "Αιτήματα", group: true });
  // Πάντα ξεκάθαρο ότι είναι ΤΟ ΔΙΚΟ ΣΟΥ, ξεχωριστό από το «Όλες οι
  // κρατήσεις» του admin παρακάτω — πριν δεν συνυπήρχαν στο ίδιο μενού,
  // οπότε δεν χρειαζόταν διάκριση.
  items.push({ href: "/platform/bookings", label: isAdmin ? "Οι κρατήσεις μου" : "Κρατήσεις" });
  if (role === "skipper" || isAdmin) {
    items.push({ href: "/platform/availability", label: "Η διαθεσιμότητά μου" });
  }
  items.push({ href: "/platform/profile", label: "Το προφίλ μου" });
  items.push({ href: "/platform/wallet", label: "Το πορτοφόλι μου" });

  if (isAdmin) {
    for (const s of ADMIN_SECTIONS) items.push({ href: s.href, label: s.label, heading: s.heading, prefix: !s.exact });
  }
  return items;
}

function NavBar() {
  const { session, userRow, profile, loading, signOut, role, isAdmin, notifications, refreshNotifications } = useAuth();
  const t = useTranslations("Nav");
  const pathname = usePathname();

  if (session && (isAdmin || role === "skipper" || role === "client")) {
    return (
      <AccountNavBar
        name={profile?.full_name || userRow?.full_name || (isAdmin ? "Διαχειριστής" : undefined)}
        photoUrl={profile?.photo_url || userRow?.photo_url}
        loading={loading}
        items={buildMenuItems({ role, isAdmin })}
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
        Προβολή ως <b>{viewingAs.name || viewingAs.phone}</b> — μόνο ανάγνωση
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

// Visible on every screen while signed in as a test account through "Σύνδεση
// ως" (a real session swap — see loginAsTestAccount), so getting back to
// admin never means remembering the admin PIN again. Reads sessionStorage
// directly rather than through AuthContext: it has to survive full sign-ins
// (this account's own, then back to admin's), which reset everything
// AuthContext tracks about "who is this" but never touch this one stashed
// value.
function ReturnToAdminBanner() {
  const router = useRouter();
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setVisible(hasStashedAdminSession());
  }, [session]);

  if (!visible) return null;

  async function handleReturn() {
    setBusy(true);
    try {
      await returnToAdminSession();
      router.push("/platform/admin");
    } catch {
      // Stashed tokens can expire if the test session ran long — the only
      // way back at that point is a normal admin sign-in.
      router.push("/platform/admin/login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: colors.ink,
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
      <span>Συνδεδεμένος ως δοκιμαστικός λογαριασμός</span>
      <button
        type="button"
        disabled={busy}
        onClick={handleReturn}
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
        {busy ? "…" : "Επιστροφή σε admin"}
      </button>
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
      <style>{globalStyles}</style>
      <div className="platform-scope" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <ReturnToAdminBanner />
        <ViewAsBanner />
        <NavBar />
        <div style={{ flex: 1 }}>{children}</div>
        <SiteFooter />
      </div>
    </AuthProvider>
  );
}
