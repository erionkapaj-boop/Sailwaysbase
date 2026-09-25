"use client";
import { useState } from "react";
import Link from "next/link";
import { Panel, MetricGrid, Metric, Row, RowMain, Status, Empty, WALLET_TYPE_LABEL, colors, button } from "../../ui";
import { adminCreditWallet } from "../../../../../lib/platform/db";
import { formatDate, formatDateTime } from "../../../../../lib/platform/notifications";
import { Field, fieldInput, errorLabel } from "./shared";

export default function FinanceTab({ data, id, reload, confirm }) {
  const u = data.user;
  const wallet = data.wallet || [];
  const disputes = data.disputes || [];

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleCredit(e) {
    e.preventDefault();
    const value = Number(amount);
    // Πραγματικά χρήματα: ένα ψηφίο παραπάνω (100 αντί για 10) δεν αναιρείται
    // από εδώ, οπότε το ποσό διαβάζεται ξανά πριν γίνει.
    if (
      !(await confirm(
        `Πίστωση ${value}€ στο πορτοφόλι του ${u.full_name || u.phone_number}; Νέο υπόλοιπο: ${Number(u.wallet_balance ?? 0) + value}€.`,
        { tone: "primary", confirmLabel: `Πίστωση ${value}€` }
      ))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminCreditWallet(id, value, notes.trim());
      setAmount("");
      setNotes("");
      await reload();
      setNotice("Η πίστωση καταχωρήθηκε.");
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <MetricGrid>
        <Metric label="Τρέχον υπόλοιπο" value={`${u.wallet_balance ?? 0}€`} />
      </MetricGrid>

      <Panel title="Πίστωση πορτοφολιού" subtitle="Χειροκίνητη πίστωση — π.χ. αποζημίωση για πρόβλημα. Καταγράφεται στο ιστορικό.">
        <form onSubmit={handleCredit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 120px" }}>
            <Field label="Ποσό (€)">
              <input style={fieldInput} type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
          </div>
          <div style={{ flex: "2 1 220px" }}>
            <Field label="Σημείωση (προαιρετικό)">
              <input style={fieldInput} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="π.χ. αποζημίωση για ακυρωμένη κράτηση" />
            </Field>
          </div>
          <button type="submit" style={{ ...button("primary"), marginBottom: 12 }} disabled={busy}>
            {busy ? "…" : "Πίστωση"}
          </button>
        </form>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        {notice && <p style={{ color: colors.success, fontSize: 13 }}>{notice}</p>}
      </Panel>

      <Panel
        title={`Κινήσεις πορτοφολιού (${wallet.length})`}
        action={
          <Link href={`/platform/admin/finance?phone=${encodeURIComponent(u.phone_number || "")}`} style={{ fontSize: 12.5, color: colors.ink }}>
            Στα Οικονομικά
          </Link>
        }
        padded={false}
      >
        {wallet.length === 0 && <Empty>Καμία κίνηση.</Empty>}
        {wallet.map((w) => (
          <Row key={w.id}>
            <RowMain title={WALLET_TYPE_LABEL[w.type] || w.type} meta={formatDate(w.created_at?.slice(0, 10))} />
            <span style={{ color: w.amount > 0 ? colors.success : colors.ink, fontWeight: 500 }}>
              {w.amount > 0 ? "+" : ""}
              {w.amount}€
            </span>
          </Row>
        ))}
      </Panel>

      <Panel title={`Αναφορές ακύρωσης (${disputes.length})`} padded={false}>
        {disputes.length === 0 && <Empty>Καμία αναφορά.</Empty>}
        {disputes.map((d) => (
          <Row key={d.id}>
            <RowMain
              title={[d.place, d.reason].filter(Boolean).join(" · ")}
              meta={`${d.reported_by_self ? "Ανέφερε ο ίδιος" : "Αναφέρθηκε γι' αυτόν"} · ${formatDateTime(d.created_at)}`}
            />
            <Status value={d.resolved_at ? "completed" : "pending"} />
          </Row>
        ))}
      </Panel>
    </>
  );
}
