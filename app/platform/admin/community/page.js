"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "../../AuthContext";
import { useFormat } from "../../useFormat";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import { Panel, Empty, colors, muted, button } from "../ui";
import { badge, input, label, select, radius } from "../../../../lib/platform/theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { COMMUNITY_CATEGORIES } from "../../../../lib/platform/community";
import {
  adminCommunityReports, adminCommunityGroups, adminCommunityRestrictions, adminCommunitySettings, adminCommunityResolveReport,
  adminCommunityRestrict, adminCommunityLiftRestriction, adminCommunitySetGroupStatus, adminCommunitySetCategory,
  communityRemovePoint, communityDeleteMessage,
} from "../../../../lib/platform/db";

// Διαχείριση της Community (εντολή ιδιοκτήτη 17/10/2026): αναφορές σημείων και μηνυμάτων με το περιεχόμενο, τον αναφέροντα και
// τον συντάκτη· ενέργειες διαγραφή περιεχομένου, προσωρινός περιορισμός μέλους, κλείσιμο ομάδας, απόρριψη αναφοράς· οι ομάδες,
// οι ενεργοί περιορισμοί και οι διάρκειες εμφάνισης/αρχειοθέτησης ανά κατηγορία. Καμία αυτόματη απόκρυψη: αποφασίζει άνθρωπος.

const RESTRICT_REASONS = ["rules", "offers", "abuse", "other"];
const RESTRICT_DAYS = [1, 7, 30];
const segWrap = { display: "inline-flex", padding: 3, background: colors.seaGlass, borderRadius: radius.lg, gap: 2, marginBottom: 16, flexWrap: "wrap" };
const seg = (on) => ({
  minHeight: 40, padding: "0 16px", border: "none", borderRadius: radius.md, fontSize: 14, fontFamily: "inherit", cursor: "pointer",
  fontWeight: on ? 600 : 400, color: colors.ink, background: on ? colors.card : "transparent", boxShadow: on ? "0 1px 3px rgba(22,40,60,0.10)" : "none",
});
const small = { ...button("secondary"), padding: "6px 12px", fontSize: 13 };

function RestrictForm({ onApply, onCancel }) {
  const t = useTranslations("AdminCommunity");
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("rules");
  const [busy, setBusy] = useState(false);
  return (
    <div data-restrict-form style={{ display: "grid", gap: 10, marginTop: 10, padding: 12, background: colors.seaGlass, borderRadius: radius.md }}>
      <div>
        <span style={label}>{t("restrictDuration")}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RESTRICT_DAYS.map((d) => (
            <button key={d} type="button" data-restrict-days={d} aria-pressed={days === d} onClick={() => setDays(d)} style={{ ...small, ...(days === d ? { background: colors.ink, color: "#fff", borderColor: colors.ink } : {}) }}>
              {t("days", { count: d })}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={label} htmlFor="rs-reason">{t("restrictReason")}</label>
        <select id="rs-reason" data-restrict-reason value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...select, maxWidth: 280 }}>
          {RESTRICT_REASONS.map((r) => <option key={r} value={r}>{t(`restrictReason_${r}`)}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" data-restrict-apply disabled={busy} style={{ ...small, background: colors.ink, color: "#fff", borderColor: colors.ink }} onClick={async () => { setBusy(true); await onApply(days, reason); setBusy(false); }}>{t("apply")}</button>
        <button type="button" style={small} onClick={onCancel}>{t("cancel")}</button>
      </div>
    </div>
  );
}

function ReportCard({ r, isOwnerOrStaff, onAct, onError }) {
  const t = useTranslations("AdminCommunity");
  const tc = useTranslations("Community");
  const f = useFormat();
  const [confirm, confirmDialog] = useConfirm();
  const [restricting, setRestricting] = useState(false);
  const open = r.status === "open";
  const isPoint = r.target_type === "point";
  const groupName = f.locale === "en" ? r.group_name_en : r.group_name;
  const title = isPoint ? `${tc(`cat_${r.target_category}`)} · ${r.target_title}` : `${groupName || ""} · ${t("typeMessage")}`;

  async function run(fn, done) {
    try {
      await fn();
      onAct(done);
    } catch (e) {
      onError(friendlyError(e));
    }
  }
  async function removeContent() {
    if (!(await confirm(t(isPoint ? "removePointConfirm" : "removeMessageConfirm"), { confirmLabel: t("removeContent") }))) return;
    run(() => (isPoint ? communityRemovePoint(r.point_id, r.reason) : communityDeleteMessage(r.message_id, r.reason)), t("doneRemoved"));
  }
  async function toggleGroup() {
    const close = r.group_status === "open";
    if (!(await confirm(t(close ? "closeGroupConfirm" : "reopenGroupConfirm"), { tone: close ? "danger" : "primary", confirmLabel: t(close ? "closeGroup" : "reopenGroup") }))) return;
    run(() => adminCommunitySetGroupStatus(r.group_id, close, r.reason), t(close ? "doneClosed" : "doneReopened"));
  }

  return (
    <Panel
      title={<span data-user-text>{title}</span>}
      subtitle={`${tc(`reason_${r.reason}`)} · ${t("reportedBy", { name: r.reporter_name || "—" })} · ${f.dateTime(r.created_at)}`}
      action={<span style={badge(open ? "warn" : r.status === "resolved" ? "success" : "neutral")}>{t(`status_${r.status}`)}</span>}
    >
      <div data-report={r.id} data-report-type={r.target_type}>
        <blockquote data-user-text data-report-content style={{ margin: "0 0 10px", padding: "8px 12px", borderLeft: `3px solid ${colors.border}`, fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-line", overflowWrap: "anywhere", color: r.target_removed ? colors.inkSoft : colors.ink }}>
          {isPoint && r.target_body ? r.target_body : isPoint ? "—" : r.target_body}
        </blockquote>
        {r.target_removed && <p style={{ margin: "0 0 8px" }}><span style={badge("neutral")}>{t("removed")}</span></p>}
        {r.note && <p data-user-text style={{ ...muted, fontSize: 13.5, margin: "0 0 8px" }}>{t("reporterNote")}: {r.note}</p>}
        <p style={{ fontSize: 13.5, margin: "0 0 10px", color: colors.ink }}>
          {t("author")}: <b data-user-text style={{ fontWeight: 600 }}>{r.target_author_name || "—"}</b>
          {r.author_restricted_until && <span style={{ ...badge("danger"), marginLeft: 8 }}>{t("restrictedUntil", { date: f.date(String(r.author_restricted_until).slice(0, 10)) })}</span>}
        </p>
        {open && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!r.target_removed && <button type="button" data-act="remove" style={{ ...small, color: colors.danger }} onClick={removeContent}>{t("removeContent")}</button>}
            {isOwnerOrStaff && r.target_author_id && !r.author_restricted_until && <button type="button" data-act="restrict" style={small} onClick={() => setRestricting((v) => !v)}>{t("restrictMember")}</button>}
            {!isPoint && r.group_id && <button type="button" data-act="group" style={small} onClick={toggleGroup}>{t(r.group_status === "open" ? "closeGroup" : "reopenGroup")}</button>}
            <button type="button" data-act="dismiss" style={small} onClick={() => run(() => adminCommunityResolveReport(r.id, true), t("doneDismissed"))}>{t("dismiss")}</button>
          </div>
        )}
        {open && restricting && (
          <RestrictForm
            onCancel={() => setRestricting(false)}
            onApply={(days, reason) => run(() => adminCommunityRestrict(r.target_author_id, days, reason), t("doneRestricted"))}
          />
        )}
      </div>
      {confirmDialog}
    </Panel>
  );
}

function Settings({ rows, owner, onSaved, onError }) {
  const t = useTranslations("AdminCommunity");
  const tc = useTranslations("Community");
  const [vals, setVals] = useState({});
  useEffect(() => {
    setVals(Object.fromEntries(rows.map((r) => [r.category, { show: String(r.show_days), archive: String(r.archive_days) }])));
  }, [rows]);
  const order = COMMUNITY_CATEGORIES.map((c) => c.key);
  const sorted = [...rows].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  async function save(r) {
    const v = vals[r.category];
    try {
      await adminCommunitySetCategory(r.category, Number(v.show), Number(v.archive));
      onSaved(t("saved"));
    } catch (e) {
      onError(friendlyError(e));
    }
  }
  return (
    <Panel title={t("settingsTitle")} subtitle={owner ? t("settingsIntro") : t("settingsOwnerOnly")}>
      <div data-community-settings style={{ display: "grid", gap: 12 }}>
        {sorted.map((r) => {
          const v = vals[r.category] || { show: "", archive: "" };
          const dirty = Number(v.show) !== r.show_days || Number(v.archive) !== r.archive_days;
          return (
            <div key={r.category} data-setting={r.category} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1.4fr) 1fr 1fr auto", gap: 10, alignItems: "end" }} className="cm-setting-row">
              <div style={{ fontSize: 14.5, fontWeight: 600, color: colors.ink, alignSelf: "center" }}>{tc(`cat_${r.category}`)}</div>
              <div>
                <label style={label} htmlFor={`cs-s-${r.category}`}>{t("showDays")}</label>
                <input id={`cs-s-${r.category}`} data-setting-show type="number" min={1} max={3650} disabled={!owner} value={v.show} onChange={(e) => setVals({ ...vals, [r.category]: { ...v, show: e.target.value } })} style={input} />
              </div>
              <div>
                <label style={label} htmlFor={`cs-a-${r.category}`}>{t("archiveDays")}</label>
                <input id={`cs-a-${r.category}`} data-setting-archive type="number" min={1} max={3650} disabled={!owner} value={v.archive} onChange={(e) => setVals({ ...vals, [r.category]: { ...v, archive: e.target.value } })} style={input} />
              </div>
              {owner ? <button type="button" data-setting-save disabled={!dirty} style={{ ...small, minHeight: 44, opacity: dirty ? 1 : 0.5 }} onClick={() => save(r)}>{t("save")}</button> : <span />}
            </div>
          );
        })}
      </div>
      <style dangerouslySetInnerHTML={{ __html: "@media (max-width: 640px) { .cm-setting-row { grid-template-columns: 1fr 1fr !important; } .cm-setting-row > :first-child { grid-column: 1 / -1; } }" }} />
    </Panel>
  );
}

export default function AdminCommunityPage() {
  const t = useTranslations("AdminCommunity");
  const f = useFormat();
  const { isOwner } = useAuth();
  const refreshCounts = useRefreshAdminCounts();
  const [tab, setTab] = useState("reports");
  const [filter, setFilter] = useState("open");
  const [reports, setReports] = useState(null);
  const [groups, setGroups] = useState(null);
  const [restrictions, setRestrictions] = useState(null);
  const [settings, setSettings] = useState([]);
  const [confirm, confirmDialog] = useConfirm();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, g, rs, st] = await Promise.all([adminCommunityReports(filter), adminCommunityGroups(), adminCommunityRestrictions(), adminCommunitySettings()]);
      setReports(r || []);
      setGroups(g || []);
      setRestrictions(rs || []);
      setSettings(st || []);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const acted = (msg) => { setError(""); setNotice(msg); load(); refreshCounts(); };
  const fail = (msg) => { setNotice(""); setError(msg); };

  async function toggleGroup(g) {
    const close = g.status === "open";
    if (!(await confirm(t(close ? "closeGroupConfirm" : "reopenGroupConfirm"), { tone: close ? "danger" : "primary", confirmLabel: t(close ? "closeGroup" : "reopenGroup") }))) return;
    try {
      await adminCommunitySetGroupStatus(g.id, close, null);
      acted(t(close ? "doneClosed" : "doneReopened"));
    } catch (e) {
      fail(friendlyError(e));
    }
  }
  async function lift(r) {
    try {
      await adminCommunityLiftRestriction(r.user_id);
      acted(t("doneLifted"));
    } catch (e) {
      fail(friendlyError(e));
    }
  }

  return (
    <AdminShell title={t("title")} subtitle={t("subtitle")}>
      {error && <p role="alert" style={{ color: colors.danger }}>{error}</p>}
      {notice && <p role="status" style={{ color: colors.success }}>{notice}</p>}
      <div role="tablist" style={segWrap}>
        {[["reports", "tabReports"], ["groups", "tabGroups"], ["restrictions", "tabRestrictions"], ["settings", "tabSettings"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-admin-community-tab={k} style={seg(tab === k)} onClick={() => setTab(k)}>{t(l)}</button>
        ))}
      </div>

      {tab === "reports" && (
        <>
          <div style={{ marginBottom: 14 }}>
            <select aria-label={t("tabReports")} data-report-filter value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...select, width: "auto", minWidth: 180 }}>
              <option value="open">{t("filterOpen")}</option>
              <option value="closed">{t("filterClosed")}</option>
            </select>
          </div>
          {!reports ? <Empty>{t("loading")}</Empty> : reports.length === 0 ? <Empty>{t(filter === "open" ? "emptyOpen" : "emptyClosed")}</Empty> : reports.map((r) => <ReportCard key={r.id} r={r} isOwnerOrStaff onAct={acted} onError={fail} />)}
        </>
      )}

      {tab === "groups" && (
        <Panel title={t("tabGroups")} subtitle={t("groupsIntro")}>
          {!groups ? <Empty>{t("loading")}</Empty> : groups.map((g) => (
            <div key={g.id} data-admin-group={g.slug} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0", borderTop: `1px solid ${colors.border}` }}>
              <div>
                <b style={{ fontWeight: 600, fontSize: 15 }}>{f.locale === "en" ? g.name_en : g.name}</b>
                <span style={{ ...muted, display: "block", fontSize: 13 }}>
                  {t("groupStats", { members: g.member_count, messages: g.message_count, reports: g.open_reports })}
                </span>
              </div>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={badge(g.status === "open" ? "success" : "danger")}>{t(g.status === "open" ? "groupOpen" : "groupClosed")}</span>
                <button type="button" data-admin-group-toggle={g.slug} style={small} onClick={() => toggleGroup(g)}>{t(g.status === "open" ? "closeGroup" : "reopenGroup")}</button>
              </span>
            </div>
          ))}
        </Panel>
      )}

      {tab === "restrictions" && (
        <Panel title={t("tabRestrictions")} subtitle={t("restrictionsIntro")}>
          {!restrictions ? <Empty>{t("loading")}</Empty> : restrictions.length === 0 ? <Empty>{t("emptyRestrictions")}</Empty> : restrictions.map((r) => (
            <div key={r.user_id} data-restriction={r.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0", borderTop: `1px solid ${colors.border}` }}>
              <div>
                <b data-user-text style={{ fontWeight: 600, fontSize: 15 }}>{r.user_name}</b>
                <span style={{ ...muted, display: "block", fontSize: 13 }}>{t(`restrictReason_${r.reason}`)} · {t("restrictedUntil", { date: f.date(String(r.until).slice(0, 10)) })}</span>
              </div>
              <button type="button" data-lift style={small} onClick={() => lift(r)}>{t("lift")}</button>
            </div>
          ))}
        </Panel>
      )}

      {tab === "settings" && <Settings rows={settings} owner={isOwner} onSaved={acted} onError={fail} />}
      {confirmDialog}
    </AdminShell>
  );
}
