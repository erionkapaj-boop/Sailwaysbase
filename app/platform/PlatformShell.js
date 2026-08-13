"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "./AuthContext";
import Footer from "./components/Footer";
import Logo from "./components/Logo";
import NotificationBell from "./components/NotificationBell";
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

function NavBar() {
  const { session, userRow, profile, signOut, role, notifications } = useAuth();
  const pathname = usePathname();
  // On the home screen the large centred lockup carries the brand, so the
  // header mark would just be a duplicate — leave the slot empty and let
  // Login sit alone on the right.
  const isHome = pathname === "/platform";

  return (
    <div style={{ ...nav, flexWrap: "wrap", rowGap: 8, columnGap: 12 }}>
      {isHome ? (
        <span />
      ) : (
        <Link href="/platform" style={{ textDecoration: "none" }} aria-label="SkipperFinder — αρχική">
          <Logo />
        </Link>
      )}
      {/* Header carries Login only — no search link (the home page is the
          search entry point) and deliberately no sign-up: registration is a
          step inside the flow, at the SMS OTP moment, not a separate door. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", rowGap: 8 }}>
        {session && role === "client" && (
          <Link href="/platform/client" style={navLink}>
            Ο λογαριασμός μου
          </Link>
        )}
        {session && role === "admin" && (
          <Link href="/platform/admin" style={navLink}>
            Admin
          </Link>
        )}
        {session && role === "skipper" ? (
          <>
            {/* Two distinct clusters, not one continuous row: identity (who
                you are, tap to go home) on one side of a hairline divider,
                actions (notifications, navigation) on the other. */}
            {profile?.full_name && (
              <Link
                href="/platform"
                style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
              >
                {profile.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.photo_url}
                    alt=""
                    style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                  />
                )}
                <span style={{ fontSize: 14, color: colors.ink, whiteSpace: "nowrap" }}>{profile.full_name}</span>
              </Link>
            )}
            {profile?.full_name && (
              <span aria-hidden="true" style={{ width: 1, height: 20, background: colors.border, flexShrink: 0 }} />
            )}
            <NotificationBell notifications={notifications} />
            <SkipperMenu onSignOut={signOut} />
          </>
        ) : session ? (
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
