"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts, useRefreshAdminCounts } from "../AdminShell";
import { Panel, Metric, MetricGrid, Row, RowMain, Empty, colors, muted, money, button, STATUS_LABEL } from "../ui";
import { adminFindUserByPhone, adminCreditWallet, adminAdjustWallet, adminRecordPurchase, getCreditOffer } from "../../../../lib/platform/db";
import { formatCredits, PACKAGES, verbFor } from "../../../../lib/platform/credits";

// Πάνω από αυτό, δεύτερο «σίγουρα;» — για το επιπλέον μηδενικό.
const LARGE_CREDITS = 20;

const ERRORS = {
  insufficient_wallet: "Το υπόλοιπο δεν φτάνει: μια διόρθωση δεν μπορεί να το κάνει αρνητικό.",
  reason_required: "Γράψε τον λόγο της διόρθωσης. Εμφανίζεται στο ιστορικό του χρήστη.",
  invalid_amount: "Γράψε ακέραιο αριθμό credits, μεγαλύτερο από το μηδέν.",
  invalid_price: "Γράψε το ποσό σε € που πληρώθηκε.",
};

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
      setError(err.message || String(err));
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
      setError(ERRORS.invalid_amount);
      return;
    }
    const eur = Number(price);
    if (mode === "purchase" && (price === "" || !(eur >= 0))) {
      setError(ERRORS.invalid_price);
      return;
    }
    if (mode === "correct" && !note.trim()) {
      setError(ERRORS.reason_required);
      return;
    }
    const who = selected.full_name || selected.phone_number;
    if (value > LARGE_CREDITS) {
      const verb = mode === "correct" ? "Αφαίρεση" : "Πίστωση";
      if (!window.confirm(`${verb} ${formatCredits(value)} ${mode === "correct" ? "από" : "σε"} ${who}. Σίγουρα;`)) return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "correct") {
        const balance = await adminAdjustWallet(selected.id, -value, note.trim());
        setDone(`${who}: ${verbFor(value, "αφαιρέθηκε", "αφαιρέθηκαν")} ${formatCredits(value)}. Νέο υπόλοιπο ${formatCredits(balance)}.`);
      } else if (mode === "purchase") {
        const balance = await adminRecordPurchase(selected.id, value, eur, note.trim());
        setDone(`${who}: αγορά ${formatCredits(value)} (${eur}€). Νέο υπόλοιπο ${formatCredits(balance)}.`);
      } else {
        await adminCreditWallet(selected.id, value, note.trim() || "Δώρο");
        setDone(`${who}: ${verbFor(value, "πιστώθηκε", "πιστώθηκαν")} ${formatCredits(value)} δώρο.`);
      }
      setAmount("");
      setPrice("");
      setPkg("");
      setNote("");
      setSelected(null);
      setResults([]);
      onDone?.();
    } catch (err) {
      setError(ERRORS[err.message] || err.message || String(err));
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
        {tab("purchase", "Αγορά")}
        {tab("gift", "Δώρο")}
        {tab("correct", "Διόρθωση (αφαίρεση)")}
      </div>
      <p style={{ ...muted, fontSize: 13, marginTop: 0, marginBottom: 12 }}>
        {mode === "purchase" && "Πληρωμή για credits. Το ποσό σε € καταγράφεται στις πωλήσεις."}
        {mode === "gift" && "Credits χωρίς πληρωμή. Δεν καταγράφονται στις πωλήσεις."}
        {mode === "correct" &&
          "Για λάθος πίστωση ή άλλο λάθος στο υπόλοιπο. Ο λόγος είναι υποχρεωτικός και εμφανίζεται στο ιστορικό του χρήστη. Το υπόλοιπο δεν γίνεται αρνητικό."}
      </p>
      <form onSubmit={find} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          style={{ ...inputStyle, flex: "2 1 200px", minWidth: 0 }}
          placeholder="Τηλέφωνο χρήστη"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button type="submit" style={button("secondary")}>
          Εύρεση
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
          {u.full_name || "(χωρίς όνομα)"} · <span style={money}>{u.phone_number}</span> · {STATUS_LABEL[u.role] || u.role}
          {" · υπόλοιπο "}<span style={money}>{formatCredits(u.wallet_balance)}</span>
        </button>
      ))}

      {selected && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {mode === "purchase" && (
            <select
              style={{ ...inputStyle, flex: "1 1 200px" }}
              value={pkg}
              onChange={(e) => choosePackage(e.target.value)}
              aria-label="Πακέτο"
            >
              <option value="">Χωρίς πακέτο</option>
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
            placeholder={mode === "correct" ? "Credits προς αφαίρεση" : "Credits"}
            value={amount}
            disabled={mode === "purchase" && pkg !== ""}
            onChange={(e) => onAmount(e.target.value)}
          />
          {mode === "purchase" && (
            <input
              style={{ ...inputStyle, flex: "1 1 110px" }}
              type="number"
              min="0"
              placeholder="Ποσό €"
              value={price}
              disabled={pkg !== ""}
              onChange={(e) => setPrice(e.target.value)}
            />
          )}
          <input
            style={{ ...inputStyle, flex: "2 1 200px" }}
            placeholder={mode === "correct" ? "Λόγος διόρθωσης (υποχρεωτικό)" : "Σημείωση"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={button(mode === "correct" ? "danger" : "primary")} disabled={busy} onClick={submit}>
            {busy ? "…" : mode === "correct" ? "Καταχώριση αφαίρεσης" : mode === "purchase" ? "Καταχώριση αγοράς" : "Καταχώριση δώρου"}
          </button>
        </div>
      )}

      {done && <p style={{ color: colors.success, fontSize: 13, marginTop: 10 }}>{done}</p>}
      {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 10 }}>{error}</p>}
    </>
  );
}

export default function FinancePage() {
  const counts = useAdminCounts();
  const refreshCounts = useRefreshAdminCounts();
  const [live, setLive] = useState(counts);

  useEffect(() => setLive(counts), [counts]);

  return (
    <AdminShell
      title="Οικονομικά"
      subtitle="Credits στους λογαριασμούς, πωλήσεις και καταχώριση αγοράς."
    >
      {/* Τα credits στους λογαριασμούς είναι προπληρωμένη υπηρεσία που
          οφείλεται ακόμα, όχι έσοδα — γι' αυτό χωριστά από τις πωλήσεις. */}
      <Panel title="Credits χρηστών" padded={false}>
        <div style={{ padding: 16 }}>
          <MetricGrid min={160}>
            <Metric label="Σε λογαριασμούς" value={formatCredits(live.wallet_total)} hint="προπληρωμένα, αχρησιμοποίητα" />
            <Metric label="Χρησιμοποιήθηκαν (30 ημ.)" value={formatCredits(live.fees_30d)} />
            <Metric label="Χρησιμοποιήθηκαν συνολικά" value={formatCredits(live.fees_all_time)} />
            <Metric label="Επιστροφές (30 ημ.)" value={formatCredits(live.refunds_30d)} />
          </MetricGrid>
        </div>
      </Panel>

      <Panel title="Πωλήσεις" padded={false}>
        <div style={{ padding: 16 }}>
          <MetricGrid min={160}>
            <Metric label="30 ημέρες" value={`${live.sales_eur_30d ?? 0}€`} />
            <Metric label="Credits που πουλήθηκαν (30 ημ.)" value={formatCredits(live.credits_sold_30d)} />
            <Metric label="Συνολικά" value={`${live.sales_eur_all_time ?? 0}€`} />
          </MetricGrid>
        </div>
      </Panel>

      <Panel
        title="Credits χρήστη"
        subtitle="Αγορά: πληρωμή με τραπεζική κατάθεση ή κάρτα εκτός πλατφόρμας. Δώρο: χωρίς πληρωμή. Διόρθωση: για λάθος. Αναζήτηση με το τηλέφωνο· όλα καταγράφονται στο ιστορικό του."
      >
        <Topup onDone={refreshCounts} />
      </Panel>
    </AdminShell>
  );
}
