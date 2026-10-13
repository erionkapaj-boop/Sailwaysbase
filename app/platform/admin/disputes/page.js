"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useFormat } from "../../useFormat";
import { useLocalData } from "../../useLocalData";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import { Panel, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { tapTarget } from "../../../../lib/platform/theme";
import { adminListCancellationReports, adminResolveReport, departureLabel } from "../../../../lib/platform/db";

function People({ people }) {
  const t = useTranslations("AdminDisputes");
  const L = useLocalData();
  if (!people?.client && !people?.pro) return null;
  const item = (label, p) =>
    p && (
      <Link href={`/platform/admin/user/${p.id}`} style={{ ...tapTarget, color: colors.ink, textDecoration: "underline" }}>
        {label}: {L.person({ full_name: p.name, full_name_latin: p.name_latin }) || t("noName")}
      </Link>
    );
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, marginTop: 8 }}>
      {item(t("client"), people.client)}
      {item(t("professional"), people.pro)}
    </div>
  );
}

export default function DisputesPage() {
  const t = useTranslations("AdminDisputes");
  const f = useFormat();
  const refreshCounts = useRefreshAdminCounts();
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");

  async function load() {
    try {
      setList(await adminListCancellationReports());
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function resolve(id) {
    setBusyId(id);
    setError("");
    try {
      await adminResolveReport(id, notes[id] || null);
      await load();
      refreshCounts();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  const L = useLocalData();
  const open = list.filter((r) => !r.resolved_at);
  const done = list.filter((r) => r.resolved_at);

  return (
    <AdminShell
      title={t("title")}
      subtitle={t("subtitle")}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      <Panel title={t("openTitle", { count: open.length })} padded={false}>
        {busy && <Empty>{t("loading")}</Empty>}
        {!busy && open.length === 0 && <Empty>{t("openEmpty")}</Empty>}
        {open.map((r) => (
          <div key={r.id} style={{ borderBottom: `1px solid ${colors.border}`, padding: "14px 16px", background: "#FBF6EC" }}>
            <RowMain
              title={
                r.bookings
                  ? `${L.text(departureLabel(r.bookings))} · ${f.date(r.bookings.start_date)} → ${f.date(r.bookings.end_date)}`
                  : t("booking")
              }
              meta={t(r.at_fault_party === "client" ? "cancelledByClient" : "cancelledByPro", { ago: f.timeAgo(r.created_at) })}
            />
            <People people={r.people} />
            <p data-user-text style={{ fontSize: 13, margin: "10px 0 0", color: colors.ink }}>{r.reason}</p>
            <input
              placeholder={t("notePlaceholder")}
              value={notes[r.id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              style={{
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
              }}
            />
            <button
              style={{ ...button("primary"), marginTop: 10 }}
              disabled={busyId === r.id}
              onClick={() => resolve(r.id)}
            >
              {busyId === r.id ? "…" : t("closeReport")}
            </button>
          </div>
        ))}
      </Panel>

      <Panel title={t("resolvedTitle", { count: done.length })} padded={false}>
        {done.length === 0 && <Empty>{t("resolvedEmpty")}</Empty>}
        {done.map((r) => (
          <Row key={r.id}>
            <RowMain
              title={`${r.bookings ? L.text(departureLabel(r.bookings)) : t("booking")} · ${[r.people?.client, r.people?.pro].filter(Boolean).map((p) => L.person({ full_name: p.name, full_name_latin: p.name_latin })).join(" ↔ ")}`}
              meta={r.resolution_note || r.reason}
              metaUser
            />
            <span style={{ ...muted, fontSize: 11.5, flexShrink: 0 }}>{f.timeAgo(r.resolved_at)}</span>
          </Row>
        ))}
      </Panel>
    </AdminShell>
  );
}
