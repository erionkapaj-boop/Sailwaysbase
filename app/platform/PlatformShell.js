"use client";
import Link from "next/link";
import { AuthProvider, useAuth } from "./AuthContext";
import { nav, colors, button, badge, money } from "../../lib/platform/theme";

const navLink = {
  fontSize: 14,
  fontWeight: 500,
  color: colors.inkSoft,
  textDecoration: "none",
  padding: "6px 4px",
  whiteSpace: "nowrap",
};

function NavBar() {
  const { session, userRow, signOut, role } = useAuth();
  return (
    <div style={{ ...nav, flexWrap: "wrap", rowGap: 8, columnGap: 12 }}>
      <Link
        href="/platform"
        style={{
          fontWeight: 600,
          fontSize: 16,
          letterSpacing: "-0.01em",
          color: colors.ink,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        SkipperConnect
      </Link>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", rowGap: 8 }}>
        <Link href="/platform/search" style={navLink}>
          Αναζήτηση
        </Link>
        {session && role === "client" && (
          <Link href="/platform/client" style={navLink}>
            Ο λογαριασμός μου
          </Link>
        )}
        {session && role === "skipper" && (
          <Link href="/platform/skipper" style={navLink}>
            Πίνακας Skipper
          </Link>
        )}
        {session && role === "admin" && (
          <Link href="/platform/admin" style={navLink}>
            Admin
          </Link>
        )}
        {session ? (
          <>
            <span style={{ ...badge("neutral"), whiteSpace: "nowrap" }}>{userRow?.phone_number || "..."}</span>
            <button style={button("secondary")} onClick={signOut}>
              Έξοδος
            </button>
          </>
        ) : (
          <Link href="/platform/login">
            <button style={button("primary")}>Είσοδος</button>
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
`;

export default function PlatformShell({ children }) {
  return (
    <AuthProvider>
      <style>{globalStyles}</style>
      <div className="platform-scope">
        <NavBar />
        {children}
      </div>
    </AuthProvider>
  );
}
