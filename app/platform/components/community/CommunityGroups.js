"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "../../AuthContext";
import { useFeedback } from "../FeedbackProvider";
import { useConfirm } from "../ConfirmDialog";
import { useFormat } from "../../useFormat";
import Icon from "../Icon";
import LoadError from "../LoadError";
import ReportSheet from "./ReportSheet";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { GROUP_ICON, MESSAGE_MAX, MESSAGE_REPORT_REASONS, ageLabel, buildThreads } from "../../../../lib/platform/community";
import {
  communityListGroups, communityJoinGroup, communityLeaveGroup, communityListMessages, communityPostMessage,
  communityDeleteMessage, communityReportMessage,
} from "../../../../lib/platform/db";
import { colors, radius, muted, button, input, card } from "../../../../lib/platform/theme";

// Ομάδες περιοχών της Community: λίστα με συμμετοχή/αποχώρηση με ένα πάτημα (σε όσες ομάδες θέλει το μέλος) και
// απλή ροή συζήτησης ανά ομάδα: μηνύματα με απαντήσεις, αποστολέας και χρόνος, «Αναφορά» σε κάθε μήνυμα.
// Ο σκοπός και η πρόσβαση της διαχείρισης φαίνονται πάντα (RulesNote).

const POLL_MS = 30000;

function RulesNote({ compact = false }) {
  const t = useTranslations("Community");
  return (
    <div data-community-rules style={{ ...card, padding: compact ? "12px 14px" : "16px 18px", marginBottom: 16, borderLeft: `3px solid ${colors.accent}` }}>
      {!compact && <b style={{ display: "block", fontWeight: 600, fontSize: 15.5, marginBottom: 6, color: colors.ink }}>{t("rulesTitle")}</b>}
      <p style={{ margin: 0, fontSize: compact ? 13.5 : 14.5, lineHeight: 1.55, color: colors.ink }}>{t(compact ? "rulesShort" : "rulesPurpose")}</p>
      {!compact && <p style={{ margin: "6px 0 0", fontSize: 14.5, lineHeight: 1.55, color: colors.ink }}>{t("rulesNot")}</p>}
      <p style={{ display: "flex", alignItems: "center", gap: 7, margin: compact ? "6px 0 0" : "10px 0 0", fontSize: 13, color: colors.inkSoft }}>
        <Icon name="shield" size={16} />
        {t("rulesAdmin")}
      </p>
    </div>
  );
}

export default function CommunityGroups({ access }) {
  const t = useTranslations("Community");
  const locale = useLocale();
  const f = useFormat();
  const fb = useFeedback();
  const canWrite = Boolean(access?.can_write);
  const [groups, setGroups] = useState(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setGroups((await communityListGroups()) || []);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nameOf = (g) => (locale === "en" ? g.name_en : g.name);

  async function toggle(g) {
    setBusyId(g.id);
    try {
      if (g.is_member) await communityLeaveGroup(g.id);
      else await communityJoinGroup(g.id);
      await load();
      fb.done(t(g.is_member ? "leftToast" : "joinedToast", { name: nameOf(g) }));
    } catch (e) {
      fb.fail(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  const group = useMemo(() => (groups || []).find((g) => g.id === openId) || null, [groups, openId]);

  if (failed) return <LoadError what={t("loadWhat")} onRetry={load} />;
  if (!groups) return null;

  if (group) {
    return <GroupThread group={group} name={nameOf(group)} access={access} busy={busyId === group.id} onToggle={() => toggle(group)} onBack={() => setOpenId(null)} />;
  }

  return (
    <div data-community-groups style={{ maxWidth: 720 }}>
      <RulesNote />
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {groups.map((g) => (
          <li key={g.id} style={{ ...card, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              data-group-open={g.slug}
              onClick={() => setOpenId(g.id)}
              style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 14, padding: "14px 8px 14px 16px", background: "none", border: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: colors.ink }}
            >
              <span style={{ width: 44, height: 44, borderRadius: 999, background: colors.seaGlass, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={GROUP_ICON[g.slug] || "users"} size={22} stroke={1.6} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 16.5, fontWeight: 600 }}>{nameOf(g)}</span>
                <span data-group-members style={{ display: "block", ...muted, fontSize: 13.5 }}>
                  {t("members", { count: g.member_count })}
                  {g.status === "closed" ? ` · ${t("closed")}` : ""}
                </span>
                <span style={{ display: "block", ...muted, fontSize: 12.5, marginTop: 2 }}>
                  {g.last_message_at ? t("lastMessage", { age: ageLabel(g.last_message_at, f.locale) }) : t("noMessages")}
                </span>
              </span>
            </button>
            {canWrite && (g.status === "open" || g.is_member) && (
              <button
                type="button"
                data-group-toggle={g.slug}
                aria-pressed={g.is_member}
                disabled={busyId === g.id}
                onClick={() => toggle(g)}
                style={{ ...button(g.is_member ? "secondary" : "primary"), minHeight: 44, padding: "0 16px", marginRight: 14, flexShrink: 0, opacity: busyId === g.id ? 0.6 : 1 }}
              >
                {g.is_member ? t("leave") : t("join")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupThread({ group, name, access, busy, onToggle, onBack }) {
  const t = useTranslations("Community");
  const f = useFormat();
  const fb = useFeedback();
  const { session } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const myId = session?.user?.id || null;
  const moderator = Boolean(access?.moderator);
  const canWrite = Boolean(access?.can_write);
  const canPost = canWrite && group.is_member && group.status === "open";

  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [reporting, setReporting] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = (await communityListMessages(group.id, { limit: 200 })) || [];
      setRows((prev) => {
        // Τα παλαιότερα που έχουν ήδη φορτωθεί με «Παλαιότερα» μένουν.
        const fresh = new Set(list.map((r) => r.id));
        const keep = (prev || []).filter((r) => !fresh.has(r.id) && new Date(r.created_at) < new Date(list[list.length - 1]?.created_at || 0));
        return [...list, ...keep];
      });
      setMore(list.length >= 200);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [group.id]);

  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function older() {
    const last = rows?.[rows.length - 1];
    if (!last) return;
    try {
      const list = (await communityListMessages(group.id, { before: last.created_at, limit: 200 })) || [];
      setRows((prev) => [...prev, ...list.filter((r) => !prev.some((p) => p.id === r.id))]);
      setMore(list.length >= 200);
    } catch (e) {
      fb.fail(friendlyError(e));
    }
  }

  async function post(body, parentId = null) {
    setSending(true);
    setError("");
    try {
      await communityPostMessage(group.id, body.trim(), parentId);
      if (parentId) { setReplyTo(null); setReplyText(""); } else setText("");
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function remove(m) {
    if (!(await confirm(t("msgDeleteConfirm"), { confirmLabel: t("delete") }))) return;
    try {
      await communityDeleteMessage(m.id);
      await load();
      fb.done(t("msgDeleted"));
    } catch (e) {
      fb.fail(friendlyError(e));
    }
  }

  async function report(m, reason, note) {
    const id = await communityReportMessage(m.id, reason, note);
    setReporting(null);
    fb.done(t(id ? "reportDone" : "reportDup"));
  }

  const threads = useMemo(() => buildThreads(rows || []), [rows]);

  const renderMessage = (m, { reply = false, orphan = false } = {}) => {
    const mine = Boolean(myId) && m.author_id === myId;
    if (m.deleted) {
      return <div data-msg-deleted style={{ ...muted, fontSize: 13.5, fontStyle: "italic", padding: "6px 0" }}>{t("msgDeletedPlaceholder")}</div>;
    }
    return (
      <div data-msg={m.id} data-msg-reply={reply ? "true" : "false"} style={{ padding: "8px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span data-msg-author style={{ fontSize: 14.5, fontWeight: 600, color: colors.ink }}>{m.author_name || t("formerMember")}</span>
          <span data-msg-time title={f.dateTime(m.created_at)} style={{ ...muted, fontSize: 12.5 }}>{ageLabel(m.created_at, f.locale)}</span>
        </div>
        {orphan && <div style={{ ...muted, fontSize: 12.5 }}>{t("orphanReply")}</div>}
        <p data-msg-body style={{ margin: "3px 0 6px", fontSize: 15, lineHeight: 1.55, color: colors.ink, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{m.body}</p>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginLeft: -8 }}>
          {!reply && canPost && (
            <button type="button" data-msg-reply-btn onClick={() => { setReplyTo(replyTo === m.id ? null : m.id); setReplyText(""); setError(""); }} style={linkBtn}>{t("reply")}</button>
          )}
          {!mine && canWrite && (
            <button type="button" data-msg-report onClick={() => setReporting(m)} style={linkBtn}>{t("msgReport")}</button>
          )}
          {(mine || moderator) && (
            <button type="button" data-msg-delete onClick={() => remove(m)} style={{ ...linkBtn, color: colors.danger }}>{t("delete")}</button>
          )}
        </div>
        {replyTo === m.id && (
          <div style={{ marginTop: 6 }}>
            <textarea data-reply-input value={replyText} maxLength={MESSAGE_MAX} rows={2} autoFocus onChange={(e) => setReplyText(e.target.value)} placeholder={t("replyPlaceholder")} aria-label={t("replyPlaceholder")} style={{ ...input, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => setReplyTo(null)} style={{ ...button("secondary"), minHeight: 42 }}>{t("cancel")}</button>
              <button type="button" data-reply-send disabled={!replyText.trim() || sending} onClick={() => post(replyText, m.id)} style={{ ...button("primary"), minHeight: 42, opacity: !replyText.trim() || sending ? 0.5 : 1 }}>{t("send")}</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div data-community-group={group.slug} style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button type="button" data-group-back aria-label={t("groupsBack")} onClick={onBack} style={{ background: "none", border: 0, width: 44, height: 44, margin: "0 -6px 0 -10px", cursor: "pointer", color: colors.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" size={22} />
        </button>
        <span style={{ width: 40, height: 40, borderRadius: 999, background: colors.seaGlass, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={GROUP_ICON[group.slug] || "users"} size={20} stroke={1.6} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 data-group-title style={{ fontSize: 19, fontWeight: 600, margin: 0, color: colors.ink }}>{name}</h2>
          <span style={{ ...muted, fontSize: 13 }}>{t("members", { count: group.member_count })}</span>
        </div>
        {canWrite && (group.status === "open" || group.is_member) && (
          <button type="button" data-group-toggle={group.slug} disabled={busy} onClick={onToggle} style={{ ...button(group.is_member ? "secondary" : "primary"), minHeight: 44, padding: "0 16px", opacity: busy ? 0.6 : 1 }}>
            {group.is_member ? t("leave") : t("join")}
          </button>
        )}
      </div>

      <RulesNote compact />

      {group.status === "closed" ? (
        <p data-group-closed style={{ ...muted, fontSize: 14, margin: "0 0 14px" }}>{t("closedNote")}</p>
      ) : canPost ? (
        <div style={{ marginBottom: 18 }}>
          <textarea data-compose value={text} maxLength={MESSAGE_MAX} rows={3} onChange={(e) => setText(e.target.value)} placeholder={t("composerPlaceholder")} aria-label={t("composerPlaceholder")} style={{ ...input, resize: "vertical" }} />
          {error && !replyTo && <p role="alert" style={{ color: colors.danger, fontSize: 14, margin: "8px 0 0" }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" data-compose-send disabled={!text.trim() || sending} onClick={() => post(text)} style={{ ...button("primary"), minHeight: 46, padding: "0 22px", opacity: !text.trim() || sending ? 0.5 : 1 }}>{t("send")}</button>
          </div>
        </div>
      ) : canWrite ? (
        <button type="button" data-join-to-write disabled={busy} onClick={onToggle} style={{ ...button("primary"), minHeight: 48, width: "100%", marginBottom: 18 }}>{t("joinToWrite")}</button>
      ) : access?.restricted_until ? (
        <p style={{ ...muted, fontSize: 14, margin: "0 0 14px" }}>{t("restricted")}</p>
      ) : null}

      {failed ? (
        <LoadError what={t("loadWhat")} onRetry={load} />
      ) : !rows ? null : threads.length === 0 ? (
        <p data-group-empty style={{ ...muted, fontSize: 14.5 }}>{t("noMessagesYet")}</p>
      ) : (
        <div data-thread-list>
          {threads.map(({ root, orphan, replies }) => (
            <div key={root.id} style={{ borderTop: `1px solid ${colors.border}`, padding: "6px 0" }}>
              {renderMessage(root, { orphan })}
              {replies.length > 0 && (
                <div style={{ marginLeft: 12, paddingLeft: 14, borderLeft: `2px solid ${colors.border}` }}>
                  {replies.map((r) => <div key={r.id}>{renderMessage(r, { reply: true })}</div>)}
                </div>
              )}
            </div>
          ))}
          {more && (
            <button type="button" data-msg-older onClick={older} style={{ ...button("secondary"), width: "100%", minHeight: 46, marginTop: 10 }}>{t("older")}</button>
          )}
        </div>
      )}

      {reporting && <ReportSheet reasons={MESSAGE_REPORT_REASONS} onSend={(r, n) => report(reporting, r, n)} onClose={() => setReporting(null)} />}
      {confirmDialog}
    </div>
  );
}

const linkBtn = { background: "none", border: 0, minHeight: 36, padding: "0 8px", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, color: colors.inkSoft };
