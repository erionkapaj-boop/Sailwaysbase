"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { formatCredits } from "../../../../lib/platform/credits";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../useFormat";
import { useLocalData } from "../../useLocalData";
import AdminShell, { useAdminCounts } from "../AdminShell";
import OfferComposer from "../OfferComposer";
import { EmptyState, Panel, Row, RowMain, Empty, Status, colors, money, button } from "../ui";
import { labelForRole } from "../../../../lib/platform/roles";
import { adminListOffers, adminCancelOffer } from "../../../../lib/platform/db";

const ORIGINS = ["admin_direct", "admin_replacement"];

function expiryText(iso, t) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t("expired");
  const hours = Math.floor(ms / 3600000);
  if (hours >= 24) return t("expiresDays", { n: Math.floor(hours / 24) });
  if (hours >= 1) return t("expiresHours", { n: hours });
  return t("expiresMinutes", { n: Math.max(1, Math.floor(ms / 60000)) });
}

export default function OffersPage() {
  const t = useTranslations("AdminOffers");
  const f = useFormat();
  const L = useLocalData();
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
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, [showClosed]);

  useEffect(() => {
    load();
  }, [load]);

  const m = (chunks) => <span style={money}>{chunks}</span>;

  async function withdraw(id) {
    setError("");
    try {
      await adminCancelOffer(id);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <AdminShell
      title={t("title")}
      counts={counts}
      ownerOnly
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      {/* Το ζητούμενο πρώτο: έχεις ναύλο και θες πλήρωμα. Η λίστα των σταλμένων
          * είναι από κάτω, γιατί τη διαβάζεις μία φορά την ημέρα ενώ αυτό το
          * κάνεις τη στιγμή που προκύπτει η ανάγκη. */}
      <Panel
        title={t("newTitle")}
        padded={false}
      >
        <OfferComposer onDone={load} />
      </Panel>

      {(offers.length > 0 || showClosed || busy) && <Panel
        title={showClosed ? t("allOffers") : t("awaiting", { count: offers.length })}
        action={
          <button
            style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}
            onClick={() => setShowClosed((v) => !v)}
          >
            {showClosed ? t("onlyOpen") : t("showClosed")}
          </button>
        }
        padded={false}
      >
        {busy && <Empty>{t("loading")}</Empty>}

        {offers.map((o) => (
          <Row key={o.request_id}>
            <RowMain
              title={`${L.text(o.port_name) || "—"} · ${labelForRole(o.crew_role)}`}
              meta={
                <>
                  <span style={money}>{f.date(o.start_date)}</span> → <span style={money}>{f.date(o.end_date)}</span> ·{" "}
                  {ORIGINS.includes(o.origin) ? t(`origin.${o.origin}`) : o.origin}
                  {o.claim_fee_amount > 0 ? (
                    <>
                      {" · "}
                      {t.rich("claimFee", { credits: formatCredits(o.claim_fee_amount), m })}
                    </>
                  ) : (
                    ` · ${t("noFee")}`
                  )}
                  <br />
                  {o.status === "open" ? (
                    <>
                      {t.rich("pendingOf", { pending: o.pending, recipients: o.recipients, m })}
                      {o.declined > 0 && (
                        <>
                          {" · "}
                          {t.rich("declined", { n: o.declined, m })}
                        </>
                      )}
                      {" · "}
                      {expiryText(o.expires_at, t)}
                    </>
                  ) : o.claimed_by ? (
                    <span style={{ color: colors.success }}>{t("claimedBy", { name: L.name(o.claimed_by) })}</span>
                  ) : (
                    <>{t.rich(Number(o.recipients) === 1 ? "sentToOne" : "sentTo", { ago: f.timeAgo(o.created_at), n: o.recipients, m })}</>
                  )}
                  {o.note && (
                    <>
                      <br />
                      <span data-user-text>«{o.note}»</span>
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
                  {t("withdraw")}
                </button>
              )}
            </span>
          </Row>
        ))}
      </Panel>}
    </AdminShell>
  );
}
