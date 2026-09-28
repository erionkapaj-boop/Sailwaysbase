"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { listMyWalletTransactions, getMyPendingCreditPurchase, cancelCreditPurchaseRequest, WALLET_EVENT } from "../../../lib/platform/db";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { useConfirm } from "../components/ConfirmDialog";
import { formatCredits, PACKAGES } from "../../../lib/platform/credits";
import { formatDate } from "../../../lib/platform/notifications";
import Link from "next/link";
import { container, card, h1, sectionLabel, muted, badge, colors, money, button } from "../../../lib/platform/theme";
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

// Υπόλοιπο, αγορά, ιστορικό — τίποτα άλλο. Τα πακέτα και οι τιμές ζουν
// στην οθόνη αγοράς (/platform/wallet/buy), όπου διαλέγεις.
export default function WalletPage() {
  const { session, userRow, loading, refresh, readOnly } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  // Υπόλοιπο και κινήσεις διαβάζονται φρέσκα κάθε φορά που ανοίγει η σελίδα
  // και μετά από κάθε κίνηση — ποτέ το ποσό που είχε φορτωθεί στη σύνδεση.
  function loadTransactions() {
    setBusy(true);
    listMyWalletTransactions()
      .then((rows) => { setTransactions(rows); setLoadFailed(false); })
      .catch((err) => { console.error(err); setLoadFailed(true); })
      .finally(() => setBusy(false));
    getMyPendingCreditPurchase().then(setPending).catch(() => {});
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
  }, [session]);

  async function cancelPending() {
    if (!(await confirm(`Ακύρωση του αιτήματος ${pending.reference};`, { confirmLabel: "Ακύρωση αιτήματος" }))) return;
    setCancelling(true);
    setError("");
    try {
      await cancelCreditPurchaseRequest(pending.id);
      setPending(null);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <SignedOutNotice />;

  const packName = pending?.package_key ? PACKAGES.find((x) => x.key === pending.package_key)?.name : null;

  return (
    <div style={container}>
      <h1 style={h1}>Credits</h1>

      <div style={{ ...card, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={muted}>Διαθέσιμα</div>
          <div style={{ ...money, fontSize: 32, fontWeight: 600, marginTop: 6 }}>{formatCredits(userRow?.wallet_balance ?? 0)}</div>
          <p style={{ ...muted, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.5 }}>
            Ένα credit αντιστοιχεί σε ένα ματς. Τα credits δεν λήγουν.
          </p>
        </div>
        {!pending && !readOnly && (
          <Link href="/platform/wallet/buy" style={{ ...button("primary"), textDecoration: "none" }}>
            Αγορά credits
          </Link>
        )}
      </div>

      {pending && (
        <div style={{ ...card, borderLeft: `3px solid ${colors.accent}` }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Αίτημα αγοράς σε εκκρεμότητα</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            {[packName, formatCredits(pending.credits), `${pending.price_eur}€`].filter(Boolean).join(" · ")}
          </div>
          <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>
            Κωδικός <span style={{ ...money, color: colors.ink }}>{pending.reference}</span> ·{" "}
            {formatDate(pending.created_at?.slice(0, 10))}
          </div>
          <p style={{ ...muted, fontSize: 13, margin: "10px 0 0", lineHeight: 1.5 }}>
            Τα credits πιστώνονται με την επιβεβαίωση της πληρωμής.
          </p>
          {!readOnly && (
            <button type="button" style={{ ...button("secondary"), marginTop: 12 }} disabled={cancelling} onClick={cancelPending}>
              {cancelling ? "…" : "Ακύρωση αιτήματος"}
            </button>
          )}
          {error && <p style={{ color: colors.danger, fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
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
      {confirmDialog}
    </div>
  );
}
