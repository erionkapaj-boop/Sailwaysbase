"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "./AuthContext";
import Footer from "./components/Footer";
import Logo from "./components/Logo";
import IconBadgeButton from "./components/IconBadgeButton";
import SkipperMenu from "./components/SkipperMenu";
import { nav, colors, button, badge, fontSans } from "../../lib/platform/theme";

const navLink = {
  fontSize: 14,
  fontWeight: 400,
  fontFamily: fontSans,
  color: colors.inkSoft,
  textDecoration: "none",
  padding: "6px 4px",
  whiteSpace: "nowrap",
};

const BellIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 14.5 18 8Z" />
    <path d="M13.6 20.5a1.8 1.8 0 0 1-3.2 0" />
  </svg>
);

const EnvelopeIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
  </svg>
);

// The professional's header is a different shape from everyone else's: a
// three-zone app bar (menu / identity / actions) rather than logo-left,
// links-right. Split out rather than threading a third layout into NavBar's
// existing branching.
function SkipperNavBar({ profile, loading, signOut, notifications }) {
  const router = useRouter();
  const pendingRequests = notifications?.pendingRequests ?? 0;
  const unreadBookingIds = notifications?.unreadBookingIds ?? [];

  function openRequests() {
    router.push("/platform/skipper");
  }
  function openMessages() {
    if (unreadBookingIds.length === 1) router.push(`/platform/skipper?focus=${unreadBookingIds[0]}`);
    else router.push("/platform/skipper");
  }

  return (
    <div style={{ ...nav, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", columnGap: 10 }}>
      <SkipperMenu onSignOut={signOut} />

      <Link
        href="/platform"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", minWidth: 0 }}
      >
        {profile?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photo_url}
            alt=""
            style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
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
          {profile?.full_name || ""}
        </span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
        <IconBadgeButton icon={BellIcon} count={pendingRequests} onClick={openRequests} ariaLabel="Αιτήματα κράτησης" />
        <IconBadgeButton icon={EnvelopeIcon} count={unreadBookingIds.length} onClick={openMessages} ariaLabel="Μηνύματα" />
      </div>
    </div>
  );
}

function NavBar() {
  const router = useRouter();
  const { session, userRow, profile, loading, signOut, role, notifications } = useAuth();

  if (session && role === "skipper") {
    return <SkipperNavBar profile={profile} loading={loading} signOut={signOut} notifications={notifications} />;
  }

  // Clients get the same unread-message signal professionals do — a reply
  // they never find out about is the same dead end in either direction.
  const clientUnread = role === "client" ? notifications?.unreadBookingIds ?? [] : [];

  return (
    <div style={{ ...nav, flexWrap: "wrap", rowGap: 8, columnGap: 12 }}>
      <Link href="/platform" style={{ textDecoration: "none" }} aria-label="SkipperFinder — αρχική">
        <Logo />
      </Link>
      {/* Header carries Login only — no search link (the home page is the
          search entry point) and deliberately no sign-up: registration is a
          step inside the flow, at the SMS OTP moment, not a separate door. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", rowGap: 8 }}>
        {session && role === "client" && (
          <>
            <Link href="/platform/client" style={navLink}>
              Ο λογαριασμός μου
            </Link>
            <IconBadgeButton
              icon={EnvelopeIcon}
              count={clientUnread.length}
              ariaLabel="Μηνύματα"
              onClick={() =>
                router.push(
                  clientUnread.length === 1 ? `/platform/client?focus=${clientUnread[0]}` : "/platform/client"
                )
              }
            />
          </>
        )}
        {session && role === "admin" && (
          <Link href="/platform/admin" style={navLink}>
            Admin
          </Link>
        )}
        {session ? (
          <>
            <span style={{ ...badge("neutral"), whiteSpace: "nowrap" }}>{userRow?.phone_number || "..."}</span>
            <button style={{ ...navLink, background: "none", border: "none", cursor: "pointer" }} onClick={signOut}>
              Logout
            </button>
          </>
        ) : (
          <Link href="/platform/login" style={{ ...navLink, color: colors.ink }}>
            Login
          </Link>
        )}
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
.platform-scope .sf-cta:hover { background: ${colors.ink}; color: #fff; }
.platform-scope .sf-cta:active { background: ${colors.brandDark}; color: #fff; }
`;

export default function PlatformShell({ children }) {
  return (
    <AuthProvider>
      <style>{globalStyles}</style>
      <div className="platform-scope" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <NavBar />
        <div style={{ flex: 1 }}>{children}</div>
        <Footer />
      </div>
    </AuthProvider>
  );
}
