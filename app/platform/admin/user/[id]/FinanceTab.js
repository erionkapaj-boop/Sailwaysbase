"use client";
import { useAuth } from "../../../AuthContext";
import { formatCredits } from "../../../../../lib/platform/credits";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../../useFormat";
import Link from "next/link";
import { Panel, MetricGrid, Metric, Row, RowMain, Status, Empty, colors, button } from "../../ui";
import { adminCreditWallet } from "../../../../../lib/platform/db";
import { Field, fieldInput, useErrorLabel } from "./shared";

export default function FinanceTab({ data, id, reload, confirm }) {
  const t = useTranslations("AdminUser");
  const f = useFormat();
  const errorLabel = useErrorLabel();
  const personName = (p) => (f.locale === "en" && p?.full_name_latin) || p?.full_name;
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
      setError(t("finance.errAmount"));
      return;
    }
    // Ένα ψηφίο παραπάνω δεν αναιρείται από εδώ· ο αριθμός διαβάζεται ξανά.
    if (
      !(await confirm(
        t("finance.giftConfirm", {
          credits: formatCredits(value),
          name: personName(u) || u.phone_number,
          balance: formatCredits(Number(u.wallet_balance ?? 0) + value),
        }),
        { tone: "primary", confirmLabel: t("finance.giftLabel", { credits: formatCredits(value) }) }
      ))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminCreditWallet(id, value, notes.trim() || t("finance.giftDefaultNote"));
      setAmount("");
      setNotes("");
      await reload();
      setNotice(t("finance.recorded"));
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <MetricGrid>
        <Metric label={t("finance.credits")} value={formatCredits(u.wallet_balance)} />
      </MetricGrid>

      {isOwner && (
      <Panel title={t("finance.giftTitle")} subtitle={t("finance.giftSubtitle")}>
        <form onSubmit={handleCredit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 120px" }}>
            <Field label={t("finance.credits")}>
              <input style={fieldInput} type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
          </div>
          <div style={{ flex: "2 1 220px" }}>
            <Field label={t("finance.noteLabel")}>
              <input style={fieldInput} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("finance.notePlaceholder")} />
            </Field>
          </div>
          <button type="submit" style={{ ...button("primary"), marginBottom: 12 }} disabled={busy}>
            {busy ? "…" : t("finance.recordGift")}
          </button>
        </form>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        {notice && <p style={{ color: colors.success, fontSize: 13 }}>{notice}</p>}
      </Panel>
      )}

      <Panel
        title={t("finance.movements", { count: wallet.length })}
        action={
          isOwner && (
            <Link href={`/platform/admin/finance?phone=${encodeURIComponent(u.phone_number || "")}`} style={{ fontSize: 12.5, color: colors.ink }}>
              {t("finance.toFinance")}
            </Link>
          )
        }
        padded={false}
      >
        {wallet.length === 0 && <Empty>{t("finance.noMovements")}</Empty>}
        {wallet.map((w) => (
          <Row key={w.id}>
            <RowMain
              title={t.has(`finance.types.${w.type}`) ? t(`finance.types.${w.type}`) : w.type}
              meta={[
                f.date(w.created_at?.slice(0, 10)),
                w.price_eur != null ? `${w.price_eur}€` : null,
                w.unit === "eur" ? t("finance.preCredits") : null,
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

      <Panel title={t("finance.disputes", { count: disputes.length })} padded={false}>
        {disputes.length === 0 && <Empty>{t("finance.noDisputes")}</Empty>}
        {disputes.map((d) => (
          <Row key={d.id}>
            <RowMain
              title={[d.place, d.reason].filter(Boolean).join(" · ")}
              meta={`${d.reported_by_self ? t("finance.reportedSelf") : t("finance.reportedAbout")} · ${f.dateTime(d.created_at)}`}
            />
            <Status value={d.resolved_at ? "completed" : "pending"} />
          </Row>
        ))}
      </Panel>
    </>
  );
}
