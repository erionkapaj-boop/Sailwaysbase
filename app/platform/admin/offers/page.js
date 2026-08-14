"use client";
import { useCallback, useEffect, useState } from "react";
import AdminShell, { useAdminCounts } from "../AdminShell";
import OfferComposer from "../OfferComposer";
import { Panel, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { labelForRole } from "../../../../lib/platform/roles";
import { adminListOffers, adminCancelOffer } from "../../../../lib/platform/db";
import { timeAgo } from "../../../../lib/platform/notifications";

const ORIGIN_LABEL = {
  admin_direct: "Δικό σου ναύλο",
  admin_replacement: "Αντικατάσταση",
};

function expiryText(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "έληξε";
  const hours = Math.floor(ms / 3600000);
  if (hours >= 24) return `λήγει σε ${Math.floor(hours / 24)} ημέρες`;
  if (hours >= 1) return `λήγει σε ${hours} ώρες`;
  return `λήγει σε ${Math.max(1, Math.floor(ms / 60000))} λεπτά`;
}

export default function OffersPage() {
  const counts = useAdminCounts();
  const [offers, setOffers] = useState([]);
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setOffers(await adminListOffers(showClosed));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }, [showClosed]);

  useEffect(() => {
    load();
  }, [load]);

  async function withdraw(id) {
    setError("");
    try {
      await adminCancelOffer(id);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  return (
    <AdminShell
      title="Αναθέσεις"
      subtitle="Δουλειά που δίνεις εσύ σε συγκεκριμένα άτομα. Την παίρνει όποιος αποδεχτεί πρώτος, και πληρώνει."
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      {/* Το ζητούμενο πρώτο: έχεις ναύλο και θες πλήρωμα. Η λίστα των σταλμένων
          είναι από κάτω, γιατί τη διαβάζεις μία φορά την ημέρα ενώ αυτό το
          κάνεις τη στιγμή που προκύπτει η ανάγκη. */}
      <Panel
        title="Νέα ανάθεση"
        subtitle="Δες ποιοι είναι ελεύθεροι στις ημερομηνίες σου, διάλεξε και στείλ' τους τη δουλειά."
        padded={false}
      >
        <OfferComposer onDone={load} />
      </Panel>

      <Panel
        title={showClosed ? "Όλες οι αναθέσεις" : `Σε αναμονή απάντησης (${offers.length})`}
        action={
          <button
            style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}
            onClick={() => setShowClosed((v) => !v)}
          >
            {showClosed ? "Μόνο ανοιχτές" : "Δες και τις κλειστές"}
          </button>
        }
        padded={false}
      >
        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && offers.length === 0 && <Empty>Καμία ανάθεση.</Empty>}

        {offers.map((o) => (
          <Row key={o.request_id}>
            <RowMain
              title={`${o.port_name || "—"} · ${labelForRole(o.crew_role)}`}
              meta={
                <>
                  <span style={money}>{o.start_date}</span> → <span style={money}>{o.end_date}</span> ·{" "}
                  {ORIGIN_LABEL[o.origin] || o.origin}
                  {o.claim_fee_amount > 0 ? (
                    <>
                      {" · "}
                      <span style={money}>{o.claim_fee_amount}€</span> με την αποδοχή
                    </>
                  ) : (
                    " · χωρίς χρέωση"
                  )}
                  <br />
                  {o.status === "open" ? (
                    <>
                      <span style={money}>{o.pending}</span> από <span style={money}>{o.recipients}</span> δεν έχουν
                      απαντήσει
                      {o.declined > 0 && (
                        <>
                          {" · "}
                          <span style={money}>{o.declined}</span> αρνήθηκαν
                        </>
                      )}
                      {" · "}
                      {expiryText(o.expires_at)}
                    </>
                  ) : o.claimed_by ? (
                    <span style={{ color: colors.success }}>Την πήρε ο/η {o.claimed_by}</span>
                  ) : (
                    <>Στάλθηκε {timeAgo(o.created_at)} σε <span style={money}>{o.recipients}</span> άτομα</>
                  )}
                  {o.note && (
                    <>
                      <br />
                      «{o.note}»
                    </>
                  )}
                </>
              }
            />
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
              <Status value={o.status} />
              {o.status === "open" && (
                <button
                  style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}
                  onClick={() => withdraw(o.request_id)}
                >
                  Απόσυρση
                </button>
              )}
            </span>
          </Row>
        ))}
      </Panel>

      <p style={{ ...muted, fontSize: 12.5, lineHeight: 1.6 }}>
        Η απόσυρση δεν μετράει σε βάρος κανενός: όποιος δεν πρόλαβε να απαντήσει δεν καταγράφεται ως αδιάφορος, γιατί
        τη σιωπή την επέβαλες εσύ κλείνοντας την πρόταση.
      </p>
    </AdminShell>
  );
}
