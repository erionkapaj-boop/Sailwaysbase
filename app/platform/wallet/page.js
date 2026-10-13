"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
import { useAuth } from "../AuthContext";
import {
  listMyWalletTransactions,
  getMyPendingCreditPurchase,
  cancelCreditPurchaseRequest,
  getMyReservedCredits,
  WALLET_EVENT,
} from "../../../lib/platform/db";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { useConfirm } from "../components/ConfirmDialog";
import { formatCredits, PACKAGES } from "../../../lib/platform/credits";
import Link from "next/link";
import { container, card, h1, sectionLabel, muted, badge, colors, money, button } from "../../../lib/platform/theme";
import SignedOutNotice from "../components/SignedOutNotice";
import LoadError from "../components/LoadError";

const TYPE_KEY = {
  purchase: "typePurchase",
  deposit: "typeDeposit",
  request_fee: "typeRequestFee",
  claim_fee: "typeClaimFee",
  refund_credit: "typeRefund",
  adjustment: "typeAdjustment",
};

// Υπόλοιπο, αγορά, ιστορικό — τίποτα άλλο. Τα πακέτα και οι τιμές ζουν
// στην οθόνη αγοράς (/platform/wallet/buy), όπου διαλέγεις.
export default function WalletPage() {
  const t = useTranslations("WalletPage");
  const f = useFormat();
  const { session, userRow, loading, refresh, readOnly } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [pending, setPending] = useState(null);
  // Δεσμευμένα σε ανοιχτά αιτήματα (0122): χρεώνονται με την αποδοχή.
  const [reserved, setReserved] = useState(0);
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
    getMyReservedCredits().then(setReserved).catch(() => {});
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
    if (!(await confirm(t("cancelConfirm", { reference: pending.reference }), { confirmLabel: t("cancelRequest") }))) return;
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

  if (loading) return <div style={container}>{t("loading")}</div>;
  if (!session) return <SignedOutNotice />;

  const packName = pending?.package_key ? PACKAGES.find((x) => x.key === pending.package_key)?.name : null;

  return (
    <div style={container}>
      <h1 style={h1}>Credits</h1>

      <div style={{ ...card, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={muted}>{t("available")}</div>
          <div style={{ ...money, fontSize: 32, fontWeight: 600, marginTop: 6 }}>
            {formatCredits(Math.max(0, Number(userRow?.wallet_balance ?? 0) - reserved))}
          </div>
          {reserved > 0 && (
            <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>
              {t.rich("reservedNote", {
                credits: formatCredits(reserved),
                count: reserved,
                m: (chunks) => <span style={{ ...money, color: colors.ink }}>{chunks}</span>,
              })}
            </div>
          )}
          <p style={{ ...muted, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.5 }}>
            {t("howItWorks")}
          </p>
        </div>
        {!pending && !readOnly && (
          <Link href="/platform/wallet/buy" style={{ ...button("primary"), textDecoration: "none" }}>
            {t("buy")}
          </Link>
        )}
      </div>

      {pending && (
        <div style={{ ...card, borderLeft: `3px solid ${colors.accent}` }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t("pendingTitle")}</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            {[packName, formatCredits(pending.credits), `${pending.price_eur}€`].filter(Boolean).join(" · ")}
          </div>
          <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>
            {t("code")} <span style={{ ...money, color: colors.ink }}>{pending.reference}</span> ·{" "}
            {f.date(pending.created_at?.slice(0, 10))}
          </div>
          <p style={{ ...muted, fontSize: 13, margin: "10px 0 0", lineHeight: 1.5 }}>
            {t("pendingNote")}
          </p>
          {!readOnly && (
            <button type="button" style={{ ...button("secondary"), marginTop: 12 }} disabled={cancelling} onClick={cancelPending}>
              {cancelling ? "…" : t("cancelRequest")}
            </button>
          )}
          {error && <p style={{ color: colors.danger, fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
        </div>
      )}

      <h2 style={{ ...sectionLabel, marginTop: 32 }}>{t("movements")}</h2>
      {busy && <p style={muted}>{t("loading")}</p>}
      {!busy && loadFailed && <LoadError what={t("loadWhat")} onRetry={loadTransactions} />}
      {!busy && !loadFailed && transactions.length === 0 && <p style={muted}>{t("noMovements")}</p>}
      {transactions.map((tx) => (
        <div key={tx.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span>
              <span style={{ fontSize: 14 }}>{TYPE_KEY[tx.type] ? t(TYPE_KEY[tx.type]) : tx.type}</span>
              {tx.note && <span style={{ ...muted, fontSize: 12, display: "block", marginTop: 2 }}>{tx.note}</span>}
              <span style={{ ...muted, fontSize: 12, display: "block", marginTop: 2 }}>{f.date(tx.created_at?.slice(0, 10))}</span>
            </span>
            <span style={badge(tx.amount > 0 ? "success" : "neutral")}>{tx.amount > 0 ? "+" : ""}{formatCredits(tx.amount)}</span>
          </div>
        </div>
      ))}
      {confirmDialog}
    </div>
  );
}
