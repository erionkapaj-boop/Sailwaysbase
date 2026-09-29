"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useCallback, useEffect, useState } from "react";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import { Panel, Empty, colors, muted, button } from "../ui";
import { adminHealthIssues, adminResolveHealthIssue, adminRunHealthChecks, adminFlowStats } from "../../../../lib/platform/db";
import { timeAgo } from "../../../../lib/platform/notifications";

const SOURCE_LABEL = { data: "Δεδομένα", app: "Σφάλμα χρήστη", flow: "Ροή" };

function Issue({ issue, busy, onResolve }) {
  const open = issue.status === "open";
  const count =
    issue.source === "data"
      ? `${issue.occurrences} ${issue.occurrences === 1 ? "περίπτωση" : "περιπτώσεις"}`
      : issue.source === "flow"
        ? `${issue.occurrences} σταμάτησαν`
        : `${issue.occurrences} ${issue.occurrences === 1 ? "φορά" : "φορές"}`;
  const users =
    issue.source !== "flow" && issue.affected_users
      ? `${issue.affected_users} ${issue.affected_users === 1 ? "χρήστης" : "χρήστες"}`
      : null;
  const s = issue.sample || {};
  const detail =
    issue.source === "flow"
      ? `${s.started} ξεκίνησαν, ${s.completed} ολοκλήρωσαν${s.stop_step ? ` · σταματούν: ${s.stop_step}` : ""} (7 ημέρες)`
      : s.detail;
  const ids = Array.isArray(issue.sample?.ids) ? issue.sample.ids : [];

  return (
    <div
      style={{
        borderBottom: `1px solid ${colors.border}`,
        padding: "14px 16px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>{issue.title}</div>
        <div style={{ ...muted, fontSize: 12.5, marginTop: 3 }}>
          {[SOURCE_LABEL[issue.source], issue.area, count, users].filter(Boolean).join(" · ")}
        </div>
        <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>
          {open
            ? `Από ${timeAgo(issue.first_seen)} · τελευταία ${timeAgo(issue.last_seen)}`
            : `Έκλεισε ${timeAgo(issue.resolved_at)}${issue.resolved_by ? "" : " · μόνο του"}`}
          {issue.reopened_count > 0 && ` · ξαναεμφανίστηκε ${issue.reopened_count}×`}
        </div>
        {detail && (
          <div style={{ fontSize: 12.5, color: colors.ink, marginTop: 6, wordBreak: "break-word" }}>{detail}</div>
        )}
        <div
          style={{
            fontFamily: "var(--font-platform-mono), monospace",
            fontSize: 11.5,
            color: colors.inkSoft,
            marginTop: 6,
            wordBreak: "break-all",
            userSelect: "all",
          }}
        >
          {issue.fingerprint}
          {ids.length > 0 && ` · ${ids.map((id) => String(id).slice(0, 8)).join(", ")}`}
        </div>
      </div>
      {open && (
        <button
          type="button"
          style={{ ...button("secondary"), padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
          disabled={busy}
          onClick={() => onResolve(issue.fingerprint)}
        >
          {busy ? "…" : "Λύθηκε"}
        </button>
      )}
    </div>
  );
}

export default function HealthPage() {
  const refreshCounts = useRefreshAdminCounts();
  const [issues, setIssues] = useState([]);
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(null);
  const [flows, setFlows] = useState([]);

  const load = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([adminHealthIssues(showClosed), adminFlowStats(7)]);
      setIssues(list);
      setFlows(stats);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [showClosed]);

  useEffect(() => {
    load();
  }, [load]);

  async function checkNow() {
    setChecking(true);
    setError("");
    try {
      const res = await adminRunHealthChecks();
      setCheckedAt(res?.checked_at || new Date().toISOString());
      await load();
      refreshCounts();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setChecking(false);
    }
  }

  async function resolve(fp) {
    setBusyId(fp);
    setError("");
    try {
      await adminResolveHealthIssue(fp);
      await load();
      refreshCounts();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  const open = issues.filter((i) => i.status === "open");
  const closed = issues.filter((i) => i.status !== "open");

  return (
    <AdminShell
      title="Υγεία εφαρμογής"
      subtitle="Ό,τι εντοπίστηκε αυτόματα: δεδομένα που κόλλησαν και σφάλματα που είδαν χρήστες. Οι έλεγχοι τρέχουν κάθε ώρα."
      ownerOnly
      actions={
        <button type="button" style={button("secondary")} disabled={checking} onClick={checkNow}>
          {checking ? "Έλεγχος…" : "Έλεγχος τώρα"}
        </button>
      }
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
      {checkedAt && !checking && (
        <p style={{ ...muted, fontSize: 12.5, margin: "0 0 12px" }}>Ελέγχθηκε {timeAgo(checkedAt)}.</p>
      )}

      <Panel title={`Ανοιχτά (${open.length})`} padded={false}>
        {loading && <Empty>Φόρτωση…</Empty>}
        {!loading && open.length === 0 && <Empty>Κανένα ανοιχτό θέμα.</Empty>}
        {open.map((i) => (
          <Issue key={i.fingerprint} issue={i} busy={busyId === i.fingerprint} onResolve={resolve} />
        ))}
      </Panel>

      <Panel title="Ροές · 7 ημέρες" subtitle="Πόσοι ξεκίνησαν κάθε διαδρομή και πόσοι έφτασαν στο τέλος." padded={false}>
        {!loading && flows.every((f) => f.started === 0) && <Empty>Καμία κίνηση ακόμα.</Empty>}
        {flows
          .filter((f) => f.started > 0)
          .map((f) => {
            const pct = Math.round((100 * f.completed) / f.started);
            const low = f.started >= 5 && pct < 50;
            return (
              <div
                key={f.flow}
                style={{
                  borderBottom: `1px solid ${colors.border}`,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>{f.flow_label}</div>
                  <div style={{ ...muted, fontSize: 12.5, marginTop: 3 }}>
                    {f.started} ξεκίνησαν · {f.completed} ολοκλήρωσαν
                    {f.stop_step && f.completed < f.started ? ` · σταματούν: ${f.stop_step}` : ""}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: low ? colors.danger : colors.ink,
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                  }}
                >
                  {pct}%
                </div>
              </div>
            );
          })}
      </Panel>

      <Panel
        title={showClosed ? `Κλεισμένα (${closed.length})` : "Κλεισμένα"}
        action={
          <button
            type="button"
            style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}
            onClick={() => setShowClosed((v) => !v)}
          >
            {showClosed ? "Απόκρυψη" : "Εμφάνιση"}
          </button>
        }
        padded={false}
      >
        {showClosed && closed.length === 0 && <Empty>Κανένα.</Empty>}
        {showClosed && closed.map((i) => <Issue key={i.fingerprint} issue={i} />)}
      </Panel>
    </AdminShell>
  );
}
