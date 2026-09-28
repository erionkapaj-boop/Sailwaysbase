"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "../../AuthContext";
import SignedOutNotice from "../../components/SignedOutNotice";
import PackagePicker, { PurchaseSummary } from "../../components/credits/PackagePicker";
import { container, card, h1, muted, button } from "../../../../lib/platform/theme";

// Αγορά credits: επιλογή πακέτου (ή αριθμού) και αίτημα. Μέχρι να συνδεθεί
// πληρωμή, τα credits πιστώνονται με την επιβεβαίωση του διαχειριστή.
export default function BuyCreditsPage() {
  const { session, loading } = useAuth();
  const [sent, setSent] = useState(null);

  if (loading) return <div style={container}>Φόρτωση...</div>;
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
          <h1 style={{ ...h1, marginTop: 12 }}>Το αίτημά σου καταχωρήθηκε</h1>
          <div style={card}>
            <PurchaseSummary row={sent} />
            <p style={{ ...muted, fontSize: 13.5, margin: "12px 0 0", lineHeight: 1.55 }}>
              Τα credits πιστώνονται στον λογαριασμό σου με την επιβεβαίωση της πληρωμής.
            </p>
          </div>
          <Link href="/platform/wallet" style={{ ...button("primary"), textDecoration: "none", display: "inline-block" }}>
            Στα Credits
          </Link>
        </>
      ) : (
        <>
          <h1 style={{ ...h1, marginTop: 12 }}>Αγορά credits</h1>
          <PackagePicker onSent={setSent} />
        </>
      )}
    </div>
  );
}
