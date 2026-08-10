"use client";
import Link from "next/link";
import { AuthProvider, useAuth } from "./AuthContext";
import { nav, colors, button, badge } from "../../lib/platform/theme";

const navLink = {
  fontSize: 14,
  color: colors.ink,
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
        style={{ fontWeight: 800, fontSize: 17, color: colors.brandDark, textDecoration: "none", whiteSpace: "nowrap" }}
      >
        ⚓ SkipperConnect
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
            <span style={{ ...badge("brand"), whiteSpace: "nowrap" }}>{userRow?.phone_number || "..."}</span>
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

export default function PlatformShell({ children }) {
  return (
    <AuthProvider>
      <NavBar />
      {children}
    </AuthProvider>
  );
}
