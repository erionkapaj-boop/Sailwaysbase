"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useFormat } from "../../useFormat";
import AdminShell, { useAdminCounts, useRefreshAdminCounts } from "../AdminShell";
import { Panel, Metric, MetricGrid, Row, RowMain, Empty, colors, muted, money, button, STATUS_LABEL } from "../ui";
import {
  adminFindUserByPhone,
  adminCreditWallet,
  adminAdjustWallet,
  adminRecordPurchase,
  getCreditOffer,
  adminListCreditPurchases,
  adminCompleteCreditPurchase,
  adminCancelCreditPurchase,
} from "../../../../lib/platform/db";
import { useConfirm } from "../../components/ConfirmDialog";
import { formatCredits, PACKAGES } from "../../../../lib/platform/credits";

// Πάνω από αυτό, δεύτερο «σίγουρα;» — για το επιπλέον μηδενικό.
const LARGE_CREDITS = 20;

// Κωδικοί σφάλματος της βάσης που έχουν δικό τους κείμενο (AdminFinance.err_<κωδικός>).
const ERRORS = ["insufficient_wallet", "credits_reserved", "reason_required", "invalid_amount", "invalid_price"];

const inputStyle = {
  padding: "8px 11px",
  fontSize: 14,
  fontFamily: "inherit",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: colors.card,
  color: colors.ink,
  boxSizing: "border-box",
};

function Topup({ onDone }) {
  const t = useTranslations("AdminFinance");
  const locale = useLocale();
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [pkg, setPkg] = useState("");
  const [offer, setOffer] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [mode, setMode] = useState("purchase");

  useEffect(() => {
    getCreditOffer().then(setOffer).catch(() => setOffer(null));
  }, []);

  async function lookup(value) {
    setError("");
    setDone("");
    try {
      const found = await adminFindUserByPhone(value);
      setResults(found);
      if (found.length === 1) setSelected(found[0]);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function find(e) {
    e.preventDefault();
    lookup(phone);
  }

  // Από τη σελίδα χρήστη με ?phone=… — ο χρήστης είναι ήδη επιλεγμένος.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("phone");
    if (p) {
      setPhone(p);
      lookup(p);
    }
  }, []);

  function choosePackage(key) {
    setPkg(key);
    const p = offer?.packages.find((x) => x.key === key);
    if (p) {
      setAmount(String(p.credits));
      setPrice(String(p.price));
    } else {
      setAmount("");
      setPrice("");
    }
  }

  function onAmount(value) {
    setAmount(value);
    if (mode === "purchase" && pkg === "") {
      const n = Number(value);
      setPrice(n > 0 && offer?.creditPrice ? String(n * offer.creditPrice) : "");
    }
  }

  async function submit() {
    const value = Number(amount);
    if (!selected || !(value > 0) || !Number.isInteger(value)) {
      setError(t("err_invalid_amount"));
      return;
    }
    const eur = Number(price);
    if (mode === "purchase" && (price === "" || !(eur >= 0))) {
      setError(t("err_invalid_price"));
      return;
    }
    if (mode === "correct" && !note.trim()) {
      setError(t("err_reason_required"));
      return;
    }
    const who = (locale === "en" && selected.full_name_latin) || selected.full_name || selected.phone_number;
    if (value > LARGE_CREDITS) {
      if (!window.confirm(t(mode === "correct" ? "confirmLargeRemove" : "confirmLargeCredit", { credits: formatCredits(value), who }))) return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "correct") {
        const balance = await adminAdjustWallet(selected.id, -value, note.trim());
        setDone(t("doneRemoved", { who, count: value, credits: formatCredits(value), balance: formatCredits(balance) }));
      } else if (mode === "purchase") {
        const balance = await adminRecordPurchase(selected.id, value, eur, note.trim());
        setDone(t("donePurchase", { who, credits: formatCredits(value), eur, balance: formatCredits(balance) }));
      } else {
        await adminCreditWallet(selected.id, value, note.trim() || t("gift"));
        setDone(t("doneGift", { who, count: value, credits: formatCredits(value) }));
      }
      setAmount("");
      setPrice("");
      setPkg("");
      setNote("");
      setSelected(null);
      setResults([]);
      onDone?.();
    } catch (err) {
      setError(ERRORS.includes(err.message) ? t(`err_${err.message}`) : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const tab = (value, label) => (
    <button
      type="button"
      onClick={() => { setMode(value); setError(""); }}
      aria-pressed={mode === value}
      style={{ ...button(mode === value ? "primary" : "secondary"), flex: "1 1 0" }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, maxWidth: 520 }}>
        {tab("purchase", t("tabPurchase"))}
        {tab("gift", t("tabGift"))}
        {tab("correct", t("tabCorrect"))}
      </div>
      <p style={{ ...muted, fontSize: 13, marginTop: 0, marginBottom: 12 }}>
        {mode === "purchase" && t("hintPurchase")}
        {mode === "gift" && t("hintGift")}
        {mode === "correct" && t("hintCorrect")}
      </p>
      <form onSubmit={find} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          style={{ ...inputStyle, flex: "2 1 200px", minWidth: 0 }}
          placeholder={t("phonePlaceholder")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button type="submit" style={button("secondary")}>
          {t("find")}
        </button>
      </form>

      {results.map((u) => (
        <button
          key={u.id}
          onClick={() => setSelected(u)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            marginBottom: 6,
            border: `1px solid ${selected?.id === u.id ? colors.ink : colors.border}`,
            background: selected?.id === u.id ? colors.seaGlass : colors.card,
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
          }}
        >
          {(locale === "en" && u.full_name_latin) || u.full_name || t("noName")} · <span style={money}>{u.phone_number}</span> · {STATUS_LABEL[u.role] || u.role}
          {` · ${t("balance")} `}<span style={money}>{formatCredits(u.wallet_balance)}</span>
        </button>
      ))}

      {selected && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {mode === "purchase" && (
            <select
              style={{ ...inputStyle, flex: "1 1 200px" }}
              value={pkg}
              onChange={(e) => choosePackage(e.target.value)}
              aria-label={t("package")}
            >
              <option value="">{t("noPackage")}</option>
              {(offer?.packages || []).map((p) => (
                <option key={p.key} value={p.key}>
                  {PACKAGES.find((x) => x.key === p.key)?.name || p.key} · {formatCredits(p.credits)} · {p.price}€
                </option>
              ))}
            </select>
          )}
          <input
            style={{ ...inputStyle, flex: "1 1 110px" }}
            type="number"
            min="1"
            step="1"
            placeholder={mode === "correct" ? t("creditsToRemove") : t("credits")}
            value={amount}
            disabled={mode === "purchase" && pkg !== ""}
            onChange={(e) => onAmount(e.target.value)}
          />
          {mode === "purchase" && (
            <input
              style={{ ...inputStyle, flex: "1 1 110px" }}
              type="number"
              min="0"
              placeholder={t("amountEur")}
              value={price}
              disabled={pkg !== ""}
              onChange={(e) => setPrice(e.target.value)}
            />
          )}
          <input
            style={{ ...inputStyle, flex: "2 1 200px" }}
            placeholder={mode === "correct" ? t("correctReason") : t("note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={button(mode === "correct" ? "danger" : "primary")} disabled={busy} onClick={submit}>
            {busy ? "…" : mode === "correct" ? t("submitRemove") : mode === "purchase" ? t("submitPurchase") : t("submitGift")}
          </button>
        </div>
      )}

      {done && <p style={{ color: colors.success, fontSize: 13, marginTop: 10 }}>{done}</p>}
      {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 10 }}>{error}</p>}
    </>
  );
}

// Αιτήματα αγοράς από τους χρήστες: επιβεβαίωση όταν φανεί η πληρωμή.
function PurchaseRequests({ onDone }) {
  const t = useTranslations("AdminFinance");
  const f = useFormat();
  const locale = useLocale();
  const nm = (r) => (locale === "en" && r.full_name_latin) || r.full_name || r.phone_number;
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  function load() {
    adminListCreditPurchases().then(setRows).catch((err) => setError(friendlyError(err)));
  }
  useEffect(load, []);

  async function act(r, complete) {
    const who = nm(r);
    const ok = await confirm(
      complete
        ? t("confirmPayment", { eur: r.price_eur, reference: r.reference, credits: formatCredits(r.credits), who })
        : t("confirmReject", { reference: r.reference, who }),
      { confirmLabel: complete ? t("confirm") : t("reject"), tone: complete ? "primary" : "danger" }
    );
    if (!ok) return;
    setBusyId(r.id);
    setError("");
    try {
      if (complete) await adminCompleteCreditPurchase(r.id);
      else await adminCancelCreditPurchase(r.id);
      load();
      onDone?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null && !error) return null;
  return (
    <Panel title={`${t("requestsTitle")}${rows?.length ? ` (${rows.length})` : ""}`} padded={false}>
      {error && <p style={{ color: colors.danger, fontSize: 13, padding: "12px 16px", margin: 0 }}>{error}</p>}
      {rows?.length === 0 && <Empty>{t("requestsEmpty")}</Empty>}
      {rows?.map((r) => (
        <Row key={r.id}>
          <RowMain
            title={`${nm(r)} · ${formatCredits(r.credits)} · ${r.price_eur}€`}
            meta={`${r.reference} · ${r.phone_number} · ${f.dateTime(r.created_at)}`}
          />
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={button("primary")} disabled={busyId === r.id} onClick={() => act(r, true)}>
              {t("confirmPaymentButton")}
            </button>
            <button style={button("secondary")} disabled={busyId === r.id} onClick={() => act(r, false)}>
              {t("reject")}
            </button>
          </span>
        </Row>
      ))}
      {confirmDialog}
    </Panel>
  );
}

export default function FinancePage() {
  const t = useTranslations("AdminFinance");
  const counts = useAdminCounts();
  const refreshCounts = useRefreshAdminCounts();
  const [live, setLive] = useState(counts);

  useEffect(() => setLive(counts), [counts]);

  return (
    <AdminShell
      ownerOnly
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <PurchaseRequests onDone={refreshCounts} />

      {/* Τα credits στους λογαριασμούς είναι προπληρωμένη υπηρεσία που
          * οφείλεται ακόμα, όχι έσοδα — γι' αυτό χωριστά από τις πωλήσεις. */}
      <Panel title={t("userCredits")} padded={false}>
        <div style={{ padding: 16 }}>
          <MetricGrid min={160}>
            <Metric label={t("inAccounts")} value={formatCredits(live.wallet_total)} hint={t("inAccountsHint")} />
            <Metric label={t("used30d")} value={formatCredits(live.fees_30d)} />
            <Metric label={t("usedAll")} value={formatCredits(live.fees_all_time)} />
            <Metric label={t("refunds30d")} value={formatCredits(live.refunds_30d)} />
          </MetricGrid>
        </div>
      </Panel>

      <Panel title={t("sales")} padded={false}>
        <div style={{ padding: 16 }}>
          <MetricGrid min={160}>
            <Metric label={t("days30")} value={`${live.sales_eur_30d ?? 0}€`} />
            <Metric label={t("creditsSold30d")} value={formatCredits(live.credits_sold_30d)} />
            <Metric label={t("total")} value={`${live.sales_eur_all_time ?? 0}€`} />
          </MetricGrid>
        </div>
      </Panel>

      <Panel
        title={t("userCreditsOne")}
        subtitle={t("userCreditsHint")}
      >
        <Topup onDone={refreshCounts} />
      </Panel>
    </AdminShell>
  );
}
