"use client";
import { formatCredits } from "../../../../../lib/platform/credits";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../../useFormat";
import Link from "next/link";
import { Panel, MetricGrid, Metric, Empty, colors, muted, button } from "../../ui";
import { adminResolveFlag } from "../../../../../lib/platform/db";
import { tapTarget } from "../../../../../lib/platform/theme";
import Stars from "../../../components/Stars";
import { EventRow, useErrorLabel } from "./shared";

// Ό,τι χρειάζεται κανείς να δει πρώτο: τα βασικά νούμερα, τι εκκρεμεί ακριβώς
// (πέρα από τα «σοβαρά» issues που φαίνονται ήδη ψηλά στη σελίδα) και οι
// τελευταίες κινήσεις — για να καταλάβει ο admin σε λίγα δευτερόλεπτα πού
// βρίσκεται ο λογαριασμός, χωρίς να ανοίξει άλλη καρτέλα.
export default function OverviewTab({ data, onSelectTab, reload }) {
  const t = useTranslations("AdminUser");
  const f = useFormat();
  const errorLabel = useErrorLabel();
  const [flagBusy, setFlagBusy] = useState(null);
  const [flagError, setFlagError] = useState("");

  async function resolveFlag(flagId) {
    setFlagBusy(flagId);
    setFlagError("");
    try {
      await adminResolveFlag(flagId);
      await reload();
    } catch (err) {
      setFlagError(errorLabel(err));
    } finally {
      setFlagBusy(null);
    }
  }

  const u = data.user;
  const cp = data.client_profile;
  const sp = data.skipper_profile;

  const openDisputes = (data.disputes || []).filter((d) => !d.resolved_at);
  const openFlags = (data.flags || []).filter((f) => !f.resolved_at);
  const newMsgs = (data.contact_messages || []).filter((m) => m.status === "new");
  const recent = (data.timeline || []).slice(0, 6);

  return (
    <>
      <MetricGrid>
        <Metric label={t("overview.credits")} value={formatCredits(u.wallet_balance)} />
        {cp && <Metric label={t("overview.reliability")} value={cp.reliability_percentage != null ? `${cp.reliability_percentage}%` : "—"} />}
        {cp && <Metric label={t("overview.completedBookings")} value={cp.completed_bookings_count ?? 0} />}
        {sp && <Metric label={t("overview.pricePerDay")} value={sp.price_per_day != null ? `${sp.price_per_day}€` : "—"} />}
        {sp && <Metric label={t("overview.approval")} value={sp.approval_status === "approved" ? t("overview.approved") : sp.approval_status === "rejected" ? t("overview.rejected") : t("overview.pendingApproval")} />}
        {sp && <Metric label={t("overview.reliability")} value={sp.reliability_percentage != null ? `${sp.reliability_percentage}%` : "—"} />}
      </MetricGrid>

      {(sp || cp) && (
        <Panel title={t("overview.rating")}>
          <Stars rating={sp?.rating_avg ?? cp?.rating_avg} count={(sp?.rating_count ?? cp?.rating_count) || 0} />
        </Panel>
      )}

      {(openDisputes.length > 0 || openFlags.length > 0 || newMsgs.length > 0) && (
        <Panel title={t("overview.needsAttention")} padded={false}>
          {flagError && <p style={{ color: colors.danger, fontSize: 13, margin: 0, padding: "10px 16px" }}>{flagError}</p>}
          {openFlags.map((fl) => (
            <div
              key={`flag-${fl.id}`}
              style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "10px 16px", borderBottom: `1px solid ${colors.border}`, fontSize: 13.5 }}
            >
              <span style={{ minWidth: 0 }}>
                {fl.type === "duplicate_email" ? t("overview.flagDuplicateEmail") : fl.type}
                {fl.related_user_id && (
                  <>
                    {" · "}
                    <Link href={`/platform/admin/user/${fl.related_user_id}`} style={{ color: colors.ink }}>
                      {fl.related_name || t("overview.otherAccount")}
                    </Link>
                  </>
                )}
                <span style={{ ...muted, display: "block", fontSize: 12, marginTop: 2 }}>{f.dateTime(fl.created_at)}</span>
              </span>
              <button
                type="button"
                style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}
                disabled={flagBusy === fl.id}
                onClick={() => resolveFlag(fl.id)}
              >
                {flagBusy === fl.id ? "…" : t("overview.reviewed")}
              </button>
            </div>
          ))}
          {openDisputes.map((d) => (
            <button
              key={`dispute-${d.id}`}
              onClick={() => onSelectTab("finance")}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                fontSize: 13.5,
                background: "none",
                border: "none",
                borderBottom: `1px solid ${colors.border}`,
                cursor: "pointer",
                fontFamily: "inherit",
                color: colors.ink,
              }}
            >
              {t("overview.openDispute")}{d.place ? ` · ${d.place}` : ""}
              {d.reason && <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>{d.reason}</div>}
            </button>
          ))}
          {newMsgs.map((m) => (
            <Link
              key={`msg-${m.id}`}
              href="/platform/admin/messages"
              style={{ display: "block", padding: "10px 16px", borderBottom: `1px solid ${colors.border}`, fontSize: 13.5, color: colors.ink, textDecoration: "none" }}
            >
              {t("overview.unansweredMessage")}
              {m.message && (
                <span style={{ ...muted, display: "block", fontSize: 12.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t("overview.quote", { text: m.message })}
                </span>
              )}
              <span style={{ ...muted, display: "block", fontSize: 12, marginTop: 2 }}>{f.dateTime(m.created_at)}</span>
            </Link>
          ))}
        </Panel>
      )}

      <Panel
        title={t("overview.recent")}
        action={
          <button
            type="button"
            onClick={() => onSelectTab("history")}
            style={{ ...tapTarget, fontSize: 12.5, color: colors.ink, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
          >
            {t("overview.allHistory")}
          </button>
        }
        padded={false}
      >
        {recent.length === 0 && <Empty>{t("overview.noActivity")}</Empty>}
        {recent.map((e, i) => (
          <EventRow key={i} event={e} />
        ))}
      </Panel>
    </>
  );
}
