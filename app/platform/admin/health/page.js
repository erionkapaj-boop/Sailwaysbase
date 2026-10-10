"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "../../../../lib/platform/notifications";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import { Panel, Empty, colors, muted, button } from "../ui";
import { adminHealthIssues, adminResolveHealthIssue, adminRunHealthChecks, adminFlowStats, adminPlaceMisses, adminHealthEvents } from "../../../../lib/platform/db";
import { timeAgo } from "../../../../lib/platform/notifications";

const SOURCE_LABEL = { data: "Δεδομένα", app: "Σφάλμα χρήστη", flow: "Ροή" };
const sourceLabel = (issue) => (issue.fingerprint?.startsWith("app:server:") ? "Διακομιστής" : SOURCE_LABEL[issue.source]);

const mono = { fontFamily: "var(--font-platform-mono), monospace", fontSize: 11.5, color: colors.inkSoft };

// Έκδοση, συσκευή, «προβολή ως» και βήματα (0120): ό,τι χρειάζεται για να
// αναπαραχθεί και να διορθωθεί ένα σφάλμα.
function Context({ ctx, compact = false }) {
  if (!ctx) return null;
  const facts = [ctx.v && `έκδοση ${ctx.v}`, ctx.d, ctx.va && "προβολή ως χρήστης"].filter(Boolean);
  return (
    <div style={{ marginTop: compact ? 4 : 8 }}>
      {facts.length > 0 && <div style={{ ...muted, fontSize: 12.5 }}>{facts.join(" · ")}</div>}
      {ctx.t?.length > 0 && (
        <ol style={{ margin: "6px 0 0", paddingLeft: 20, ...mono, lineHeight: 1.6 }}>
          {ctx.t.map((step, i) => (
            <li key={i} style={{ color: i === ctx.t.length - 1 ? colors.ink : colors.inkSoft }}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function reportText(issue, events) {
  const s = issue.sample || {};
  const lines = [
    `Θέμα: ${issue.title}`,
    `Κωδικός: ${issue.fingerprint}`,
    `Σελίδα: ${issue.area || "—"}`,
    `${issue.occurrences} φορές · ${issue.affected_users || 0} χρήστες · πρώτη ${formatDateTime(issue.first_seen)} · τελευταία ${formatDateTime(issue.last_seen)}`,
  ];
  if (s.detail) lines.push(`Μήνυμα: ${s.detail}`);
  const add = (ctx, label) => {
    if (!ctx) return;
    lines.push(label);
    if (ctx.v || ctx.d || ctx.va) lines.push(`  ${[ctx.v && `έκδοση ${ctx.v}`, ctx.d, ctx.va && "προβολή ως χρήστης"].filter(Boolean).join(" · ")}`);
    (ctx.t || []).forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
  };
  add(s.context, "Τελευταία φορά:");
  (events || []).slice(1).forEach((e, i) => add(e.context, `Προηγούμενη φορά ${i + 1} (${formatDateTime(e.created_at)}${e.detail && e.detail !== s.detail ? ` · ${e.detail}` : ""}):`));
  return lines.join("\n");
}

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
          {[sourceLabel(issue), issue.area, count, users].filter(Boolean).join(" · ")}
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
        {issue.source === "app" && <Context ctx={issue.sample?.context} />}
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
        {issue.source === "app" && <IssueTools issue={issue} />}
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

function IssueTools({ issue }) {
  const [events, setEvents] = useState(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadEvents() {
    try {
      const list = await adminHealthEvents(issue.fingerprint, 5);
      setEvents(list);
      setFailed(false);
      return list;
    } catch {
      setFailed(true);
      return null;
    }
  }

  async function copy() {
    const list = events || (await loadEvents());
    try {
      await navigator.clipboard.writeText(reportText(issue, list));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  const small = { ...button("secondary"), padding: "5px 10px", fontSize: 12.5 };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={small} onClick={copy}>{copied ? "Αντιγράφηκε" : "Αντιγραφή για διόρθωση"}</button>
        {issue.occurrences > 1 && (
          <button
            type="button"
            style={small}
            aria-expanded={open}
            onClick={() => {
              setOpen((v) => !v);
              if (!events) loadEvents();
            }}
          >
            {open ? "Απόκρυψη" : "Προηγούμενες φορές"}
          </button>
        )}
      </div>
      {failed && <div style={{ fontSize: 12.5, color: colors.danger, marginTop: 6 }}>Δεν ήταν δυνατό. Δοκίμασε ξανά.</div>}
      {open && events && (
        <div style={{ marginTop: 8 }}>
          {events.slice(1).map((e, i) => (
            <div key={i} style={{ borderTop: `1px solid ${colors.border}`, padding: "8px 0" }}>
              <div style={{ ...muted, fontSize: 12.5 }}>{formatDateTime(e.created_at)}{e.detail ? ` · ${e.detail}` : ""}</div>
              <Context ctx={e.context} compact />
            </div>
          ))}
          {events.length <= 1 && <div style={{ ...muted, fontSize: 12.5 }}>Χωρίς άλλες καταγραφές με στοιχεία.</div>}
        </div>
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
  const [misses, setMisses] = useState([]);

  const load = useCallback(async () => {
    try {
      const [list, stats, missed] = await Promise.all([
        adminHealthIssues(showClosed),
        adminFlowStats(7),
        adminPlaceMisses(30).catch(() => []),
      ]);
      setIssues(list);
      setFlows(stats);
      setMisses(missed);
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
        title="Μέρη που δεν βρέθηκαν · 30 ημέρες"
        subtitle="Ό,τι έγραψαν πελάτες στο «Από πού ξεκινά το ταξίδι;» και δεν υπήρχε στη λίστα μερών."
        padded={false}
      >
        {!loading && misses.length === 0 && <Empty>Κανένα.</Empty>}
        {misses.map((m) => (
          <div
            key={m.query}
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
              <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink, wordBreak: "break-word" }}>{m.query}</div>
              <div style={{ ...muted, fontSize: 12.5, marginTop: 3 }}>
                {[m.regions, `τελευταία ${timeAgo(m.last_at)}`].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {m.times}×
            </div>
          </div>
        ))}
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
