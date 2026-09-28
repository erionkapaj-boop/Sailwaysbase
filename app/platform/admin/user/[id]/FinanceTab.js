"use client";
import { useAuth } from "../../../AuthContext";
import { formatCredits } from "../../../../../lib/platform/credits";
import { useState } from "react";
import Link from "next/link";
import { Panel, MetricGrid, Metric, Row, RowMain, Status, Empty, WALLET_TYPE_LABEL, colors, button } from "../../ui";
import { adminCreditWallet } from "../../../../../lib/platform/db";
import { formatDate, formatDateTime } from "../../../../../lib/platform/notifications";
import { Field, fieldInput, errorLabel } from "./shared";

export default function FinanceTab({ data, id, reload, confirm }) {
  const { isOwner } = useAuth();
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
    if (!Number.isInteger(value) || value <= 0) {
      setError("Γράψε ακέραιο αριθμό credits, μεγαλύτερο από το μηδέν.");
      return;
    }
    // Ένα ψηφίο παραπάνω δεν αναιρείται από εδώ· ο αριθμός διαβάζεται ξανά.
    if (
      !(await confirm(
        `Δώρο ${formatCredits(value)} σε ${u.full_name || u.phone_number}; Νέο υπόλοιπο: ${formatCredits(Number(u.wallet_balance ?? 0) + value)}.`,
        { tone: "primary", confirmLabel: `Δώρο ${formatCredits(value)}` }
      ))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminCreditWallet(id, value, notes.trim() || "Δώρο");
      setAmount("");
      setNotes("");
      await reload();
      setNotice("Καταχωρήθηκε.");
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <MetricGrid>
        <Metric label="Credits" value={formatCredits(u.wallet_balance)} />
      </MetricGrid>

      {isOwner && (
      <Panel title="Δώρο credits" subtitle="Credits χωρίς πληρωμή, π.χ. αποζημίωση. Για αγορά: Οικονομικά. Καταγράφεται στο ιστορικό.">
        <form onSubmit={handleCredit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 120px" }}>
            <Field label="Credits">
              <input style={fieldInput} type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
          </div>
          <div style={{ flex: "2 1 220px" }}>
            <Field label="Σημείωση (προαιρετικό)">
              <input style={fieldInput} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="π.χ. αποζημίωση για ακυρωμένη κράτηση" />
            </Field>
          </div>
          <button type="submit" style={{ ...button("primary"), marginBottom: 12 }} disabled={busy}>
            {busy ? "…" : "Καταχώριση δώρου"}
          </button>
        </form>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        {notice && <p style={{ color: colors.success, fontSize: 13 }}>{notice}</p>}
      </Panel>
      )}

      <Panel
        title={`Κινήσεις credits (${wallet.length})`}
        action={
          isOwner && (
            <Link href={`/platform/admin/finance?phone=${encodeURIComponent(u.phone_number || "")}`} style={{ fontSize: 12.5, color: colors.ink }}>
              Στα Οικονομικά
            </Link>
          )
        }
        padded={false}
      >
        {wallet.length === 0 && <Empty>Καμία κίνηση.</Empty>}
        {wallet.map((w) => (
          <Row key={w.id}>
            <RowMain
              title={WALLET_TYPE_LABEL[w.type] || w.type}
              meta={[
                formatDate(w.created_at?.slice(0, 10)),
                w.price_eur != null ? `${w.price_eur}€` : null,
                w.unit === "eur" ? "πριν τα credits" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <span style={{ color: w.amount > 0 ? colors.success : colors.ink, fontWeight: 500 }}>
              {w.amount > 0 ? "+" : ""}
              {w.unit === "eur" ? `${w.amount}€` : formatCredits(w.amount)}
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
