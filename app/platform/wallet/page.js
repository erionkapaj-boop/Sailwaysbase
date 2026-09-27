"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import Stars from "../components/Stars";
import { listMyWalletTransactions, getMyClientProfile, WALLET_EVENT } from "../../../lib/platform/db";
import { formatDate } from "../../../lib/platform/notifications";
import Link from "next/link";
import { container, card, h1, sectionLabel, muted, badge, colors, money } from "../../../lib/platform/theme";
import SignedOutNotice from "../components/SignedOutNotice";
import LoadError from "../components/LoadError";

const TYPE_LABEL = {
  deposit: "Κατάθεση",
  request_fee: "Τέλος αιτήματος",
  claim_fee: "Χρέωση αποδοχής δουλειάς",
  refund_credit: "Επιστροφή",
  adjustment: "Διόρθωση υπολοίπου",
};

// Ένα υπόλοιπο, ένα ενιαίο ιστορικό κινήσεων — αλλά η αξιοπιστία/βαθμολογία
// παραμένουν χωριστές ανά καπέλο, γιατί περιγράφουν διαφορετικά πράγματα (πόσο
// αξιόπιστος είσαι ως επαγγελματίας δεν είναι το ίδιο ερώτημα με το πόσο
// αξιόπιστος είσαι ως πελάτης).
export default function WalletPage() {
  const { session, profile, userRow, isAdmin, loading, refresh } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [clientProfile, setClientProfile] = useState(null);
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const isProfessional = userRow?.role === "skipper" || isAdmin;

  // Υπόλοιπο και κινήσεις διαβάζονται φρέσκα κάθε φορά που ανοίγει η σελίδα
  // και μετά από κάθε κίνηση χρημάτων — ποτέ το ποσό που είχε φορτωθεί στη
  // σύνδεση, που μπορεί να είναι ώρες παλιό.
  // Μία φορά στο άνοιγμα (όχι σε κάθε αλλαγή του session: το refresh το
  // ξαναδημιουργεί και θα έμπαινε σε ατέρμονο κύκλο).
  function loadTransactions() {
    setBusy(true);
    listMyWalletTransactions()
      .then((rows) => { setTransactions(rows); setLoadFailed(false); })
      .catch((err) => { console.error(err); setLoadFailed(true); })
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    refresh();
    const reload = () => loadTransactions();
    window.addEventListener(WALLET_EVENT, reload);
    return () => window.removeEventListener(WALLET_EVENT, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) return;
    loadTransactions();
    getMyClientProfile().then(setClientProfile).catch(() => {});
  }, [session, isProfessional]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <SignedOutNotice />;

  return (
    <div style={container}>
      <h1 style={h1}>Το πορτοφόλι μου</h1>

      <div style={card}>
        <div style={muted}>Διαθέσιμο υπόλοιπο</div>
        <div style={{ ...money, fontSize: 32, fontWeight: 600, marginTop: 6 }}>{userRow?.wallet_balance ?? 0}€</div>
        <p style={{ ...muted, fontSize: 13, margin: "10px 0 0" }}>
          Για φόρτωση με κατάθεση ή κάρτα,{" "}
          <Link href="/platform/contact" style={{ color: colors.ink, textDecoration: "underline" }}>
            επικοινώνησε μαζί μας
          </Link>
          .
        </p>
        <p style={{ ...muted, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.5 }}>
          Το υπόλοιπο δεν λήγει και χρησιμοποιείται μόνο μέσα στην εφαρμογή. Δεν εξαργυρώνεται σε
          τραπεζικό λογαριασμό.
        </p>
      </div>

      {isProfessional && profile && (
        <div style={{ marginTop: 24 }}>
          <h2 style={sectionLabel}>Ως επαγγελματίας</h2>
          <div style={{ padding: "6px 2px" }}>
            <Stars rating={profile.rating_avg} count={profile.rating_count} size={17} />
          </div>
        </div>
      )}

      {clientProfile && (
        <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
          <h2 style={sectionLabel}>Ως πελάτης</h2>
          <Stars rating={clientProfile.rating_avg} count={clientProfile.rating_count ?? 0} size={17} />
        </div>
      )}

      <h2 style={{ ...sectionLabel, marginTop: 32 }}>Κινήσεις</h2>
      {busy && <p style={muted}>Φόρτωση...</p>}
      {!busy && loadFailed && <LoadError what="οι κινήσεις σου" onRetry={loadTransactions} />}
      {!busy && !loadFailed && transactions.length === 0 && <p style={muted}>Καμία κίνηση ακόμα.</p>}
      {transactions.map((t) => (
        <div key={t.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span>
              <span style={{ fontSize: 14 }}>{TYPE_LABEL[t.type] || t.type}</span>
              {t.note && <span style={{ ...muted, fontSize: 12, display: "block", marginTop: 2 }}>{t.note}</span>}
              <span style={{ ...muted, fontSize: 12, display: "block", marginTop: 2 }}>{formatDate(t.created_at?.slice(0, 10))}</span>
            </span>
            <span style={badge(t.amount > 0 ? "success" : "neutral")}>{t.amount > 0 ? "+" : ""}{t.amount}€</span>
          </div>
        </div>
      ))}
    </div>
  );
}
