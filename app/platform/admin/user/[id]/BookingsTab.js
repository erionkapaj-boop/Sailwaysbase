"use client";
import { Panel, Row, RowMain, Status, Empty } from "../../ui";
import { labelForRole } from "../../../../../lib/platform/roles";
import { formatDateRange, formatDate } from "../../../../../lib/platform/notifications";

function crewLine(r) {
  return [r.place, formatDateRange(r.start_date, r.end_date), r.crew_role && r.crew_role !== "skipper" ? labelForRole(r.crew_role) : null]
    .filter(Boolean)
    .join(" · ");
}

function deliveryLine(d) {
  return [
    d.origin_point && d.destination_point ? `${d.origin_point} → ${d.destination_point}` : null,
    d.departure_date ? formatDate(d.departure_date) : null,
    d.distance_miles ? `${d.distance_miles} μίλια` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function List({ items, render }) {
  if (!items?.length) return <Empty>Καμία εγγραφή.</Empty>;
  return items.map(render);
}

export default function BookingsTab({ data }) {
  const hasClientSide = data.requests?.length || data.bookings_client?.length || data.delivery_requests?.length || data.delivery_bookings_client?.length;
  const hasProSide = data.pings?.length || data.bookings_pro?.length || data.delivery_pings?.length || data.delivery_bookings_pro?.length;

  return (
    <>
      {data.requests?.length > 0 && (
        <Panel title={`Αιτήματα πληρώματος (${data.requests.length})`} padded={false}>
          <List
            items={data.requests}
            render={(r) => (
              <Row key={r.id}>
                <RowMain title={crewLine(r)} meta={r.fee_amount != null ? `Τέλος: ${r.fee_amount}€` : undefined} />
                <Status value={r.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.bookings_client?.length > 0 && (
        <Panel title={`Κρατήσεις πληρώματος ως πελάτης (${data.bookings_client.length})`} padded={false}>
          <List
            items={data.bookings_client}
            render={(b) => (
              <Row key={b.id}>
                <RowMain title={crewLine(b)} meta={b.pro_name ? `Με ${b.pro_name}` : undefined} />
                <Status value={b.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.pings?.length > 0 && (
        <Panel title={`Αιτήματα που του στάλθηκαν (${data.pings.length})`} padded={false}>
          <List
            items={data.pings}
            render={(p) => (
              <Row key={p.id}>
                <RowMain title={crewLine(p.request || {})} />
                <Status value={p.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.bookings_pro?.length > 0 && (
        <Panel title={`Κρατήσεις πληρώματος ως επαγγελματίας (${data.bookings_pro.length})`} padded={false}>
          <List
            items={data.bookings_pro}
            render={(b) => (
              <Row key={b.id}>
                <RowMain title={crewLine(b)} meta={b.client_name ? `Πελάτης: ${b.client_name}` : undefined} />
                <Status value={b.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.delivery_requests?.length > 0 && (
        <Panel title={`Αιτήματα μεταφοράς σκάφους (${data.delivery_requests.length})`} padded={false}>
          <List
            items={data.delivery_requests}
            render={(d) => (
              <Row key={d.id}>
                <RowMain title={deliveryLine(d)} meta={(d.roles || []).map((r) => labelForRole(r.crew_role)).join(", ") || undefined} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.delivery_bookings_client?.length > 0 && (
        <Panel title={`Μεταφορές ως πελάτης (${data.delivery_bookings_client.length})`} padded={false}>
          <List
            items={data.delivery_bookings_client}
            render={(d) => (
              <Row key={d.id}>
                <RowMain title={deliveryLine(d)} meta={d.pro_name ? `Με ${d.pro_name}` : undefined} />
                <Status value={d.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.delivery_pings?.length > 0 && (
        <Panel title={`Αιτήματα μεταφοράς που έλαβε (${data.delivery_pings.length})`} padded={false}>
          <List
            items={data.delivery_pings}
            render={(p) => (
              <Row key={p.id}>
                <RowMain title={deliveryLine(p)} meta={labelForRole(p.role)} />
                <Status value={p.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {data.delivery_bookings_pro?.length > 0 && (
        <Panel title={`Μεταφορές που ανέλαβε (${data.delivery_bookings_pro.length})`} padded={false}>
          <List
            items={data.delivery_bookings_pro}
            render={(d) => (
              <Row key={d.id}>
                <RowMain title={deliveryLine(d)} meta={d.client_name ? `Πελάτης: ${d.client_name}` : undefined} />
                <Status value={d.status} />
              </Row>
            )}
          />
        </Panel>
      )}

      {!hasClientSide && !hasProSide && (
        <Panel padded={false}>
          <Empty>Καμία κράτηση ή αίτημα ακόμα.</Empty>
        </Panel>
      )}
    </>
  );
}
