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
