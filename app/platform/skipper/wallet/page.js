"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import MissingProfile from "../MissingProfile";
import BackButton from "../../components/BackButton";
import Stars from "../../components/Stars";
import { listMyWalletTransactions, getMyStanding } from "../../../../lib/platform/db";
import { formatDate } from "../../../../lib/platform/notifications";
import { container, card, h1, sectionLabel, muted, badge, colors, money } from "../../../../lib/platform/theme";

const TYPE_LABEL = {
  deposit: "Κατάθεση", request_fee: "Τέλος αιτήματος", claim_fee: "Τέλος διεκδίκησης", refund_credit: "Επιστροφή πίστωσης",
};

// Κρατάει το ίδιο κατώφλι με το reliability_min_history στη βάση (0027).
const MIN_RELIABILITY_HISTORY = 3;

export default function SkipperWalletPage() {
  const { session, profile, userRow, loading, refresh, loadError, isAdmin } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [standing, setStanding] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    listMyWalletTransactions().then(setTransactions).finally(() => setBusy(false));
    getMyStanding().then(setStanding).catch(() => {});
  }, [profile?.id]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "skipper" && !isAdmin)
    return <div style={container}>Αυτή η σελίδα είναι μόνο για επαγγελματίες.</div>;
  if (!profile) return <MissingProfile userRow={userRow} isAdmin={isAdmin} refresh={refresh} loadError={loadError} />;

  // Πόσα περιστατικά υπάρχουν συνολικά να μιλήσουν για κάποιον.
  const history = (profile.completed_bookings_count || 0) + (profile.cancellation_flag_count || 0);

  return (
    <div style={container}>
      <BackButton href="/platform/skipper" />
      <h1 style={{ ...h1, marginTop: 14 }}>Το πορτοφόλι μου</h1>
      {userRow?.role !== "skipper" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>ως επαγγελματίας</p>}

      <div style={card}>
        <div style={muted}>Διαθέσιμο υπόλοιπο</div>
        <div style={{ ...money, fontSize: 32, fontWeight: 600, marginTop: 6 }}>{userRow?.wallet_balance ?? 0}€</div>
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
            {/* Κάτω από τρία περιστατικά δεν δείχνουμε ποσοστό — μία ακύρωση
                στην πρώτη δουλειά έβγαζε «0%», νούμερο που δεν περιγράφει
                κανέναν, μόνο το ότι δεν υπάρχει ακόμα ιστορικό να περιγραφεί. */}
            <div
              style={{ ...money, fontSize: 15, fontWeight: 500, marginTop: 2 }}
              title={
                history < MIN_RELIABILITY_HISTORY
                  ? "Χρειάζονται τουλάχιστον 3 ολοκληρωμένες ή ακυρωμένες κρατήσεις"
                  : undefined
              }
            >
              {history >= MIN_RELIABILITY_HISTORY && profile.reliability_percentage != null
                ? `${profile.reliability_percentage}%`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Standing: the star row belongs with reliability and tier, since all
          three answer the same question — how do I look to a client right
          now. */}
      <div style={{ marginTop: 24, paddingBottom: 10, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
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

      {/* Λέγεται μόνο όταν υπάρχει κάτι να ειπωθεί. */}
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
