"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import AdminShell from "../AdminShell";
import { Panel, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { adminListSettings, adminUpdateSetting } from "../../../../lib/platform/db";
import { useConfirm } from "../../components/ConfirmDialog";

const inputStyle = (dirty) => ({
  padding: "8px 10px",
  fontSize: 14,
  fontFamily: "inherit",
  border: `1px solid ${dirty ? colors.warn : colors.border}`,
  borderRadius: 8,
  background: colors.card,
  color: colors.ink,
});

// Ομάδα, μονάδα και είδος κάθε ρύθμισης. Ονόματα και επεξηγήσεις: AdminSettings
// (s_<κλειδί>_label / _help / _warn). Αλλαγή διατύπωσης δεν θέλει migration.
const SETTING_META = {
  credit_price_eur: { group: "credits", unit: "eur", help: true },
  package_starter_credits: { group: "credits", unit: "credits" },
  package_starter_price: { group: "credits", unit: "eur" },
  package_professional_credits: { group: "credits", unit: "credits" },
  package_professional_price: { group: "credits", unit: "eur" },
  package_pro_credits: { group: "credits", unit: "credits" },
  package_pro_price: { group: "credits", unit: "eur" },
  signup_credits_professional: { group: "credits", unit: "credits", help: true },
  signup_credits_client: { group: "credits", unit: "credits", help: true },
  client_request_fee: { group: "fees", unit: "credits", help: true },
  client_request_limit: { group: "fees", unit: "requests", help: true },
  skipper_claim_fee: { group: "fees", unit: "credits", help: true },
  unclaimed_expiry_hours: { group: "expiry", unit: "hours", help: true },
  board_max_days: { group: "board", unit: "days", help: true },
  board_after_start_days: { group: "board", unit: "days", help: true },
  board_max_claims: { group: "board", unit: "claims", help: true },
  delivery_expiry_hours: { group: "expiry", unit: "hours", help: true },
  pro_response_hours: { group: "expiry", unit: "hours", help: true },
  delivery_skipper_rate_per_mile: { group: "delivery", unit: "eurPerMile", help: true },
  delivery_hostess_rate_per_mile: { group: "delivery", unit: "eurPerMile", help: true },
  delivery_cook_rate_per_mile: { group: "delivery", unit: "eurPerMile", help: true },
  delivery_deckhand_rate_per_mile: { group: "delivery", unit: "eurPerMile", help: true },
  delivery_platform_fee_pct: { group: "delivery", unit: "pct", help: true },
  delivery_min_fee: { group: "delivery", unit: "eur", help: true },
  otp_enabled: { group: "system", kind: "toggle", help: true, warn: true },
  reliability_min_history: { group: "reliability", unit: "bookings", help: true },
  cancellation_flag_review_threshold: { group: "reliability", unit: "cancellations", help: true },
  cancel_early_days: { group: "reliability", unit: "daysBefore", help: true },
  cancel_late_days: { group: "reliability", unit: "daysBefore", help: true },
  cancel_weight_early: { group: "reliability", help: true },
  cancel_weight_mid: { group: "reliability", help: true },
  cancel_weight_late: { group: "reliability", help: true },
  cancel_weight_after_start: { group: "reliability", help: true },
  cancel_decay_full_months: { group: "reliability", unit: "months", help: true },
  cancel_decay_zero_months: { group: "reliability", unit: "months", help: true },
  cancel_prior_jobs: { group: "reliability", unit: "jobs", help: true },
  cancel_full_rate: { group: "reliability", help: true },
};

const GROUP_KEYS = ["credits", "fees", "expiry", "board", "delivery", "system", "reliability", "other"];

// Οι τιμές όπως τις βλέπει ο χρήστης στη σελίδα Credits — μόνο όσες έχουν
// αποθηκευτεί.
function CreditPreview({ list }) {
  const t = useTranslations("AdminSettings");
  const v = Object.fromEntries(list.map((r) => [r.key, Number(r.value)]));
  const price = v.credit_price_eur;
  const packs = [
    ["Starter", v.package_starter_credits, v.package_starter_price],
    ["Professional", v.package_professional_credits, v.package_professional_price],
    ["Pro", v.package_pro_credits, v.package_pro_price],
  ].filter(([, c, p]) => c > 0 && p != null);
  if (price == null) return null;
  return (
    <div style={{ padding: "14px 16px", background: colors.seaGlass }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{t("previewTitle")}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
        1 credit · {price}€
        {packs.map(([name, c, p]) => {
          const per = p / c;
          const off = price > 0 ? Math.round((1 - per / price) * 100) : 0;
          return (
            <div key={name}>
              {name} · {c} credits · {p}€ <span style={muted}>({t("perCredit", { per: Math.round(per * 100) / 100, off: off > 0 ? `, −${off}%` : "" })})</span>
              {off < 0 && <span style={{ color: colors.danger }}> · {t("moreExpensive")}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations("AdminSettings");
  const [list, setList] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");
  // Σφάλμα ανά ρύθμιση, κάτω από τη δική της γραμμή: στο κινητό ένα μήνυμα
  // στην κορυφή της σελίδας δεν φαίνεται ποτέ.
  const [rowErrors, setRowErrors] = useState({});
  const [saved, setSaved] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  const dirtyKeys = list.filter((s) => drafts[s.key] !== undefined && drafts[s.key] !== String(s.value)).map((s) => s.key);

  // Αλλαγές που δεν αποθηκεύτηκαν: ερώτηση πριν φύγεις από τη σελίδα.
  useEffect(() => {
    if (dirtyKeys.length === 0) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyKeys.length]);

  async function load() {
    try {
      const rows = await adminListSettings();
      setList(rows);
      setDrafts(Object.fromEntries(rows.map((r) => [r.key, String(r.value)])));
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Αποθηκεύει μία ρύθμιση χωρίς να αγγίξει τις υπόλοιπες αλλαγές που
  // εκκρεμούν. Επιστρέφει true αν πέτυχε.
  async function saveOne(key) {
    setRowErrors((e) => ({ ...e, [key]: "" }));
    try {
      await adminUpdateSetting(key, drafts[key]);
      setList((rows) => rows.map((r) => (r.key === key ? { ...r, value: Number(drafts[key]) } : r)));
      return true;
    } catch (err) {
      setRowErrors((e) => ({ ...e, [key]: friendlyError(err) }));
      return false;
    }
  }

  async function saveAll() {
    setBusyKey("__all__");
    setSaved("");
    for (const key of dirtyKeys) await saveOne(key);
    setBusyKey(null);
  }

  async function save(key) {
    if (
      key === "otp_enabled" &&
      drafts[key] === "1" &&
      !(await confirm(t("confirmOtp")))
    )
      return;
    setBusyKey(key);
    setSaved("");
    if (await saveOne(key)) setSaved(key);
    setBusyKey(null);
  }

  function renderSetting(s) {
    const meta = SETTING_META[s.key] || {};
    const label = SETTING_META[s.key] ? t(`s_${s.key}_label`) : s.key;
    const dirty = drafts[s.key] !== String(s.value);
    const field =
      meta.kind === "toggle" ? (
        <select
          value={drafts[s.key] ?? ""}
          onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
          style={{ ...inputStyle(dirty), width: 90 }}
        >
          <option value="0">{t("no")}</option>
          <option value="1">{t("yes")}</option>
        </select>
      ) : (
        <input
          type="number"
          value={drafts[s.key] ?? ""}
          onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
          style={{ ...inputStyle(dirty), width: 90 }}
        />
      );
    return (
      <div key={s.key} style={{ borderBottom: `1px solid ${colors.border}`, padding: "14px 16px" }}>
        <RowMain title={label} meta={meta.help ? t(`s_${s.key}_help`) : ""} />
        {meta.warn && <p style={{ color: colors.warn, fontSize: 12.5, margin: "6px 0 0" }}>{t(`s_${s.key}_warn`)}</p>}
        <span style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          {field}
          {meta.unit && <span style={{ ...muted, fontSize: 13 }}>{t(`unit_${meta.unit}`)}</span>}
          {dirty && <span style={{ color: colors.warn, fontSize: 12.5 }}>{t("unsaved")}</span>}
          <button
            style={button(dirty ? "primary" : "secondary")}
            disabled={!dirty || busyKey === s.key}
            onClick={() => save(s.key)}
          >
            {busyKey === s.key ? "…" : t("save")}
          </button>
        </span>
        {rowErrors[s.key] && <p style={{ color: colors.danger, fontSize: 12.5, margin: "8px 0 0" }}>{rowErrors[s.key]}</p>}
        {saved === s.key && !dirty && <p style={{ color: colors.success, fontSize: 12.5, margin: "8px 0 0" }}>{t("saved")}</p>}
      </div>
    );
  }

  return (
    <AdminShell
      ownerOnly
      title={t("title")}
      subtitle={t("subtitle")}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      {list.length === 0 && <Empty>{t("loading")}</Empty>}
      {GROUP_KEYS.map((key) => {
        const g = { key, title: t(`group_${key}_title`), subtitle: key === "reliability" ? t("group_reliability_subtitle") : undefined, collapsed: key === "reliability" };
        const rows = list.filter((s) => (SETTING_META[s.key]?.group || "other") === g.key);
        if (rows.length === 0) return null;
        const body = rows.map((s) => renderSetting(s));
        if (g.key === "credits") body.push(<CreditPreview key="__preview" list={list} />);
        if (g.collapsed) {
          return (
            <details key={g.key} style={{ marginBottom: 14 }}>
              <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: colors.ink, padding: "8px 2px" }}>
                {g.title}
              </summary>
              <Panel title={g.title} subtitle={g.subtitle} padded={false}>
                {body}
              </Panel>
            </details>
          );
        }
        return (
          <Panel key={g.key} title={g.title} subtitle={g.subtitle} padded={false}>
            {body}
          </Panel>
        );
      })}
      {dirtyKeys.length > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 12,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 14px",
            marginTop: 12,
            background: colors.ink,
            color: "#fff",
            borderRadius: 12,
            boxShadow: "0 6px 24px rgba(22,40,60,0.25)",
          }}
        >
          <span style={{ fontSize: 14 }}>
            {t("unsavedChanges", { count: dirtyKeys.length })}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={{ ...button("secondary"), background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
              onClick={() => setDrafts(Object.fromEntries(list.map((r) => [r.key, String(r.value)])))}
            >
              {t("undo")}
            </button>
            <button
              type="button"
              style={{ ...button("primary"), background: "#fff", color: colors.ink, borderColor: "#fff" }}
              disabled={busyKey === "__all__"}
              onClick={saveAll}
            >
              {busyKey === "__all__" ? "…" : t("saveAll")}
            </button>
          </span>
        </div>
      )}
      {confirmDialog}
    </AdminShell>
  );
}
