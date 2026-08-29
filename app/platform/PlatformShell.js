"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthProvider, useAuth } from "./AuthContext";
import Footer, { AppFooter } from "./components/Footer";
import Logo from "./components/Logo";
import NotificationPanel from "./components/NotificationPanel";
import MessagesPanel from "./components/MessagesPanel";
import AccountMenu from "./components/AccountMenu";
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
function AccountNavBar({ name, photoUrl, loading, items, onSignOut, notifications, refreshNotifications }) {
  const unreadNotifications = notifications?.pendingRequests ?? 0;
  const unreadBookingIds = notifications?.unreadBookingIds ?? [];

  return (
    <div style={{ ...nav, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", columnGap: 10 }}>
      <AccountMenu items={items} onSignOut={onSignOut} />

      <Link
        href="/platform"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", minWidth: 0 }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          // Reserved from the first frame so the row doesn't shift sideways
          // once the profile finishes loading.
          <span
            aria-hidden="true"
            style={{ width: 26, height: 26, borderRadius: "50%", background: colors.border, flexShrink: 0 }}
          />
        )}
        <span
          style={{
            fontSize: 14,
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
        <NotificationPanel count={unreadNotifications} onRead={refreshNotifications} />
        <MessagesPanel count={unreadBookingIds.length} />
      </div>
    </div>
  );
}

const SKIPPER_ITEMS = [
  { href: "/platform", label: "Αρχική" },
  { href: "/platform/skipper", label: "Ο πίνακάς μου", group: true },
  { href: "/platform/skipper/bookings", label: "Οι κρατήσεις μου" },
  { href: "/platform/skipper/availability", label: "Η διαθεσιμότητά μου" },
  { href: "/platform/skipper/profile", label: "Το προφίλ μου" },
  { href: "/platform/skipper/wallet", label: "Το πορτοφόλι μου" },
  { href: "/platform/client", label: "Ο λογαριασμός μου ως πελάτης", group: true },
  { href: "/platform/client/bookings", label: "Οι κρατήσεις μου ως πελάτης" },
  { href: "/platform/client/profile", label: "Η φωτογραφία μου ως πελάτης" },
];

const CLIENT_ITEMS = [
  { href: "/platform", label: "Αρχική" },
  { href: "/platform/client", label: "Ο λογαριασμός μου", group: true },
  { href: "/platform/client/bookings", label: "Οι κρατήσεις μου" },
  { href: "/platform/client/profile", label: "Το προφίλ μου" },
];

// The account that owns the platform wears three hats at once: it runs the
// whole console, it hires crew like any client (0026), and — since the
// owner is themselves sometimes the one taking a charter — it can also hold
// a professional profile and get offered jobs. Before this, admin fell
// through to the plain marketing header below, which had none of that; the
// bookings existed but nothing in the UI could ever reach them.
// Same href, same label, in every menu that carries it — SKIPPER_ITEMS and
// ADMIN_ITEMS used to word these three differently ("ως πελάτης" here,
// nothing there; "ως επαγγελματίας" here, "(επαγγελματίας)" there), so an
// account with more than one hat saw a different name for the exact same
// page depending on which menu happened to list it.
const ADMIN_ITEMS = [
  { href: "/platform", label: "Αρχική" },
  { href: "/platform/admin", label: "Πίνακας διαχείρισης", group: true },
  { href: "/platform/client", label: "Ο λογαριασμός μου ως πελάτης", group: true },
  { href: "/platform/client/bookings", label: "Οι κρατήσεις μου ως πελάτης" },
  { href: "/platform/client/profile", label: "Η φωτογραφία μου ως πελάτης" },
  { href: "/platform/skipper", label: "Ο πίνακάς μου ως επαγγελματίας", group: true },
  { href: "/platform/skipper/bookings", label: "Οι κρατήσεις μου ως επαγγελματίας" },
  { href: "/platform/skipper/availability", label: "Η διαθεσιμότητά μου ως επαγγελματίας" },
  { href: "/platform/skipper/profile", label: "Το προφίλ μου ως επαγγελματίας" },
  { href: "/platform/skipper/wallet", label: "Το πορτοφόλι μου ως επαγγελματίας" },
];

function NavBar() {
  const { session, userRow, profile, loading, signOut, role, isAdmin, notifications, refreshNotifications } = useAuth();

  // Checked before the per-role branches below: an account can carry
  // is_staff_admin on top of its normal role (a skipper who is also an
  // admin, one phone/PIN for both) and still needs a way back into
  // /platform/admin from wherever it wandered off to. Falling through to
  // the plain SKIPPER_ITEMS menu for such an account left no link back to
  // the console at all once you left it.
  if (session && isAdmin) {
    return (
      <AccountNavBar
        name={profile?.full_name || userRow?.full_name || "Διαχειριστής"}
        photoUrl={profile?.photo_url || userRow?.photo_url}
        loading={loading}
        items={ADMIN_ITEMS}
        onSignOut={signOut}
        notifications={notifications}
        refreshNotifications={refreshNotifications}
      />
    );
  }

  if (session && role === "skipper") {
    return (
      <AccountNavBar
        name={profile?.full_name}
        photoUrl={profile?.photo_url || userRow?.photo_url}
        loading={loading}
        items={SKIPPER_ITEMS}
        onSignOut={signOut}
        notifications={notifications}
        refreshNotifications={refreshNotifications}
      />
    );
  }

  if (session && role === "client") {
    return (
      <AccountNavBar
        name={userRow?.full_name}
        photoUrl={userRow?.photo_url}
        loading={loading}
        items={CLIENT_ITEMS}
        onSignOut={signOut}
        notifications={notifications}
        refreshNotifications={refreshNotifications}
      />
    );
  }

  // Signed out: the plain marketing header.
  return (
    <div style={{ ...nav, flexWrap: "wrap", rowGap: 8, columnGap: 12 }}>
      <Link href="/platform" style={{ textDecoration: "none" }} aria-label="SkipperFinder — αρχική">
        <Logo />
      </Link>
      {/* Header carries Login only — no search link (the home page is the
          search entry point) and deliberately no sign-up: registration is a
          step inside the flow, at the SMS OTP moment, not a separate door. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", rowGap: 8 }}>
        <Link href="/platform/login" style={{ ...navLink, color: colors.ink }}>
          Login
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
