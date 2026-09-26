"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts, useRefreshAdminCounts } from "../AdminShell";
import { Panel, Metric, MetricGrid, Row, RowMain, Empty, colors, muted, money, button, STATUS_LABEL } from "../ui";
import { adminFindUserByPhone, adminCreditWallet, adminAdjustWallet } from "../../../../lib/platform/db";

// Above this a second «are you sure» — the slip this guards against is an
// extra zero (1.000€ for 100€).
const LARGE_AMOUNT = 200;

const ERRORS = {
  insufficient_wallet: "Το υπόλοιπο δεν φτάνει: μια διόρθωση δεν μπορεί να το κάνει αρνητικό.",
  reason_required: "Γράψε τον λόγο της διόρθωσης — τον βλέπει και ο χρήστης.",
  invalid_amount: "Γράψε ένα ποσό μεγαλύτερο από το μηδέν.",
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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [mode, setMode] = useState("credit");

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

  // Opened from a user's page («Φόρτωση υπολοίπου») with ?phone=… — land
  // with that person already found and selected.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("phone");
    if (p) {
      setPhone(p);
      lookup(p);
    }
  }, []);

  async function submit() {
    const value = Number(amount);
    if (!selected || !(value > 0)) {
      setError(ERRORS.invalid_amount);
      return;
    }
    const correcting = mode === "correct";
    if (correcting && !note.trim()) {
      setError(ERRORS.reason_required);
      return;
    }
    const who = selected.full_name || selected.phone_number;
    if (value > LARGE_AMOUNT) {
      const verb = correcting ? "Αφαίρεση" : "Πίστωση";
      if (!window.confirm(`${verb} ${value}€ ${correcting ? "από" : "σε"} ${who}. Σίγουρα;`)) return;
    }
    setBusy(true);
    setError("");
    try {
      if (correcting) {
        const balance = await adminAdjustWallet(selected.id, -value, note.trim());
        setDone(`${who}: αφαιρέθηκαν ${value}€. Νέο υπόλοιπο ${balance}€.`);
      } else {
        await adminCreditWallet(selected.id, value, note || `Χειροκίνητη κατάθεση ${value}€`);
        setDone(`${who}: πιστώθηκαν ${value}€.`);
      }
      setAmount("");
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
      <div style={{ display: "flex", gap: 8, marginBottom: 12, maxWidth: 420 }}>
        {tab("credit", "Πίστωση")}
        {tab("correct", "Διόρθωση (αφαίρεση)")}
      </div>
      {mode === "correct" && (
        <p style={{ ...muted, fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          Για λάθος πίστωση ή άλλο λάθος στο υπόλοιπο. Ο λόγος είναι υποχρεωτικός και εμφανίζεται στο
          ιστορικό του χρήστη. Το υπόλοιπο δεν μπορεί να γίνει αρνητικό.
        </p>
      )}
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
          {" · υπόλοιπο "}<span style={money}>{u.wallet_balance ?? 0}€</span>
        </button>
      ))}

      {selected && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={{ ...inputStyle, flex: "1 1 110px" }}
            type="number"
            min="0"
            placeholder={mode === "correct" ? "Ποσό προς αφαίρεση €" : "Ποσό €"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            style={{ ...inputStyle, flex: "2 1 200px" }}
            placeholder={mode === "correct" ? "Λόγος διόρθωσης (υποχρεωτικό)" : "Αιτιολογία"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={button(mode === "correct" ? "danger" : "primary")} disabled={busy} onClick={submit}>
            {busy ? "…" : mode === "correct" ? "Καταχώριση αφαίρεσης" : "Καταχώριση πίστωσης"}
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
      subtitle="Τι κρατά η πλατφόρμα για λογαριασμό χρηστών, τι έχει εισπράξει, και φόρτωση υπολοίπου σε χρήστη."
    >
      {/* Liabilities and revenue kept visually apart on purpose: the balances
          below are other people's money the platform is holding, not income,
          and an operator reading them as the same figure is the mistake this
          screen exists to prevent. */}
      <Panel title="Υπόλοιπα χρηστών" padded={false}>
        <div style={{ padding: 16 }}>
          <MetricGrid min={160}>
            {/* Ένα πορτοφόλι ανά άνθρωπο πια, όχι ανά ρόλο — δεν έχει νόημα να
                σπάει σε "πελάτες"/"επαγγελματίες". */}
            <Metric label="Σύνολο" value={`${live.wallet_total ?? 0}€`} hint="χρήματα χρηστών, όχι έσοδα" />
          </MetricGrid>
        </div>
      </Panel>

      <Panel title="Έσοδα πλατφόρμας" padded={false}>
        <div style={{ padding: 16 }}>
          <MetricGrid min={160}>
            <Metric label="Τέλη (30 ημ.)" value={`${live.fees_30d ?? 0}€`} />
            <Metric label="Τέλη συνολικά" value={`${live.fees_all_time ?? 0}€`} />
            <Metric label="Επιστροφές (30 ημ.)" value={`${live.refunds_30d ?? 0}€`} hint="άκαρπα αιτήματα" />
          </MetricGrid>
        </div>
      </Panel>

      <Panel
        title="Υπόλοιπο χρήστη"
        subtitle="Πίστωση: όταν κάποιος σού πλήρωσε με τραπεζική κατάθεση ή κάρτα εκτός πλατφόρμας. Διόρθωση: για λάθος ποσό. Βρες τον με το τηλέφωνο· και τα δύο καταγράφονται στο ιστορικό του."
      >
        <Topup onDone={refreshCounts} />
      </Panel>
    </AdminShell>
  );
}
