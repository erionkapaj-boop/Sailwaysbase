"use client";
import { useState } from "react";
import Link from "next/link";
import HowItWorksSheet from "./HowItWorksSheet";
import { useTranslations } from "next-intl";
import { colors, muted, money, tapTarget } from "../../../lib/platform/theme";
import { company } from "../../../lib/platform/company";

const footerLink = {
  ...tapTarget,
  fontSize: 13,
  color: colors.inkSoft,
  textDecoration: "none",
};

// Signed out (owner, 16/10/2026, after Google's footer): one thin full-width strip at the very bottom, no rule, a
// slightly darker tint. Left: how it works + contact. Right: terms, privacy, © and city. The legal details of the
// provider (name, VAT, registry) live on the Terms page, one tap away.
export default function Footer() {
  const t = useTranslations("Footer");
  const [howOpen, setHowOpen] = useState(false);
  const link = { ...footerLink, fontSize: 13.5, color: colors.inkSoft, background: "none", border: 0, padding: 0, fontFamily: "inherit", cursor: "pointer" };
  return (
    <footer data-site-footer style={{ background: colors.footerBand, padding: "0 24px" }}>
      <style
        dangerouslySetInnerHTML={{
          __html:
            ".sf-foot{display:flex;align-items:center;justify-content:space-between;gap:8px 24px;flex-wrap:wrap;min-height:56px;padding:4px 0}" +
            ".sf-foot-group{display:flex;align-items:center;gap:0 22px;flex-wrap:wrap}" +
            ".sf-foot a:hover,.sf-foot button:hover{color:" + colors.ink + "}" +
            "@media(max-width:640px){.sf-foot{justify-content:center;padding:6px 0;gap:0 18px}.sf-foot-group{display:contents}}",
        }}
      />
      <div className="sf-foot">
        <div className="sf-foot-group">
          <button type="button" data-how-link onClick={() => setHowOpen(true)} style={link}>
            {t("how")}
          </button>
          <Link href="/platform/contact" style={link}>
            {t("contact")}
          </Link>
        </div>
        <div className="sf-foot-group">
          <Link href="/platform/terms" style={link}>
            {t("termsShort")}
          </Link>
          <Link href="/platform/privacy" style={link}>
            {t("privacy")}
          </Link>
          <span style={{ ...footerLink, fontSize: 13.5, color: colors.inkSoft, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>
            ©&nbsp;<span style={money}>{new Date().getFullYear()}</span>&nbsp;{company.brandName}
            {` · ${t("city")}`}
          </span>
        </div>
      </div>
      <HowItWorksSheet open={howOpen} onClose={() => setHowOpen(false)} />
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
  const t = useTranslations("Footer");
  return (
    <footer
      style={{
        borderTop: `1px solid ${colors.border}`,
        marginTop: 40,
        padding: "4px 20px",
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
        {/*
         * Όροι και απόρρητο πρέπει να παραμένουν προσβάσιμα και μέσα από την
         * εφαρμογή, όχι μόνο από τις δημόσιες σελίδες — είναι απαίτηση, όχι
         * διακοσμητικά link. Μπαίνουν διακριτικά, δίπλα στη βοήθεια. */}
        <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link href="/platform/about" style={footerLink}>
            {t("aboutHelp")}
          </Link>
          <Link href="/platform/contact" style={footerLink}>
            {t("contact")}
          </Link>
          <Link href="/platform/terms" style={footerLink}>
            {t("termsShort")}
          </Link>
          <Link href="/platform/privacy" style={footerLink}>
            {t("privacy")}
          </Link>
        </span>
      </div>
    </footer>
  );
}
