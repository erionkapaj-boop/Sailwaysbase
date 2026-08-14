"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Metric, MetricGrid, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { adminFindUserByPhone, adminCreditWallet } from "../../../../lib/platform/db";

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

  async function find(e) {
    e.preventDefault();
    setError("");
    setDone("");
    try {
      setResults(await adminFindUserByPhone(phone));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function credit() {
    if (!selected || !amount) return;
    setBusy(true);
    setError("");
    try {
      await adminCreditWallet(selected.id, Number(amount), note || `Χειροκίνητη κατάθεση ${amount}€`);
      setDone(`Πιστώθηκαν ${amount}€ στον ${selected.full_name || selected.phone_number}.`);
      setAmount("");
      setNote("");
      setSelected(null);
      setResults([]);
      onDone?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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
          {u.full_name || "(χωρίς όνομα)"} · <span style={money}>{u.phone_number}</span> · {u.role}
        </button>
      ))}

      {selected && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={{ ...inputStyle, flex: "1 1 110px" }}
            type="number"
            placeholder="Ποσό €"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            style={{ ...inputStyle, flex: "2 1 200px" }}
            placeholder="Αιτιολογία"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={button("primary")} disabled={busy} onClick={credit}>
            {busy ? "…" : "Πίστωση"}
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
  const [version, setVersion] = useState(0);
  const [live, setLive] = useState(counts);

  useEffect(() => setLive(counts), [counts]);

  const held = (live.wallet_clients || 0) + (live.wallet_pros || 0);

  return (
    <AdminShell
      title="Οικονομικά"
      subtitle="Τι κρατά η πλατφόρμα για λογαριασμό χρηστών, και τι έχει εισπράξει."
      counts={counts}
    >
      {/* Liabilities and revenue kept visually apart on purpose: the balances
          below are other people's money the platform is holding, not income,
          and an operator reading them as the same figure is the mistake this
          screen exists to prevent. */}
      <Panel title="Υπόλοιπα χρηστών — υποχρεώσεις, όχι έσοδα" padded={false}>
        <div style={{ padding: 16 }}>
          <MetricGrid min={160}>
            <Metric label="Πελάτες" value={`${live.wallet_clients ?? 0}€`} hint="credit σε πορτοφόλια" />
            <Metric label="Επαγγελματίες" value={`${live.wallet_pros ?? 0}€`} hint="credit σε πορτοφόλια" />
            <Metric label="Σύνολο" value={`${held}€`} hint="χρήματα τρίτων" />
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
        title="Χειροκίνητη πίστωση"
        subtitle="Για τραπεζική κατάθεση ή κάρτα εκτός πλατφόρμας. Καταγράφεται στο ιστορικό του χρήστη."
      >
        <Topup key={version} onDone={() => setVersion((v) => v + 1)} />
      </Panel>
    </AdminShell>
  );
}
