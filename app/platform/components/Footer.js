"use client";
import Link from "next/link";
import { colors, muted, money } from "../../../lib/platform/theme";
import { company, field } from "../../../lib/platform/company";

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

        {/* Ο νόμος (ΠΔ 131/2003) θέλει τα στοιχεία του παρόχου ορατά και
            ακριβή. Όσο κάποιο λείπει, δεν τυπώνεται τίποτα στη θέση του —
            ένα εφευρημένο ΑΦΜ θα ήταν χειρότερο από ένα κενό. */}
        <p style={{ ...muted, fontSize: 12, margin: "0 0 4px" }}>
          {[
            field(company.legalName),
            [field(company.address), company.city, company.country].filter(Boolean).join(", "),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {(field(company.vat) || field(company.gemi)) && (
          <p style={{ ...muted, fontSize: 12, margin: "0 0 4px" }}>
            {field(company.vat) && (
              <>
                ΑΦΜ <span style={money}>{field(company.vat)}</span>
              </>
            )}
            {field(company.vat) && field(company.gemi) ? " · " : ""}
            {field(company.gemi) && (
              <>
                ΓΕΜΗ <span style={money}>{field(company.gemi)}</span>
              </>
            )}
          </p>
        )}
        <p style={{ ...muted, fontSize: 12, margin: 0 }}>
          © <span style={money}>{new Date().getFullYear()}</span> {company.brandName}
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
        <span style={{ ...muted, fontSize: 12 }}>{company.brandName}</span>
        {/* Όροι και απόρρητο πρέπει να παραμένουν προσβάσιμα και μέσα από την
            εφαρμογή, όχι μόνο από τις δημόσιες σελίδες — είναι απαίτηση, όχι
            διακοσμητικά link. Μπαίνουν διακριτικά, δίπλα στη βοήθεια. */}
        <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link href="/platform/about" style={footerLink}>
            Σχετικά &amp; βοήθεια
          </Link>
          <Link href="/platform/contact" style={footerLink}>
            Επικοινωνία
          </Link>
          <Link href="/platform/terms" style={footerLink}>
            Όροι
          </Link>
          <Link href="/platform/privacy" style={footerLink}>
            Απόρρητο
          </Link>
        </span>
      </div>
    </footer>
  );
}
