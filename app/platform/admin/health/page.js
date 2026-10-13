"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../useFormat";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import { Panel, Empty, colors, muted, button } from "../ui";
import { adminHealthIssues, adminResolveHealthIssue, adminRunHealthChecks, adminFlowStats, adminPlaceMisses, adminHealthEvents } from "../../../../lib/platform/db";

const SOURCES = ["data", "app", "flow"];
const sourceLabel = (issue, t) =>
  issue.fingerprint?.startsWith("app:server:") ? t("sourceServer") : SOURCES.includes(issue.source) ? t(`source_${issue.source}`) : undefined;

const mono = { fontFamily: "var(--font-platform-mono), monospace", fontSize: 11.5, color: colors.inkSoft };

// Έκδοση, συσκευή, «προβολή ως» και βήματα (0120): ό,τι χρειάζεται για να
// αναπαραχθεί και να διορθωθεί ένα σφάλμα.
function Context({ ctx, compact = false }) {
  const t = useTranslations("AdminHealth");
  if (!ctx) return null;
  const facts = [ctx.v && t("version", { v: ctx.v }), ctx.d, ctx.va && t("viewAs")].filter(Boolean);
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

function reportText(issue, events, t, f) {
  const s = issue.sample || {};
  const lines = [
    t("reportSubject", { title: issue.title }),
    t("reportCode", { code: issue.fingerprint }),
    t("reportPage", { page: issue.area || "—" }),
    t("reportStats", { occurrences: issue.occurrences, users: issue.affected_users || 0, first: f.dateTime(issue.first_seen), last: f.dateTime(issue.last_seen) }),
  ];
  if (s.detail) lines.push(t("reportMessage", { detail: s.detail }));
  const add = (ctx, label) => {
    if (!ctx) return;
    lines.push(label);
    if (ctx.v || ctx.d || ctx.va) lines.push(`  ${[ctx.v && t("version", { v: ctx.v }), ctx.d, ctx.va && t("viewAs")].filter(Boolean).join(" · ")}`);
    (ctx.t || []).forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
  };
  add(s.context, t("reportLastTime"));
  (events || []).slice(1).forEach((e, i) => add(e.context, t("reportPrevTime", { n: i + 1, when: `${f.dateTime(e.created_at)}${e.detail && e.detail !== s.detail ? ` · ${e.detail}` : ""}` })));
  return lines.join("\n");
}

function Issue({ issue, busy, onResolve }) {
  const t = useTranslations("AdminHealth");
  const f = useFormat();
  const open = issue.status === "open";
  const count =
    issue.source === "data"
      ? t("cases", { count: issue.occurrences })
      : issue.source === "flow"
        ? t("stoppedCount", { count: issue.occurrences })
        : t("times", { count: issue.occurrences });
  const users =
    issue.source !== "flow" && issue.affected_users
      ? t("usersCount", { count: issue.affected_users })
      : null;
  const s = issue.sample || {};
  const detail =
    issue.source === "flow"
      ? t("flowDetail", { started: s.started, completed: s.completed, stop: s.stop_step ? ` · ${t("stopsAt", { step: s.stop_step })}` : "" })
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
          {[sourceLabel(issue, t), issue.area, count, users].filter(Boolean).join(" · ")}
        </div>
        <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>
          {open
            ? t("seenSince", { first: f.timeAgo(issue.first_seen), last: f.timeAgo(issue.last_seen) })
            : `${t("closedAt", { when: f.timeAgo(issue.resolved_at) })}${issue.resolved_by ? "" : ` · ${t("closedAuto")}`}`}
          {issue.reopened_count > 0 && ` · ${t("reopened", { count: issue.reopened_count })}`}
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
          {busy ? "…" : t("resolved")}
        </button>
      )}
    </div>
  );
}

function IssueTools({ issue }) {
  const t = useTranslations("AdminHealth");
  const f = useFormat();
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
      await navigator.clipboard.writeText(reportText(issue, list, t, f));
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
        <button type="button" style={small} onClick={copy}>{copied ? t("copied") : t("copyForFix")}</button>
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
            {open ? t("hide") : t("previousTimes")}
          </button>
        )}
      </div>
      {failed && <div style={{ fontSize: 12.5, color: colors.danger, marginTop: 6 }}>{t("failedRetry")}</div>}
      {open && events && (
        <div style={{ marginTop: 8 }}>
          {events.slice(1).map((e, i) => (
            <div key={i} style={{ borderTop: `1px solid ${colors.border}`, padding: "8px 0" }}>
              <div style={{ ...muted, fontSize: 12.5 }}>{f.dateTime(e.created_at)}{e.detail ? ` · ${e.detail}` : ""}</div>
              <Context ctx={e.context} compact />
            </div>
          ))}
          {events.length <= 1 && <div style={{ ...muted, fontSize: 12.5 }}>{t("noOtherRecords")}</div>}
        </div>
      )}
    </div>
  );
}

export default function HealthPage() {
  const t = useTranslations("AdminHealth");
  const f = useFormat();
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
      title={t("title")}
      subtitle={t("subtitle")}
      ownerOnly
      actions={
        <button type="button" style={button("secondary")} disabled={checking} onClick={checkNow}>
          {checking ? t("checking") : t("checkNow")}
        </button>
      }
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
      {checkedAt && !checking && (
        <p style={{ ...muted, fontSize: 12.5, margin: "0 0 12px" }}>{t("checkedAgo", { ago: f.timeAgo(checkedAt) })}</p>
      )}

      <Panel title={t("openTitle", { count: open.length })} padded={false}>
        {loading && <Empty>{t("loading")}</Empty>}
        {!loading && open.length === 0 && <Empty>{t("openEmpty")}</Empty>}
        {open.map((i) => (
          <Issue key={i.fingerprint} issue={i} busy={busyId === i.fingerprint} onResolve={resolve} />
        ))}
      </Panel>

      <Panel title={t("flowsTitle")} subtitle={t("flowsHint")} padded={false}>
        {!loading && flows.every((fl) => fl.started === 0) && <Empty>{t("flowsEmpty")}</Empty>}
        {flows
          .filter((fl) => fl.started > 0)
          .map((fl) => {
            const pct = Math.round((100 * fl.completed) / fl.started);
            const low = fl.started >= 5 && pct < 50;
            return (
              <div
                key={fl.flow}
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
                  <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>{fl.flow_label}</div>
                  <div style={{ ...muted, fontSize: 12.5, marginTop: 3 }}>
                    {t("flowCounts", { started: fl.started, completed: fl.completed })}
                    {fl.stop_step && fl.completed < fl.started ? ` · ${t("stopsAt", { step: fl.stop_step })}` : ""}
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
        title={t("missesTitle")}
        subtitle={t("missesHint")}
        padded={false}
      >
        {!loading && misses.length === 0 && <Empty>{t("none")}</Empty>}
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
                {[m.regions, t("lastAgo", { ago: f.timeAgo(m.last_at) })].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {m.times}×
            </div>
          </div>
        ))}
      </Panel>

      <Panel
        title={showClosed ? t("closedTitleCount", { count: closed.length }) : t("closedTitle")}
        action={
          <button
            type="button"
            style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}
            onClick={() => setShowClosed((v) => !v)}
          >
            {showClosed ? t("hide") : t("show")}
          </button>
        }
        padded={false}
      >
        {showClosed && closed.length === 0 && <Empty>{t("none")}</Empty>}
        {showClosed && closed.map((i) => <Issue key={i.fingerprint} issue={i} />)}
      </Panel>
    </AdminShell>
  );
}
