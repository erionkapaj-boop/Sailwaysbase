"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { container, card, h1, muted, button } from "../../../lib/platform/theme";

// Replaces the old bare "Χρειάζεται σύνδεση." text (found on 6 different
// pages during a usability pass) — a real dead end for anyone who reached
// one of these pages signed out, most commonly right after "Αποσύνδεση".
// next carries them back here once they've actually signed in/registered.
export default function SignedOutNotice() {
  const pathname = usePathname();
  const next = `?next=${encodeURIComponent(pathname)}`;
  return (
    <div style={container}>
      <div style={{ ...card, marginTop: 20, textAlign: "center" }}>
        <h1 style={{ ...h1, fontSize: 20 }}>Χρειάζεται σύνδεση</h1>
        <p style={{ ...muted, margin: "10px 0 20px" }}>Συνδέσου ή γράψου για να συνεχίσεις.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href={`/platform/login${next}`} style={{ ...button("primary"), textDecoration: "none" }}>
            Σύνδεση
          </Link>
          <Link href="/platform/register" style={{ ...button("secondary"), textDecoration: "none" }}>
            Εγγραφή
          </Link>
        </div>
      </div>
    </div>
  );
}
