"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { formatCredits } from "../../../../lib/platform/credits";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../useFormat";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Empty, colors, muted, money } from "../ui";
import { adminListDeliveryRequests } from "../../../../lib/platform/db";
import { labelForRole } from "../../../../lib/platform/roles";
import { formatMoney } from "../../../../lib/platform/notifications";

const ROLE_STATUSES = ["open", "filled", "cancelled", "expired"];
const BOOKING_STATUSES = ["confirmed", "completed", "cancelled"];

// Πλήρης ορατότητα σε κάθε αίτημα μεταφοράς από τη στιγμή που δημιουργείται
// (ζητήθηκε ρητά) — για spot-check στα δηλωμένα μίλια, το μόνο μέγεθος από
// το οποίο υπολογίζεται η προμήθεια της πλατφόρμας (0067). Καμία ενέργεια
// έγκρισης εδώ — μόνο ανάγνωση.
export default function AdminDeliveriesPage() {
  const t = useTranslations("AdminDeliveries");
  const f = useFormat();
  const counts = useAdminCounts();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminListDeliveryRequests()
      .then(setRows)
      .catch((err) => setError(friendlyError(err)));
  }, []);

  return (
    <AdminShell title={t("title")} subtitle={t("subtitle")} counts={counts}>
      <Panel title={t("requests", { count: rows?.length ?? "…" })} padded={false}>
        {error && <p style={{ color: colors.danger, padding: 16, margin: 0 }}>{error}</p>}
        {rows == null && !error && <Empty>{t("loading")}</Empty>}
        {rows?.length === 0 && <Empty>{t("empty")}</Empty>}
        {rows?.map(({ request, client_name, role_requests }) => (
          <div key={request.id} style={{ padding: "14px 16px", borderTop: `1px solid ${colors.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14.5 }}>
                {request.origin_point} → {request.destination_point}
              </span>
              <span style={{ ...muted, fontSize: 12.5 }}>{client_name}</span>
            </div>
            <p style={{ ...muted, fontSize: 13, margin: "4px 0 10px" }}>
              <span style={{ ...money, color: colors.ink }}>{t("miles", { count: request.distance_miles })}</span> ·{" "}
              {f.date(request.departure_date)}
              {request.flexible_days > 0 ? ` (${t("flexibleDays", { count: request.flexible_days })})` : ""} · {t("sent")}{" "}
              {f.dateTime(request.created_at)}
            </p>

            {(role_requests || []).map((rr) => (
              <div
                key={rr.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px 16px",
                  fontSize: 12.5,
                  padding: "6px 10px",
                  background: colors.bgSoft || "#F7F5F0",
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              >
                <span style={{ fontWeight: 600, minWidth: 60 }}>{labelForRole(rr.crew_role)}</span>
                <span>{t("offer")}: <b style={{ color: colors.ink }}>{formatMoney(rr.offered_price)}€</b></span>
                <span>{t("commissionBase")}: {formatMoney(rr.commission_base)}€</span>
                <span>{t("platformCommission")}: {formatMoney(rr.platform_commission)}€</span>
                <span>{t("client")}: <b style={{ color: colors.ink }}>{formatCredits(rr.client_fee)}</b></span>
                <span>{t("professional")}: <b style={{ color: colors.ink }}>{formatCredits(rr.professional_fee)}</b></span>
                <span style={{ marginLeft: "auto", color: rr.status === "filled" ? colors.success : colors.inkSoft }}>
                  {ROLE_STATUSES.includes(rr.status) ? t(`roleStatus_${rr.status}`) : rr.status}
                </span>
                {rr.booking && (
                  <span style={{ width: "100%", ...muted }}>
                    {t("tookOver")}: {rr.booking.skipper_name} · {BOOKING_STATUSES.includes(rr.booking.status) ? t(`bookingStatus_${rr.booking.status}`) : rr.booking.status}
                  </span>
                )}
              </div>
            ))}

            {request.notes && <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>«{request.notes}»</p>}
          </div>
        ))}
      </Panel>
    </AdminShell>
  );
}
