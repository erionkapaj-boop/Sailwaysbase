"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Icon from "../../components/Icon";
import { useTranslations } from "next-intl";
import AdminShell from "../AdminShell";
import { labelForRole } from "../../../../lib/platform/roles";
import { Panel, Row, Empty, Chip, Segments, IconDisc, STATUS_LABEL, colors, muted, money } from "../ui";
import { adminListBookings, departureLabel } from "../../../../lib/platform/db";
import LoadError from "../../components/LoadError";
import { useFormat } from "../../useFormat";
import { useLocalData } from "../../useLocalData";

const FILTERS = [
  ["upcoming", "filterUpcoming", "cal"],
  ["confirmed", "filterConfirmed", "calCheck"],
  ["completed", "filterCompleted", "check"],
  ["cancelled", "filterCancelled", "x"],
  ["", "filterAll", "list"],
];

const STATUS_CHIP = {
  confirmed: ["success", "calCheck"],
  completed: ["neutral", "check"],
  cancelled_by_client: ["danger", "x"],
  cancelled_by_skipper: ["danger", "x"],
  pending_payment: ["warn", "clock"],
};

function PersonLink({ icon, label, p }) {
  const t = useTranslations("AdminBookings");
  const L = useLocalData();
  if (!p) return null;
  return (
    <Link href={`/platform/admin/user/${p.id}`} title={label} data-user-text style={{ color: colors.ink, display: "inline-flex", alignItems: "center", gap: 4, minHeight: 28, textDecoration: "none" }}>
      <Icon name={icon} size={13} />
      {L.person({ full_name: p.name, full_name_latin: p.name_latin }) || t("noName")}
    </Link>
  );
}

function BookingsInner() {
  const t = useTranslations("AdminBookings");
  const f = useFormat();
  const L = useLocalData();
  const searchParams = useSearchParams();
  // Δίνει στα κουτιά της Επισκόπησης («Επερχόμενες», «Ολοκληρωμένες»,
  // «Ακυρώσεις») έναν σύνδεσμο που ανοίγει κατευθείαν στο σωστό φίλτρο.
  const filterParam = searchParams.get("filter");
  const initialFilter = FILTERS.some((f) => f[0] === filterParam) ? filterParam : "upcoming";

  const [all, setAll] = useState([]);
  const [filter, setFilter] = useState(initialFilter);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  function load() {
    setBusy(true);
    setFailed(false);
    adminListBookings()
      .then(setAll)
      .catch((err) => { console.error(err); setFailed(true); })
      .finally(() => setBusy(false));
  }

  useEffect(load, []);

  // Filtering here rather than per-query: the list is capped at 200 rows, and
  // switching a filter should be instant instead of a round trip.
  const list = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    switch (filter) {
      case "upcoming":
        return all.filter((b) => b.status === "confirmed" && b.end_date >= today);
      case "confirmed":
        return all.filter((b) => b.status === "confirmed");
      case "completed":
        return all.filter((b) => b.status === "completed");
      case "cancelled":
        return all.filter((b) => b.status.startsWith("cancelled"));
      default:
        return all;
    }
  }, [all, filter]);

  return (
    <AdminShell title={t("title")}>
      <Panel padded={false}>
        <Segments
          value={filter}
          items={FILTERS.map(([key, labelKey, icon]) => ({ key, label: t(labelKey), icon, count: key === filter && !busy ? list.length : null }))}
          onChange={setFilter}
        />

        {busy && <Empty>{t("loading")}</Empty>}
        {!busy && failed && <div style={{ padding: 12 }}><LoadError what={t("whatBookings")} onRetry={load} /></div>}
        {!busy && !failed && list.length === 0 && <Empty>{t("empty")}</Empty>}

        {list.map((b) => {
          const [tone, icon] = STATUS_CHIP[b.status] || ["neutral", "info"];
          return (
            <Row key={b.id}>
              <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 220px" }}>
                <IconDisc icon={icon} tone={tone} size={42} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span data-user-text style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {L.text(`${departureLabel(b)}${b.boat_types?.name ? " · " + b.boat_types.name : ""}`)}
                  </span>
                  <span style={{ ...muted, fontSize: 12.5, display: "block", marginTop: 3 }}>
                    <span style={money}>{f.date(b.start_date)}</span> → <span style={money}>{f.date(b.end_date)}</span>
                    {b.crew_role ? ` · ${labelForRole(b.crew_role)}` : ""}
                  </span>
                  <span style={{ fontSize: 12.5, display: "flex", gap: 12, flexWrap: "wrap", marginTop: 3 }}>
                    <PersonLink icon="user" label={t("client")} p={b.people?.client} />
                    <PersonLink icon="anchor" label={t("professional")} p={b.people?.pro} />
                  </span>
                </span>
              </span>
              <Chip tone={tone} icon={icon}>{STATUS_LABEL[b.status] || b.status}</Chip>
            </Row>
          );
        })}
      </Panel>
    </AdminShell>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsInner />
    </Suspense>
  );
}
