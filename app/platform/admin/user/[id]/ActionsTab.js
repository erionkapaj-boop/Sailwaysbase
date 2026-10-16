"use client";
import { useAuth } from "../../../AuthContext";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../../useFormat";
import { useLocalData } from "../../../useLocalData";
import { Panel, ProCredentials, colors, muted, button } from "../../ui";
import { badge } from "../../../../../lib/platform/theme";
import { labelForRole } from "../../../../../lib/platform/roles";
import {
  adminVerifyUser,
  adminApproveSkipper,
  adminRejectSkipper,
  adminSuspendAccount,
  adminReactivateAccount,
  adminDeleteAccount,
  adminRestoreAccount,
  adminSetTestAccount,
  adminSetStaffAdmin,
  adminSetRequestLimit,
} from "../../../../../lib/platform/db";
import { Hint, fieldInput, useErrorLabel } from "./shared";

// Ό,τι αλλάζει την κατάσταση του λογαριασμού — ξεχωριστά από τα «Στοιχεία &
// πρόσβαση», που μόνο διορθώνουν. Οι επικίνδυνες ενέργειες περνούν πάντα από
// confirm(), και ό,τι χρειάζεται λόγο τον ζητά πριν προχωρήσει.
export default function ActionsTab({ data, id, reload, confirm, viewerId }) {
  const t = useTranslations("AdminUser");
  const f = useFormat();
  const L = useLocalData();
  const errorLabel = useErrorLabel();
  const personName = (p) => L.person(p);
  const { isOwner } = useAuth();
  const u = data.user;
  const sp = data.skipper_profile;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [rejectNote, setRejectNote] = useState("");
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const curLimit = u.request_limit ?? null;
  const [limitMode, setLimitMode] = useState(curLimit === null ? "default" : curLimit === -1 ? "unlimited" : "custom");
  const [limitValue, setLimitValue] = useState(curLimit !== null && curLimit > 0 ? String(curLimit) : "10");

  const name = personName(u) || u.phone_number;

  async function run(fn, successMsg) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fn();
      await reload();
      if (successMsg) setNotice(successMsg);
      return res;
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    await run(() => adminVerifyUser(id), t("actions.verified"));
  }

  async function handleApprove() {
    await run(() => adminApproveSkipper(id), t("actions.approved"));
  }

  async function handleReject(isRevoke) {
    const msg = isRevoke ? t("actions.confirmRevoke", { name }) : t("actions.confirmReject", { name });
    if (!(await confirm(msg))) return;
    await run(async () => {
      await adminRejectSkipper(id, rejectNote.trim() || null);
      setRejectNote("");
    }, isRevoke ? t("actions.revoked") : t("actions.rejected"));
  }

  async function handleSuspend(e) {
    e.preventDefault();
    if (!suspendReason.trim()) {
      setError(t("actions.reasonRequired"));
      return;
    }
    await run(async () => {
      await adminSuspendAccount(id, suspendReason);
      setSuspendReason("");
      setShowSuspendForm(false);
    });
  }

  async function handleReactivate() {
    await run(() => adminReactivateAccount(id));
  }

  function deletionImpact() {
    const today = new Date().toISOString().slice(0, 10);
    const openReqs = (data.requests || []).filter((r) => r.status === "open").length;
    const pendingPings = (data.pings || []).filter((p) => p.status === "pending").length;
    const upcoming = [...(data.bookings_client || []), ...(data.bookings_pro || [])].filter(
      (b) => b.status === "confirmed" && b.end_date >= today
    ).length;
    const lines = [];
    if (openReqs > 0) lines.push({ text: t("actions.impactOpen", { count: openReqs }) });
    if (pendingPings > 0) lines.push({ text: t("actions.impactPings", { count: pendingPings }) });
    if (upcoming > 0) lines.push({ text: t("actions.impactUpcoming", { count: upcoming }), warn: true });
    return lines;
  }

  async function handleDelete() {
    const impact = deletionImpact();
    const ok = await confirm(
      t("actions.confirmDelete", { name }) + (impact.length ? `\n\n${impact.map((l) => l.text).join("\n")}` : "")
    );
    if (!ok) return;
    const res = await run(() => adminDeleteAccount(id, deleteReason.trim() || null));
    if (res) {
      setDeleteReason("");
      setNotice(
        [
          t("actions.deleted"),
          res.cancelled_requests > 0
            ? res.refunded > 0
              ? t("actions.cancelledRefunded", { count: res.cancelled_requests, refunded: res.refunded })
              : t("actions.cancelledRequests", { count: res.cancelled_requests })
            : null,
          t("actions.restoreHint"),
        ]
          .filter(Boolean)
          .join(" ")
      );
    }
  }

  async function handleRestore() {
    if (!(await confirm(t("actions.confirmRestore", { name }), { tone: "primary" }))) return;
    await run(() => adminRestoreAccount(id), t("actions.restored"));
  }

  async function handleToggleTestAccount() {
    if (
      !u.is_test_account &&
      !(await confirm(t("actions.confirmTest", { name })))
    )
      return;
    await run(() => adminSetTestAccount(id, !u.is_test_account));
  }

  async function handleSaveLimit() {
    const n = Number(limitValue);
    if (limitMode === "custom" && !(Number.isInteger(n) && n >= 1)) {
      setError(t("actions.limitInvalid"));
      return;
    }
    const value = limitMode === "default" ? null : limitMode === "unlimited" ? -1 : n;
    await run(() => adminSetRequestLimit(id, value), t("actions.limitSaved"));
  }

  async function handleToggleStaffAdmin() {
    const ok = await confirm(
      u.is_staff_admin
        ? t("actions.confirmStaffRemove", { name })
        : t("actions.confirmStaffGrant", { name })
    );
    if (!ok) return;
    await run(() => adminSetStaffAdmin(id, !u.is_staff_admin));
  }

  return (
    <>
      {error && <p style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>{error}</p>}
      {notice && <p style={{ color: colors.success, fontSize: 13, marginBottom: 10 }}>{notice}</p>}

      {!u.phone_verified_at && u.role !== "admin" && u.status !== "deleted" && (
        <Panel title={t("actions.verifyTitle")}>
          <Hint>{t("verifyHint")}</Hint>
          <button style={button("primary")} disabled={busy} onClick={handleVerify}>
            {busy ? "…" : t("actions.verify")}
          </button>
        </Panel>
      )}

      {sp && (sp.approval_status === "pending" || sp.approval_status === "rejected") && (
        <Panel title={sp.approval_status === "pending" ? t("actions.approvalTitle") : t("actions.rejectedTitle")}>
          <Hint>{t("actions.approvalHint")}</Hint>
          <ProCredentials profile={sp} roleLabel={labelForRole(sp.role)} />
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button style={button("primary")} disabled={busy} onClick={handleApprove}>
              {busy ? "…" : t("actions.approve")}
            </button>
            {sp.approval_status === "pending" && (
              <button style={button("secondary")} disabled={busy} onClick={() => handleReject(false)}>
                {busy ? "…" : t("actions.reject")}
              </button>
            )}
          </div>
          {sp.approval_status === "pending" && (
            <input
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder={t("actions.rejectPlaceholder")}
              style={{ ...fieldInput, marginTop: 10 }}
            />
          )}
        </Panel>
      )}

      {sp && sp.approval_status === "approved" && (
        <Panel title={t("actions.approvalTitle")}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span style={badge("success")}>{t("actions.approvedBadge")}</span>
            <button style={button("secondary")} disabled={busy} onClick={() => handleReject(true)}>
              {busy ? "…" : t("actions.revoke")}
            </button>
          </div>
        </Panel>
      )}

      {u.status === "deleted" ? (
        <Panel title={t("actions.deletedTitle")}>
          <Hint user={Boolean(u.deletion_reason)}>
            {u.deleted_at && <>{t("actions.deletedAt", { date: f.dateTime(u.deleted_at) })}<br /></>}
            {u.deletion_reason && <>{t("actions.reasonLine", { reason: u.deletion_reason })}<br /></>}
            {t("actions.deletedHint")}
          </Hint>
          {isOwner && (
            <button style={button("primary")} disabled={busy} onClick={handleRestore}>
              {busy ? "…" : t("actions.restoreAccount")}
            </button>
          )}
        </Panel>
      ) : (
        <>
          {u.status === "suspended" ? (
            <Panel title={t("actions.suspendedTitle")}>
              <Hint user={Boolean(u.suspension_reason)}>{u.suspension_reason || t("actions.noReason")}</Hint>
              <button style={button("primary")} disabled={busy} onClick={handleReactivate}>
                {busy ? "…" : t("actions.reactivate")}
              </button>
            </Panel>
          ) : (
            u.role !== "admin" &&
            !u.is_owner &&
            !u.is_staff_admin && (
              <Panel title={t("actions.suspendTitle")}>
                <Hint>
                  {t("actions.suspendHint")}
                </Hint>
                {showSuspendForm ? (
                  <form onSubmit={handleSuspend}>
                    <textarea
                      required
                      rows={2}
                      placeholder={t("actions.suspendPlaceholder")}
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      style={{ ...fieldInput, marginBottom: 8, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="submit" style={button("primary")} disabled={busy}>
                        {busy ? "…" : t("actions.confirmSuspend")}
                      </button>
                      <button
                        type="button"
                        style={button("secondary")}
                        onClick={() => {
                          setShowSuspendForm(false);
                          setSuspendReason("");
                          setError("");
                        }}
                      >
                        {t("actions.cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button style={button("secondary")} onClick={() => setShowSuspendForm(true)}>
                    {t("actions.suspend")}
                  </button>
                )}
              </Panel>
            )
          )}

          {isOwner && u.role !== "admin" && !u.is_owner && u.id !== viewerId && (
            <Panel title={t("actions.deleteTitle")}>
              <Hint>
                {t("actions.deleteHint")}
              </Hint>
              {deletionImpact().some((l) => l.warn) && (
                <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 10px" }}>
                  {deletionImpact().find((l) => l.warn).text}
                </p>
              )}
              <input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={t("actions.deleteReason")}
                style={{ ...fieldInput, marginBottom: 10 }}
              />
              <button style={{ ...button("primary"), background: colors.danger, borderColor: colors.danger }} disabled={busy} onClick={handleDelete}>
                {busy ? "…" : t("actions.deleteTitle")}
              </button>
            </Panel>
          )}
        </>
      )}

      {u.status !== "deleted" && u.role !== "admin" && !u.is_owner && !u.is_staff_admin && (
        <Panel title={t("actions.limitTitle")} subtitle={t("actions.limitSubtitle")}>
          <div data-request-limit style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select aria-label={t("actions.limitTitle")} style={{ ...fieldInput, width: "auto" }} value={limitMode} disabled={busy} onChange={(e) => setLimitMode(e.target.value)}>
              <option value="default">{t("actions.limitDefault")}</option>
              <option value="unlimited">{t("actions.limitUnlimited")}</option>
              <option value="custom">{t("actions.limitCustom")}</option>
            </select>
            {limitMode === "custom" && (
              <input type="number" min="1" aria-label={t("actions.limitCustom")} style={{ ...fieldInput, width: 90 }} value={limitValue} disabled={busy} onChange={(e) => setLimitValue(e.target.value)} />
            )}
            <button style={button("primary")} disabled={busy} onClick={handleSaveLimit}>{busy ? "…" : t("actions.limitSave")}</button>
          </div>
        </Panel>
      )}

      {isOwner && u.status !== "deleted" && !u.is_owner && (
        <Panel title={t("actions.advanced")} subtitle={t("actions.advancedSubtitle")}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(u.is_test_account)}
              disabled={busy || u.role === "admin"}
              onChange={handleToggleTestAccount}
              style={{ marginTop: 3 }}
            />
            <span>
              {t("actions.testAccount")}
              <span style={{ ...muted, display: "block", fontSize: 12.5 }}>{t("actions.testHint")}</span>
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, cursor: "pointer", marginTop: 12 }}>
            <input
              type="checkbox"
              checked={Boolean(u.is_staff_admin)}
              disabled={busy || u.role === "admin"}
              onChange={handleToggleStaffAdmin}
              style={{ marginTop: 3 }}
            />
            <span>
              {t("actions.staffAdmin")}
              <span style={{ ...muted, display: "block", fontSize: 12.5 }}>
                {t("actions.staffHint")}
              </span>
            </span>
          </label>
        </Panel>
      )}
    </>
  );
}
