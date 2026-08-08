"use client";
import Link from "next/link";
import { AuthProvider, useAuth } from "./AuthContext";
import { nav, colors, button, badge } from "../../lib/platform/theme";

function NavBar() {
  const { session, userRow, signOut, role } = useAuth();
  return (
    <div style={nav}>
      <Link href="/platform" style={{ fontWeight: 800, fontSize: 18, color: colors.brandDark, textDecoration: "none" }}>
        ⚓ SkipperConnect
      </Link>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Link href="/platform/search" style={{ fontSize: 14, color: colors.ink, textDecoration: "none" }}>
          Αναζήτηση
        </Link>
        {session && role === "client" && (
          <Link href="/platform/client" style={{ fontSize: 14, color: colors.ink, textDecoration: "none" }}>
            Ο λογαριασμός μου
          </Link>
        )}
        {session && role === "skipper" && (
          <Link href="/platform/skipper" style={{ fontSize: 14, color: colors.ink, textDecoration: "none" }}>
            Πίνακας Skipper
          </Link>
        )}
        {session && role === "admin" && (
          <Link href="/platform/admin" style={{ fontSize: 14, color: colors.ink, textDecoration: "none" }}>
            Admin
          </Link>
        )}
        {session ? (
          <>
            <span style={badge("brand")}>{userRow?.phone_number || "..."}</span>
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
