"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import Stars from "../components/Stars";
import { listMyWalletTransactions, getMyStanding, getMyClientProfile } from "../../../lib/platform/db";
import { formatDate } from "../../../lib/platform/notifications";
import { container, card, h1, sectionLabel, muted, badge, colors, money } from "../../../lib/platform/theme";

const TYPE_LABEL = {
  deposit: "Κατάθεση", request_fee: "Τέλος αιτήματος", claim_fee: "Τέλος διεκδίκησης", refund_credit: "Επιστροφή πίστωσης",
};

// Κρατάει το ίδιο κατώφλι με το reliability_min_history στη βάση (0027).
const MIN_RELIABILITY_HISTORY = 3;

function ReliabilityLine({ history, percentage }) {
  return (
    <b
      style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}
      title={
        history < MIN_RELIABILITY_HISTORY ? "Χρειάζονται τουλάχιστον 3 ολοκληρωμένες ή ακυρωμένες κρατήσεις" : undefined
      }
    >
      {history >= MIN_RELIABILITY_HISTORY && percentage != null ? `${percentage}%` : "—"}
    </b>
  );
}

// Ένα υπόλοιπο, ένα ενιαίο ιστορικό κινήσεων — αλλά η αξιοπιστία/βαθμολογία
// παραμένουν χωριστές ανά καπέλο, γιατί περιγράφουν διαφορετικά πράγματα (πόσο
// αξιόπιστος είσαι ως επαγγελματίας δεν είναι το ίδιο ερώτημα με το πόσο
// αξιόπιστος είσαι ως πελάτης).
export default function WalletPage() {
  const { session, profile, userRow, isAdmin, loading } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [standing, setStanding] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [busy, setBusy] = useState(true);

  const isProfessional = userRow?.role === "skipper" || isAdmin;

  useEffect(() => {
    if (!session) return;
    listMyWalletTransactions().then(setTransactions).finally(() => setBusy(false));
    getMyClientProfile().then(setClientProfile).catch(() => {});
    if (isProfessional) getMyStanding().then(setStanding).catch(() => {});
  }, [session, isProfessional]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;

  const proHistory = (profile?.completed_bookings_count || 0) + (profile?.cancellation_flag_count || 0);
  const clientHistory = (clientProfile?.completed_bookings_count || 0) + (clientProfile?.cancellation_flag_count || 0);

  return (
    <div style={container}>
      <h1 style={h1}>Το πορτοφόλι μου</h1>

      <div style={card}>
        <div style={muted}>Διαθέσιμο υπόλοιπο</div>
        <div style={{ ...money, fontSize: 32, fontWeight: 600, marginTop: 6 }}>{userRow?.wallet_balance ?? 0}€</div>
        <p style={{ ...muted, fontSize: 13, margin: "10px 0 0" }}>
          Για φόρτωση (τραπεζική κατάθεση ή κάρτα) επικοινώνησε με τον admin — πιστώνεται στο υπόλοιπό σου.
        </p>
        <p style={{ ...muted, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.5 }}>
          Ό,τι φορτίζεις μένει εδώ σαν υπόλοιπο, χωρίς λήξη — δεν επιστρέφεται σε τραπεζικό λογαριασμό
          επειδή άλλαξες γνώμη ή δεν το χρησιμοποίησες. Φόρτισε μόνο όσο πραγματικά χρειάζεσαι· δοκίμασε
          πρώτα με ό,τι δωρεάν υπόλοιπο ήδη έχεις.
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
          <div style={{ display: "flex", alignItems: "baseline", padding: "10px 2px 0" }}>
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
              <span style={{ ...muted, fontSize: 12, display: "block", marginTop: 2 }}>{formatDate(t.created_at?.slice(0, 10))}</span>
            </span>
            <span style={badge(t.amount > 0 ? "success" : "neutral")}>{t.amount > 0 ? "+" : ""}{t.amount}€</span>
          </div>
        </div>
      ))}
    </div>
  );
}
