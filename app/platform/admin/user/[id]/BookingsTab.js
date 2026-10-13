"use client";
import { formatCredits } from "../../../../../lib/platform/credits";
import { Panel, Row, RowMain, Status, Empty } from "../../ui";
import { labelForRole } from "../../../../../lib/platform/roles";
import { useTranslations } from "next-intl";
import { useFormat } from "../../../useFormat";
import { useLocalData } from "../../../useLocalData";

function crewLine(r, f, L) {
  return [L.text(r.place), f.dateRange(r.start_date, r.end_date), r.crew_role && r.crew_role !== "skipper" ? labelForRole(r.crew_role) : null]
    .filter(Boolean)
    .join(" · ");
}

function deliveryLine(d, f, t, L) {
  return [
    d.origin_point && d.destination_point ? `${L.text(d.origin_point)} → ${L.text(d.destination_point)}` : null,
    d.departure_date ? f.date(d.departure_date) : null,
    d.distance_miles ? t("bookings.miles", { miles: d.distance_miles }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function List({ items, render }) {
  const t = useTranslations("AdminUser");
  if (!items?.length) return <Empty>{t("bookings.noRecords")}</Empty>;
  return items.map(render);
}

export default function BookingsTab({ data }) {
  const t = useTranslations("AdminUser");
  const f = useFormat();
  const L = useLocalData();
  const hasClientSide = data.requests?.length || data.bookings_client?.length || data.delivery_requests?.length || data.delivery_bookings_client?.length;
  const hasProSide = data.pings?.length || data.bookings_pro?.length || data.delivery_pings?.length || data.delivery_bookings_pro?.length;

  return (
    <>
      {data.requests?.length > 0 && (
        <Panel title={t("bookings.crewRequests", { count: data.requests.length })} padded={false}>
          <List
            items={data.requests}
            render={(r) => (
              <Row key={r.id}>
                <RowMain title={crewLine(r, f, L)} meta={r.fee_amount != null ? t("bookings.credits", { amount: r.fee_amount }) : undefined} />
                <Status value={r.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.bookings_client?.length > 0 && (
        <Panel title={t("bookings.crewClient", { count: data.bookings_client.length })} padded={false}>
          <List
            items={data.bookings_client}
            render={(b) => (
              <Row key={b.id}>
                <RowMain title={crewLine(b, f, L)} meta={b.pro_name ? t("bookings.with", { name: L.name(b.pro_name) }) : undefined} />
                <Status value={b.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.pings?.length > 0 && (
        <Panel title={t("bookings.pings", { count: data.pings.length })} padded={false}>
          <List
            items={data.pings}
            render={(p) => (
              <Row key={p.id}>
                <RowMain title={crewLine(p.request || {}, f, L)} />
                <Status value={p.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.bookings_pro?.length > 0 && (
        <Panel title={t("bookings.crewPro", { count: data.bookings_pro.length })} padded={false}>
          <List
            items={data.bookings_pro}
            render={(b) => (
              <Row key={b.id}>
                <RowMain title={crewLine(b, f, L)} meta={b.client_name ? t("bookings.client", { name: L.name(b.client_name) }) : undefined} />
                <Status value={b.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.delivery_requests?.length > 0 && (
        <Panel title={t("bookings.deliveryRequests", { count: data.delivery_requests.length })} padded={false}>
          <List
            items={data.delivery_requests}
            render={(d) => (
              <Row key={d.id}>
                <RowMain title={deliveryLine(d, f, t, L)} meta={(d.roles || []).map((r) => labelForRole(r.crew_role)).join(", ") || undefined} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.delivery_bookings_client?.length > 0 && (
        <Panel title={t("bookings.deliveryClient", { count: data.delivery_bookings_client.length })} padded={false}>
          <List
            items={data.delivery_bookings_client}
            render={(d) => (
              <Row key={d.id}>
                <RowMain title={deliveryLine(d, f, t, L)} meta={d.pro_name ? t("bookings.with", { name: L.name(d.pro_name) }) : undefined} />
                <Status value={d.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.delivery_pings?.length > 0 && (
        <Panel title={t("bookings.deliveryPings", { count: data.delivery_pings.length })} padded={false}>
          <List
            items={data.delivery_pings}
            render={(p) => (
              <Row key={p.id}>
                <RowMain title={deliveryLine(p, f, t, L)} meta={labelForRole(p.role)} />
                <Status value={p.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.delivery_bookings_pro?.length > 0 && (
        <Panel title={t("bookings.deliveryPro", { count: data.delivery_bookings_pro.length })} padded={false}>
          <List
            items={data.delivery_bookings_pro}
            render={(d) => (
              <Row key={d.id}>
                <RowMain title={deliveryLine(d, f, t, L)} meta={d.client_name ? t("bookings.client", { name: L.name(d.client_name) }) : undefined} />
                <Status value={d.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {!hasClientSide && !hasProSide && (
        <Panel padded={false}>
          <Empty>{t("bookings.none")}</Empty>
        </Panel>
      )}
    </>
  );
}
