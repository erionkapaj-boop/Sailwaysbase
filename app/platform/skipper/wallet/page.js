"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../AuthContext";
import MissingProfile from "../MissingProfile";
import { listMyWalletTransactions } from "../../../../lib/platform/db";
import { container, card, h1, sectionLabel, muted, badge, colors, money } from "../../../../lib/platform/theme";

const TYPE_LABEL = {
  deposit: "Κατάθεση",
  request_fee: "Τέλος αιτήματος",
  claim_fee: "Τέλος διεκδίκησης",
  refund_credit: "Επιστροφή πίστωσης",
};

export default function SkipperWalletPage() {
  const { session, profile, userRow, loading, refresh, loadError } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    listMyWalletTransactions()
      .then(setTransactions)
      .finally(() => setBusy(false));
  }, [profile?.id]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "skipper") return <div style={container}>Αυτή η σελίδα είναι μόνο για skippers.</div>;
  if (!profile) return <MissingProfile userRow={userRow} refresh={refresh} loadError={loadError} />;

  return (
    <div style={container}>
      <Link href="/platform/skipper" style={{ ...muted, fontSize: 14, textDecoration: "none" }}>
        ← Πίσω στον πίνακα
      </Link>
      <h1 style={{ ...h1, marginTop: 14 }}>Το πορτοφόλι μου</h1>

      <div style={card}>
        <div style={muted}>Διαθέσιμο υπόλοιπο</div>
        <div style={{ ...money, fontSize: 32, fontWeight: 600, marginTop: 6 }}>{profile.wallet_balance}€</div>
        <p style={{ ...muted, fontSize: 13, margin: "10px 0 16px" }}>
          Για φόρτωση (τραπεζική κατάθεση ή κάρτα) επικοινώνησε με τον admin — πιστώνεται στο υπόλοιπό σου.
        </p>
        <div style={{ display: "flex", gap: 32, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
          <div>
            <div style={{ ...muted, fontSize: 12 }}>Βαθμίδα</div>
            <div style={{ ...money, fontSize: 15, fontWeight: 500, marginTop: 2 }}>
              {profile.tier === "high" ? "Υψηλή" : profile.tier === "low" ? "Χαμηλή" : "Μεσαία"}
            </div>
          </div>
          <div>
            <div style={{ ...muted, fontSize: 12 }}>Αξιοπιστία</div>
            <div style={{ ...money, fontSize: 15, fontWeight: 500, marginTop: 2 }}>
              {profile.reliability_percentage != null ? `${profile.reliability_percentage}%` : "—"}
            </div>
          </div>
        </div>
      </div>

      <h2 style={{ ...sectionLabel, marginTop: 32 }}>Κινήσεις</h2>
      {busy && <p style={muted}>Φόρτωση...</p>}
      {!busy && transactions.length === 0 && <p style={muted}>Καμία κίνηση ακόμα.</p>}
      {transactions.map((t) => (
        <div key={t.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span>
              <span style={{ fontSize: 14 }}>{TYPE_LABEL[t.type] || t.type}</span>
              <span style={{ ...muted, fontSize: 12, display: "block", marginTop: 2 }}>
                {t.created_at?.slice(0, 10)}
              </span>
            </span>
            <span style={badge(t.amount > 0 ? "success" : "neutral")}>
              {t.amount > 0 ? "+" : ""}
              {t.amount}€
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
