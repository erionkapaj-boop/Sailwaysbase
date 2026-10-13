"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "../../AuthContext";
import SignedOutNotice from "../../components/SignedOutNotice";
import PackagePicker, { PurchaseSummary } from "../../components/credits/PackagePicker";
import { container, card, h1, muted, button } from "../../../../lib/platform/theme";

// Αγορά credits: επιλογή πακέτου (ή αριθμού) και αίτημα. Μέχρι να συνδεθεί
// πληρωμή, τα credits πιστώνονται με την επιβεβαίωση του διαχειριστή.
export default function BuyCreditsPage() {
  const t = useTranslations("BuyCreditsPage");
  const { session, loading } = useAuth();
  const [sent, setSent] = useState(null);

  if (loading) return <div style={container}>{t("loading")}</div>;
  if (!session) return <SignedOutNotice />;

  const back = (
    <Link
      href="/platform/wallet"
      style={{ ...muted, fontSize: 14, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 40, paddingRight: 12 }}
    >
      ← Credits
    </Link>
  );

  return (
    <div style={{ ...container, maxWidth: 560 }}>
      {back}
      {sent ? (
        <>
          <h1 style={{ ...h1, marginTop: 12 }}>{t("registered")}</h1>
          <div style={card}>
            <PurchaseSummary row={sent} />
            <p style={{ ...muted, fontSize: 13.5, margin: "12px 0 0", lineHeight: 1.55 }}>
              {t("registeredNote")}
            </p>
          </div>
          <Link href="/platform/wallet" style={{ ...button("primary"), textDecoration: "none", display: "inline-block" }}>
            {t("toCredits")}
          </Link>
        </>
      ) : (
        <>
          <h1 style={{ ...h1, marginTop: 12 }}>{t("title")}</h1>
          <PackagePicker onSent={setSent} />
        </>
      )}
    </div>
  );
}
