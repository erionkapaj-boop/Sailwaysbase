"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LegalPage, { Section, P, UL, LI, Note } from "../components/LegalPage";
import { colors } from "../../../lib/platform/theme";
import { company } from "../../../lib/platform/company";

const link = { color: colors.accent };

// Σελίδα για πελάτη, όχι για ανταγωνιστή. Λέει τι κερδίζει κανείς και τι
// δεσμευόμαστε να κάνουμε — όχι με ποιες ακριβώς παραμέτρους. Τα χρονικά
// παράθυρα, τα ποσά και ο τρόπος κατάταξης εμφανίζονται μέσα στην εφαρμογή,
// τη στιγμή που αφορούν τον χρήστη· δημοσιευμένα εδώ θα ήταν απλώς έτοιμη
// προδιαγραφή για όποιον θέλει να την αντιγράψει.
export default function AboutBody() {
  const t = useTranslations("About");
  const rich = {
    b: (c) => <strong>{c}</strong>,
    terms: (c) => (
      <Link href="/platform/terms#fees" style={link}>
        {c}
      </Link>
    ),
    termsPage: (c) => (
      <Link href="/platform/terms" style={link}>
        {c}
      </Link>
    ),
    privacy: (c) => (
      <Link href="/platform/privacy" style={link}>
        {c}
      </Link>
    ),
    contact: (c) => (
      <Link href="/platform/contact" style={link}>
        {c}
      </Link>
    ),
  };
  return (
    <LegalPage title={t("title")} showUpdated={false} intro={t("intro", { brand: company.brandName })}>
      <Section id="how-client" title={t("clientTitle")}>
        <UL>
          <LI>{t.rich("client1", rich)}</LI>
          <LI>{t.rich("client2", rich)}</LI>
          <LI>{t.rich("client3", rich)}</LI>
          <LI>{t.rich("client4", rich)}</LI>
        </UL>
        <Note>{t.rich("clientNote", rich)}</Note>
      </Section>

      <Section id="how-pro" title={t("proTitle")}>
        <UL>
          <LI>{t.rich("pro1", rich)}</LI>
          <LI>{t.rich("pro2", rich)}</LI>
          <LI>{t.rich("pro3", rich)}</LI>
          <LI>{t.rich("pro4", rich)}</LI>
        </UL>
      </Section>

      <Section id="fees" title={t("feesTitle")}>
        <P>{t.rich("fees1", rich)}</P>
        <P>{t.rich("fees2", rich)}</P>
      </Section>

      <Section id="trust" title={t("trustTitle")}>
        <UL>
          <LI>{t.rich("trust1", rich)}</LI>
          <LI>{t.rich("trust2", rich)}</LI>
          <LI>{t.rich("trust3", rich)}</LI>
        </UL>
      </Section>

      <Section id="help" title={t("helpTitle")}>
        <P>{t.rich("help1", rich)}</P>
        <P>{t.rich("help2", rich)}</P>
      </Section>
    </LegalPage>
  );
}
