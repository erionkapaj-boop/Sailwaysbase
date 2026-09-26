"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import Stars from "../components/Stars";
import { listMyWalletTransactions, getMyStanding, getMyClientProfile, WALLET_EVENT } from "../../../lib/platform/db";
import { formatDate } from "../../../lib/platform/notifications";
import Link from "next/link";
import { container, card, h1, sectionLabel, muted, badge, colors, money } from "../../../lib/platform/theme";
import SignedOutNotice from "../components/SignedOutNotice";

const TYPE_LABEL = {
  deposit: "Κατάθεση",
  request_fee: "Τέλος αιτήματος",
  claim_fee: "Χρέωση αποδοχής δουλειάς",
  refund_credit: "Επιστροφή",
  adjustment: "Διόρθωση υπολοίπου",
};

// Κρατάει το ίδιο κατώφλι με το reliability_min_history στη βάση (0027).
const MIN_RELIABILITY_HISTORY = 3;

// title= tooltips never show on a tap — mobile is this app's main surface,
// so the explanation for the dash needs to be text on the page, not
// something that only appears on hover.
function ReliabilityLine({ history, percentage }) {
  const known = history >= MIN_RELIABILITY_HISTORY && percentage != null;
  return (
    <>
      <b style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}>
        {known ? `${percentage}%` : "—"}
      </b>
      {!known && (
        <span style={{ ...muted, fontSize: 11, display: "block", marginTop: 2 }}>
          Υπολογίζεται μετά τις πρώτες {MIN_RELIABILITY_HISTORY} κρατήσεις
        </span>
      )}
    </>
  );
}

// Ένα υπόλοιπο, ένα ενιαίο ιστορικό κινήσεων — αλλά η αξιοπιστία/βαθμολογία
// παραμένουν χωριστές ανά καπέλο, γιατί περιγράφουν διαφορετικά πράγματα (πόσο
// αξιόπιστος είσαι ως επαγγελματίας δεν είναι το ίδιο ερώτημα με το πόσο
// αξιόπιστος είσαι ως πελάτης).
export default function WalletPage() {
  const { session, profile, userRow, isAdmin, loading, refresh } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [standing, setStanding] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [busy, setBusy] = useState(true);

  const isProfessional = userRow?.role === "skipper" || isAdmin;

  // Υπόλοιπο και κινήσεις διαβάζονται φρέσκα κάθε φορά που ανοίγει η σελίδα
  // και μετά από κάθε κίνηση χρημάτων — ποτέ το ποσό που είχε φορτωθεί στη
  // σύνδεση, που μπορεί να είναι ώρες παλιό.
  // Μία φορά στο άνοιγμα (όχι σε κάθε αλλαγή του session: το refresh το
  // ξαναδημιουργεί και θα έμπαινε σε ατέρμονο κύκλο).
  useEffect(() => {
    refresh();
    const reload = () => listMyWalletTransactions().then(setTransactions).catch(() => {});
    window.addEventListener(WALLET_EVENT, reload);
    return () => window.removeEventListener(WALLET_EVENT, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) return;
    listMyWalletTransactions().then(setTransactions).finally(() => setBusy(false));
    getMyClientProfile().then(setClientProfile).catch(() => {});
    if (isProfessional) getMyStanding().then(setStanding).catch(() => {});
  }, [session, isProfessional]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <SignedOutNotice />;

  const proHistory = (profile?.completed_bookings_count || 0) + (profile?.cancellation_flag_count || 0);
  const clientHistory = (clientProfile?.completed_bookings_count || 0) + (clientProfile?.cancellation_flag_count || 0);

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
          <div style={{ display: "flex", gap: 32, padding: "10px 2px" }}>
            <div>
              <div style={{ ...muted, fontSize: 12 }}>Βαθμίδα</div>
              <div style={{ ...money, fontSize: 15, fontWeight: 500, marginTop: 2 }}>
                {profile.tier === "high" ? "Υψηλή" : profile.tier === "low" ? "Χαμηλή" : "Μεσαία"}
              </div>
            </div>
            <div>
              <div style={{ ...muted, fontSize: 12 }}>Αξιοπιστία</div>
              <ReliabilityLine history={proHistory} percentage={profile.reliability_percentage} />
            </div>
          </div>

          <div style={{ paddingTop: 12, paddingBottom: 10, borderTop: `1px solid ${colors.border}` }}>
            <Stars rating={profile.rating_avg} count={profile.rating_count} size={17} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {profile.cancellation_flag_count === 0 && profile.completed_bookings_count > 0 && (
                <span style={badge("success")}>Καμία ακύρωση</span>
              )}
              {standing?.cancellations > 0 && standing.cancellationLoad / standing.cancellations <= 0.3 && (
                <span style={badge("success")}>Ειδοποιεί έγκαιρα</span>
              )}
              {standing && standing.responded + standing.ignored > 0 && (
                <span style={badge(standing.ignored === 0 ? "success" : "neutral")}>
                  Απαντά σε {standing.responded} από {standing.responded + standing.ignored} αιτήματα
                </span>
              )}
            </div>
          </div>

          {standing?.cancellations > 0 && standing.cancelStanding != null && (
            <p style={{ ...muted, fontSize: 12.5, margin: "10px 2px 0", lineHeight: 1.5 }}>
              {standing.cancellations === 1 ? "1 ακύρωση" : `${standing.cancellations} ακυρώσεις`} στο ιστορικό σου.
              {standing.cancelStanding >= 99
                ? " Επειδή ειδοποίησες έγκαιρα, σχεδόν δεν επηρεάζουν τη θέση σου στις αναζητήσεις."
                : standing.cancelStanding >= 90
                ? " Επηρεάζουν ελαφρά τη θέση σου στις αναζητήσεις."
                : " Επηρεάζουν αισθητά τη θέση σου στις αναζητήσεις."}
              {" Όσο πιο νωρίς ειδοποιείς, τόσο λιγότερο μετράει η κάθε μία."}
            </p>
          )}
        </div>
      )}

      {clientProfile && (
        <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
          <h2 style={sectionLabel}>Ως πελάτης</h2>
          <Stars rating={clientProfile.rating_avg} count={clientProfile.rating_count ?? 0} size={17} />
          <div style={{ padding: "10px 2px 0" }}>
            <span style={{ fontSize: 13, color: colors.inkSoft }}>Αξιοπιστία</span>
            <ReliabilityLine history={clientHistory} percentage={clientProfile.reliability_percentage} />
          </div>
        </div>
      )}

      <h2 style={{ ...sectionLabel, marginTop: 32 }}>Κινήσεις</h2>
      {busy && <p style={muted}>Φόρτωση...</p>}
      {!busy && transactions.length === 0 && <p style={muted}>Καμία κίνηση ακόμα.</p>}
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
