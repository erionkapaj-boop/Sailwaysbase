"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import Stars from "../components/Stars";
import { listMyWalletTransactions, getMyClientProfile, getCreditOffer, WALLET_EVENT } from "../../../lib/platform/db";
import { formatCredits, PACKAGES } from "../../../lib/platform/credits";
import { formatDate } from "../../../lib/platform/notifications";
import Link from "next/link";
import { container, card, h1, sectionLabel, muted, badge, colors, money } from "../../../lib/platform/theme";
import SignedOutNotice from "../components/SignedOutNotice";
import LoadError from "../components/LoadError";

const TYPE_LABEL = {
  purchase: "Αγορά credits",
  deposit: "Πίστωση credits",
  request_fee: "Credits για αίτημα",
  claim_fee: "Credits για ανάληψη",
  refund_credit: "Επιστροφή credits",
  adjustment: "Διόρθωση credits",
};

// Ένα υπόλοιπο, ένα ενιαίο ιστορικό κινήσεων — αλλά η αξιοπιστία/βαθμολογία
// παραμένουν χωριστές ανά καπέλο, γιατί περιγράφουν διαφορετικά πράγματα (πόσο
// αξιόπιστος είσαι ως επαγγελματίας δεν είναι το ίδιο ερώτημα με το πόσο
// αξιόπιστος είσαι ως πελάτης).
export default function WalletPage() {
  const { session, profile, userRow, isAdmin, loading, refresh } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [clientProfile, setClientProfile] = useState(null);
  const [offer, setOffer] = useState(null);
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
    getCreditOffer().then(setOffer).catch(() => {});
  }, [session, isProfessional]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <SignedOutNotice />;

  return (
    <div style={container}>
      <h1 style={h1}>Credits</h1>

      <div style={card}>
        <div style={muted}>Διαθέσιμα</div>
        <div style={{ ...money, fontSize: 32, fontWeight: 600, marginTop: 6 }}>{formatCredits(userRow?.wallet_balance ?? 0)}</div>
        <p style={{ ...muted, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.5 }}>
          Ένα credit αντιστοιχεί σε ένα ματς. Τα credits δεν λήγουν.
        </p>
      </div>

      {offer && (
        <div style={{ marginTop: 24 }}>
          <h2 style={sectionLabel}>Πακέτα</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {offer.creditPrice != null && (
              <div style={{ ...card, margin: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>1 credit</div>
                <div style={{ ...money, fontSize: 22, fontWeight: 700, marginTop: 6 }}>{offer.creditPrice}€</div>
              </div>
            )}
            {offer.packages.map((p) => (
              <div key={p.key} style={{ ...card, margin: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{PACKAGES.find((x) => x.key === p.key)?.name}</div>
                <div style={{ ...muted, fontSize: 13, marginTop: 2 }}>{formatCredits(p.credits)}</div>
                <div style={{ ...money, fontSize: 22, fontWeight: 700, marginTop: 6 }}>{p.price}€</div>
              </div>
            ))}
          </div>
          <p style={{ ...muted, fontSize: 13, margin: "12px 0 0" }}>
            Για αγορά,{" "}
            <Link href="/platform/contact" style={{ color: colors.ink, textDecoration: "underline" }}>
              επικοινώνησε μαζί μας
            </Link>
            .
          </p>
        </div>
      )}

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
            <span style={badge(t.amount > 0 ? "success" : "neutral")}>{t.amount > 0 ? "+" : ""}{formatCredits(t.amount)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
