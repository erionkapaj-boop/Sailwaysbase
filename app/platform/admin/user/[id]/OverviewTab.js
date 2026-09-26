"use client";
import { useState } from "react";
import Link from "next/link";
import { Panel, MetricGrid, Metric, Empty, colors, muted, button } from "../../ui";
import { adminResolveFlag } from "../../../../../lib/platform/db";
import { tapTarget } from "../../../../../lib/platform/theme";
import Stars from "../../../components/Stars";
import { formatDateTime } from "../../../../../lib/platform/notifications";
import { EventRow, errorLabel } from "./shared";

// Ό,τι χρειάζεται κανείς να δει πρώτο: τα βασικά νούμερα, τι εκκρεμεί ακριβώς
// (πέρα από τα «σοβαρά» issues που φαίνονται ήδη ψηλά στη σελίδα) και οι
// τελευταίες κινήσεις — για να καταλάβει ο admin σε λίγα δευτερόλεπτα πού
// βρίσκεται ο λογαριασμός, χωρίς να ανοίξει άλλη καρτέλα.
export default function OverviewTab({ data, onSelectTab, reload }) {
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
        <Metric label="Υπόλοιπο πορτοφολιού" value={`${u.wallet_balance ?? 0}€`} />
        {cp && <Metric label="Αξιοπιστία" value={cp.reliability_percentage != null ? `${cp.reliability_percentage}%` : "—"} />}
        {cp && <Metric label="Ολοκληρωμένες κρατήσεις" value={cp.completed_bookings_count ?? 0} />}
        {sp && <Metric label="Τιμή / ημέρα" value={`${sp.price_per_day}€`} />}
        {sp && <Metric label="Έγκριση" value={sp.approval_status === "approved" ? "Εγκεκριμένο" : sp.approval_status === "rejected" ? "Απορρίφθηκε" : "Σε αναμονή"} />}
        {sp && <Metric label="Αξιοπιστία" value={sp.reliability_percentage != null ? `${sp.reliability_percentage}%` : "—"} />}
      </MetricGrid>

      {(sp || cp) && (
        <Panel title="Αξιολόγηση">
          <Stars rating={sp?.rating_avg ?? cp?.rating_avg} count={(sp?.rating_count ?? cp?.rating_count) || 0} />
        </Panel>
      )}

      {(openDisputes.length > 0 || openFlags.length > 0 || newMsgs.length > 0) && (
        <Panel title="Χρειάζεται προσοχή" padded={false}>
          {flagError && <p style={{ color: colors.danger, fontSize: 13, margin: 0, padding: "10px 16px" }}>{flagError}</p>}
          {openFlags.map((f) => (
            <div
              key={`flag-${f.id}`}
              style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "10px 16px", borderBottom: `1px solid ${colors.border}`, fontSize: 13.5 }}
            >
              <span style={{ minWidth: 0 }}>
                {f.type === "duplicate_email" ? "Ίδιο email με άλλον λογαριασμό" : f.type}
                {f.related_user_id && (
                  <>
                    {" · "}
                    <Link href={`/platform/admin/user/${f.related_user_id}`} style={{ color: colors.ink }}>
                      {f.related_name || "άλλος λογαριασμός"}
                    </Link>
                  </>
                )}
                <span style={{ ...muted, display: "block", fontSize: 12, marginTop: 2 }}>{formatDateTime(f.created_at)}</span>
              </span>
              <button
                type="button"
                style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}
                disabled={flagBusy === f.id}
                onClick={() => resolveFlag(f.id)}
              >
                {flagBusy === f.id ? "…" : "Εξετάστηκε"}
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
              Ανοιχτή αναφορά ακύρωσης{d.place ? ` · ${d.place}` : ""}
              {d.reason && <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>{d.reason}</div>}
            </button>
          ))}
          {newMsgs.map((m) => (
            <Link
              key={`msg-${m.id}`}
              href="/platform/admin/messages"
              style={{ display: "block", padding: "10px 16px", borderBottom: `1px solid ${colors.border}`, fontSize: 13.5, color: colors.ink, textDecoration: "none" }}
            >
              Μήνυμα επικοινωνίας χωρίς απάντηση →
              {m.message && (
                <span style={{ ...muted, display: "block", fontSize: 12.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  «{m.message}»
                </span>
              )}
              <span style={{ ...muted, display: "block", fontSize: 12, marginTop: 2 }}>{formatDateTime(m.created_at)}</span>
            </Link>
          ))}
        </Panel>
      )}

      <Panel
        title="Πρόσφατη δραστηριότητα"
        action={
          <button
            type="button"
            onClick={() => onSelectTab("history")}
            style={{ ...tapTarget, fontSize: 12.5, color: colors.ink, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
          >
            Όλο το ιστορικό
          </button>
        }
        padded={false}
      >
        {recent.length === 0 && <Empty>Καμία καταγεγραμμένη δραστηριότητα.</Empty>}
        {recent.map((e, i) => (
          <EventRow key={i} event={e} />
        ))}
      </Panel>
    </>
  );
}
