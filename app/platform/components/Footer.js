"use client";
import Link from "next/link";
import { colors, muted, money } from "../../../lib/platform/theme";

// Deliberately no email and no phone — contact goes through the form on the
// Επικοινωνία page. Company details are placeholders until the real ones land.
const COMPANY = {
  city: "Αθήνα",
  country: "Ελλάδα",
  vat: "EL000000000",
  gemi: "000000000000",
};

const footerLink = {
  fontSize: 13,
  color: colors.inkSoft,
  textDecoration: "none",
};

export default function Footer() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${colors.border}`,
        marginTop: 64,
        padding: "28px 20px 40px",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
          <Link href="/platform/about" style={footerLink}>
            Σχετικά
          </Link>
          <Link href="/platform/contact" style={footerLink}>
            Επικοινωνία
          </Link>
          <Link href="/platform/terms" style={footerLink}>
            Όροι χρήσης
          </Link>
          <Link href="/platform/privacy" style={footerLink}>
            Απόρρητο
          </Link>
        </div>

        <p style={{ ...muted, fontSize: 12, margin: "0 0 4px" }}>
          {COMPANY.city}, {COMPANY.country} · ΑΦΜ <span style={money}>{COMPANY.vat}</span> · ΓΕΜΗ{" "}
          <span style={money}>{COMPANY.gemi}</span>
        </p>
        <p style={{ ...muted, fontSize: 12, margin: 0 }}>
          © <span style={money}>{new Date().getFullYear()}</span>
        </p>
      </div>
    </footer>
  );
}

// The signed-in shell (client/skipper/admin dashboards) doesn't need the
// legal block on every screen — ΑΦΜ/ΓΕΜΗ and four marketing links have
// nothing to do with reading your bookings, and repeating them under every
// dashboard page was the one place the platform felt like two different
// products stitched together. Someone who actually needs Όροι/Απόρρητο can
// still get there from the public pages; this just points at "Σχετικά" as
// the one way back out.
export function AppFooter() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${colors.border}`,
        marginTop: 40,
        padding: "14px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ ...muted, fontSize: 12 }}>SkipperFinder</span>
        <Link href="/platform/about" style={footerLink}>
          Σχετικά &amp; βοήθεια
        </Link>
      </div>
    </footer>
  );
}
