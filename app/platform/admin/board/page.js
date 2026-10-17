"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useFormat } from "../../useFormat";
import { useLocalData } from "../../useLocalData";
import AdminShell from "../AdminShell";
import { EmptyState, Panel, Empty, colors, muted, money, button } from "../ui";
import { badge, input, label } from "../../../../lib/platform/theme";
import { labelForRole } from "../../../../lib/platform/roles";
import { useConfirm } from "../../components/ConfirmDialog";
import { adminBoardOverview, adminAddBoardExternal, adminRemoveBoardExternal } from "../../../../lib/platform/db";

const TONE = { open: "brand", matched: "success", cancelled: "neutral", expired_unclaimed: "neutral" };

function AddExternal({ requestId, onDone, onError }) {
  const t = useTranslations("AdminBoard");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminAddBoardExternal(requestId, v.name, v.phone, v.note);
      setV({ name: "", phone: "", note: "" });
      setOpen(false);
      onDone(t("added"));
    } catch (err) {
      onError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button type="button" style={{ ...button("secondary"), padding: "6px 12px", fontSize: 13 }} onClick={() => setOpen(true)}>
        {t("addExternal")}
      </button>
    );
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 8 }}>
      <div>
        <label style={label} htmlFor={`ab-n-${requestId}`}>{t("name")}</label>
        <input id={`ab-n-${requestId}`} data-user-text style={input} value={v.name} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div>
        <label style={label} htmlFor={`ab-p-${requestId}`}>{t("phone")}</label>
        <input id={`ab-p-${requestId}`} style={input} value={v.phone} maxLength={40} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      </div>
      <div>
        <label style={label} htmlFor={`ab-t-${requestId}`}>{t("note")}</label>
        <textarea id={`ab-t-${requestId}`} data-user-text style={{ ...input, minHeight: 60 }} maxLength={1000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </div>
      <div>
        <button type="submit" style={button("primary")} disabled={busy || !v.name.trim() || !v.phone.trim()}>
          {busy ? t("adding") : t("add")}
        </button>
      </div>
    </form>
  );
}

export default function AdminBoardPage() {
  const t = useTranslations("AdminBoard");
  const f = useFormat();
  const L = useLocalData();
  const [confirm, confirmDialog] = useConfirm();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await adminBoardOverview());
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(c) {
    if (!(await confirm(t("remove") + "?", { tone: "danger", confirmLabel: t("remove") }))) return;
    try {
      await adminRemoveBoardExternal(c.claim_id);
      setNotice(t("removed"));
      load();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  const uncollected = rows.flatMap((r) => r.claims).reduce((n, c) => n + Number(c.uncollected_fee || 0), 0);

  return (
    <AdminShell title={t("title")}>
      {error && <p role="alert" style={{ color: colors.danger }}>{error}</p>}
      {notice && <p style={{ color: colors.success }}>{notice}</p>}
      {uncollected > 0 && <p style={{ ...muted, fontSize: 13 }}>{t("uncollectedTotal", { count: uncollected })}</p>}
      {busy && <Empty>{t("loading")}</Empty>}
      {!busy && rows.length === 0 && <EmptyState icon="list" tone="neutral">{t("empty")}</EmptyState>}
      {rows.map((r) => (
        <Panel
          key={r.request_id}
          title={`${labelForRole(r.crew_role)} · ${L.text(r.departure_point || "")}`}
          subtitle={`${f.dateRange(r.start_date, r.end_date)} · ${t("client")}: ${L.name(r.client_name)}${r.status === "open" ? ` · ${t("closes", { date: f.dateRange(String(r.closes_at).slice(0, 10), String(r.closes_at).slice(0, 10)) })}` : ""}`}
          action={<span style={badge(TONE[r.status] || "neutral")}>{t(`status.${r.status}`)}</span>}
        >
          {r.claims.length === 0 && <p style={{ ...muted, margin: "0 0 10px" }}>{t("noClaims")}</p>}
          {r.claims.map((c) => (
            <div key={c.claim_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${colors.border}`, fontSize: 14 }}>
              <span>
                <span data-user-text>{L.name(c.name)}</span> · <span style={money}>{c.phone}</span>
                <span style={{ ...muted, marginLeft: 8, fontSize: 12 }}>{c.skipper_id ? t("professional") : t("external")}</span>
                {c.note && <span data-user-text style={{ ...muted, display: "block", fontSize: 12.5 }}>{c.note}</span>}
                {Number(c.uncollected_fee) > 0 && <span style={{ color: colors.warn, display: "block", fontSize: 12.5 }}>{t("uncollected", { count: c.uncollected_fee })}</span>}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={badge(c.status === "chosen" ? "success" : c.status === "active" ? "brand" : "neutral")}>{t(`claimStatus.${c.status}`)}</span>
                {!c.skipper_id && c.status === "active" && (
                  <button type="button" style={{ ...button("secondary"), padding: "4px 10px", fontSize: 12 }} onClick={() => remove(c)}>
                    {t("remove")}
                  </button>
                )}
              </span>
            </div>
          ))}
          {r.status === "open" && (
            <div style={{ marginTop: 10 }}>
              <AddExternal requestId={r.request_id} onDone={(m) => { setNotice(m); load(); }} onError={setError} />
            </div>
          )}
        </Panel>
      ))}
      {confirmDialog}
    </AdminShell>
  );
}
