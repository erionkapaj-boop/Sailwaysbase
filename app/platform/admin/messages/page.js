"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../useFormat";
import { useLocalData } from "../../useLocalData";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import Link from "next/link";
import { Panel, Row, RowMain, Empty, colors, muted, button } from "../ui";
import { adminListContactMessages, adminSetContactMessageStatus } from "../../../../lib/platform/db";

const TOPICS = ["general", "booking", "payment", "report", "privacy", "other"];

// Μια αναφορά ή ένα αίτημα ΓΚΠΔ έχει προθεσμία και συνέπειες· μια γενική
// ερώτηση όχι. Ξεχωρίζουν οπτικά ώστε να μην περιμένουν στη σειρά.
const URGENT = new Set(["report", "privacy"]);

const noteInput = {
  width: "100%",
  marginTop: 10,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  boxSizing: "border-box",
  background: colors.card,
  color: colors.ink,
};

// Replies happen outside the platform, on whatever the sender left — so the
// page offers that channel directly instead of leaving it to copy/paste.
function replyLinks(contact, t) {
  const c = (contact || "").trim();
  if (c.includes("@")) return [{ href: `mailto:${c}`, label: t("replyEmail") }];
  const digits = c.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length >= 8) {
    const tel = digits.startsWith("+") ? digits : digits.length === 10 ? `+30${digits}` : digits;
    return [{ href: `tel:${tel}`, label: t("call") }];
  }
  return [];
}

// Phone numbers are stored as +30…; searching the last 10 digits matches
// however the sender typed theirs.
function searchTerm(contact) {
  const c = (contact || "").trim();
  if (c.includes("@")) return c;
  const digits = c.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : c;
}

export default function AdminMessagesPage() {
  const t = useTranslations("AdminMessages");
  const f = useFormat();
  const L = useLocalData();
  const topicLabel = (topic) => (TOPICS.includes(topic) ? t(`topic_${topic}`) : topic);
  const refreshCounts = useRefreshAdminCounts();
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");

  async function load() {
    try {
      setList(await adminListContactMessages());
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function setStatus(id, status) {
    setBusyId(id);
    setError("");
    try {
      await adminSetContactMessageStatus(id, status, notes[id] || null);
      await load();
      refreshCounts();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  const open = list.filter((m) => m.status === "new");
  const done = list.filter((m) => m.status === "handled");

  return (
    <AdminShell
      title={t("title")}
      subtitle={t("subtitle")}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      <Panel title={t("openTitle", { count: open.length })} padded={false}>
        {busy && <Empty>{t("loading")}</Empty>}
        {!busy && open.length === 0 && <Empty>{t("openEmpty")}</Empty>}
        {open.map((m) => (
          <div
            key={m.id}
            style={{
              borderBottom: `1px solid ${colors.border}`,
              padding: "14px 16px",
              background: URGENT.has(m.topic) ? "#FBF6EC" : colors.card,
            }}
          >
            <RowMain
              title={`${L.name(m.name)} · ${topicLabel(m.topic)}`}
              meta={
                <>
                  {m.contact} · {f.timeAgo(m.created_at)}
                  {m.user_id ? ` · ${t("registeredUser")}` : ` · ${t("visitor")}`}
                </>
              }
            />
            <p data-user-text style={{ fontSize: 13.5, margin: "10px 0 0", color: colors.ink, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {m.message}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {replyLinks(m.contact, t).map((r) => (
                <a key={r.href} href={r.href} style={{ ...button("secondary"), textDecoration: "none" }}>
                  {r.label}
                </a>
              ))}
              {m.user_id ? (
                <Link href={`/platform/admin/user/${m.user_id}`} style={{ ...button("secondary"), textDecoration: "none" }}>
                  {t("userDetails")}
                </Link>
              ) : (
                // A visitor who can't log in (e.g. forgot the PIN) writes in
                // without an account link — this finds them by what they left.
                <Link
                  href={`/platform/admin/users?q=${encodeURIComponent(searchTerm(m.contact))}`}
                  style={{ ...button("secondary"), textDecoration: "none" }}
                >
                  {t("findAccount")}
                </Link>
              )}
            </div>
            <input
              placeholder={t("notePlaceholder")}
              value={notes[m.id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))}
              style={noteInput}
            />
            <button
              style={{ ...button("primary"), marginTop: 10 }}
              disabled={busyId === m.id}
              onClick={() => setStatus(m.id, "handled")}
            >
              {busyId === m.id ? "…" : t("markAnswered")}
            </button>
          </div>
        ))}
      </Panel>

      <Panel title={t("doneTitle", { count: done.length })} padded={false}>
        {done.length === 0 && <Empty>{t("doneEmpty")}</Empty>}
        {done.map((m) => (
          <Row key={m.id}>
            <RowMain
              title={`${L.name(m.name)} · ${topicLabel(m.topic)}`}
              meta={m.admin_note || m.contact}
              metaUser
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ ...muted, fontSize: 11.5 }}>{f.timeAgo(m.handled_at || m.created_at)}</span>
              <button
                style={{ ...button("secondary"), padding: "4px 10px", fontSize: 12 }}
                disabled={busyId === m.id}
                onClick={() => setStatus(m.id, "new")}
              >
                {t("reopen")}
              </button>
            </div>
          </Row>
        ))}
      </Panel>
    </AdminShell>
  );
}
