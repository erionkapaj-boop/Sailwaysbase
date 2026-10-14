"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import Toast from "../components/Toast";
import LoadError from "../components/LoadError";
import BoardRow, { BOARD_CSS } from "../components/BoardRow";
import { boatLine } from "../../../lib/platform/boat";
import {
  boardRequests, claimBoardRequest, withdrawBoardClaim, myBoardClaims, listLookups,
  deliveryBoardRequests, claimDeliveryBoardRequest, withdrawDeliveryBoardClaim, myDeliveryBoardClaims,
} from "../../../lib/platform/db";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { CREW_ROLES, labelForRole } from "../../../lib/platform/roles";
import { savePendingClaim, getPendingClaim, getPendingClaimKind, clearPendingClaim } from "../../../lib/platform/pendingClaim";
import { container, card, h1, muted, button, badge, colors, money, select, radius } from "../../../lib/platform/theme";

const PAGE = 20;

const segWrap = { display: "inline-flex", padding: 3, background: colors.seaGlass, borderRadius: radius.lg, gap: 2 };
const seg = (on) => ({
  minHeight: 44, padding: "0 18px", border: "none", borderRadius: radius.md, fontSize: 14, fontFamily: "inherit", cursor: "pointer",
  fontWeight: on ? 600 : 400, color: colors.ink, background: on ? colors.card : "transparent",
  boxShadow: on ? "0 1px 3px rgba(22,40,60,0.10)" : "none", transition: "background .18s ease, box-shadow .18s ease",
});

function chip(active) {
  return {
    ...button(active ? "primary" : "secondary"),
    padding: "8px 14px",
    fontSize: 13,
    minHeight: 36,
    borderRadius: 999,
  };
}

// Δημόσιος πίνακας ανοιχτών αιτημάτων: ανώνυμα, χωρίς λογαριασμό. Κοντινότερη
// ημερομηνία πρώτα, συνεχής κύλιση. Εγγραφή και αγορά credits ζητούνται μόνο
// όταν πατηθεί «Διεκδίκηση», και η αγορά είναι πάντα το τελευταίο βήμα.
export default function BoardPage() {
  const t = useTranslations("Board");
  const td = useTranslations("DeliveryRequests");
  const f = useFormat();
  const L = useLocalData();
  const router = useRouter();
  const { session, profile, loading: authLoading } = useAuth();
  const [role, setRole] = useState(null);
  // «crew»: πληρώματα, «delivery»: μεταφορές σκάφους (0126).
  const [kind, setKind] = useState("crew");
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [mine, setMine] = useState([]);
  const [lookups, setLookups] = useState({ regions: [], boatTypes: [] });
  const [toast, setToast] = useState(null);
  const [notice, setNotice] = useState(null); // { kind: "credit" | "approval" | "profile" | "guest", requestId }
  const [working, setWorking] = useState(null);
  const sentinel = useRef(null);
  const seq = useRef(0);

  const isPro = Boolean(profile?.id);
  const approved = profile?.approval_status === "approved";

  const errText = (err) => {
    const code = err?.message;
    return code && t.has(`err.${code}`) ? t(`err.${code}`) : friendlyError(err);
  };

  useEffect(() => {
    listLookups()
      .then((l) => setLookups({ regions: l.regions || [], boatTypes: l.boatTypes || [] }))
      .catch(() => {});
  }, []);

  const loadPage = useCallback(
    async (reset) => {
      const id = ++seq.current;
      setBusy(true);
      setFailed(false);
      try {
        const last = reset ? null : items[items.length - 1];
        const rows =
          kind === "delivery"
            ? await deliveryBoardRequests({ role, afterDate: last?.departure_date ?? null, afterId: last?.id ?? null, limit: PAGE })
            : await boardRequests({ role, afterStart: last?.start_date ?? null, afterId: last?.id ?? null, limit: PAGE });
        if (id !== seq.current) return;
        setItems((cur) => (reset ? rows : [...cur, ...rows]));
        setDone(rows.length < PAGE);
      } catch {
        if (id === seq.current) setFailed(true);
      } finally {
        if (id === seq.current) setBusy(false);
      }
    },
    [role, kind, items]
  );

  useEffect(() => {
    setItems([]);
    setDone(false);
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, kind]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || busy || failed || tab !== "all") return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && loadPage(false), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [done, busy, failed, tab, loadPage]);

  const loadMine = useCallback(async () => {
    if (!session || !isPro) return setMine([]);
    try {
      const [crew, del] = await Promise.all([myBoardClaims(), myDeliveryBoardClaims()]);
      setMine([...crew.map((c) => ({ ...c, kind: "crew" })), ...del.map((c) => ({ ...c, kind: "delivery" }))]);
    } catch {}
  }, [session, isPro]);
  useEffect(() => {
    loadMine();
  }, [loadMine]);

  function refreshAll() {
    loadPage(true);
    loadMine();
  }

  async function claim(requestId, claimKind = kind) {
    if (!session) {
      savePendingClaim(requestId, claimKind);
      setNotice({ kind: "guest", requestId });
      return;
    }
    if (!isPro) {
      savePendingClaim(requestId, claimKind);
      setNotice({ kind: "profile", requestId });
      return;
    }
    if (!approved) {
      savePendingClaim(requestId, claimKind);
      setNotice({ kind: "approval", requestId });
      return;
    }
    setWorking(requestId);
    try {
      await (claimKind === "delivery" ? claimDeliveryBoardRequest : claimBoardRequest)(requestId, profile.id);
      clearPendingClaim();
      setNotice(null);
      setToast(t("claimedToast"));
      refreshAll();
    } catch (err) {
      if (err?.message === "insufficient_wallet") {
        // Η αγορά credits είναι πάντα το τελευταίο βήμα: η διεκδίκηση μένει στη συσκευή.
        savePendingClaim(requestId, claimKind);
        setNotice({ kind: "credit", requestId });
      } else {
        setToast(errText(err));
      }
    } finally {
      setWorking(null);
    }
  }

  async function withdraw(requestId, claimKind = kind) {
    setWorking(requestId);
    try {
      await (claimKind === "delivery" ? withdrawDeliveryBoardClaim : withdrawBoardClaim)(requestId, profile.id);
      setToast(t("withdrawnToast"));
      refreshAll();
    } catch (err) {
      setToast(errText(err));
    } finally {
      setWorking(null);
    }
  }

  // Διεκδίκηση σε αναμονή: ξαναδοκιμάζεται όταν ο επαγγελματίας επιστρέφει εγκεκριμένος.
  const pendingId = typeof window === "undefined" || authLoading ? null : getPendingClaim();
  const retried = useRef(false);
  useEffect(() => {
    if (retried.current || authLoading || !session || !approved || !pendingId) return;
    retried.current = true;
    claim(pendingId, getPendingClaimKind());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session, approved, pendingId]);

  const regionName = (id) => L.text(lookups.regions.find((r) => r.id === id)?.name || "");
  const boatName = (id) => L.text(lookups.boatTypes.find((b) => b.id === id)?.name || "");
  const place = (r) => L.text(r.departure_point || regionName(r.region_id));

  const monthOf = (iso) => f.monthNames("short")[Number(String(iso).slice(5, 7)) - 1];
  const dayOf = (iso) => Number(String(iso).slice(8, 10));
  const closesOn = (r) => f.dateRange(String(r.closes_at).slice(0, 10), String(r.closes_at).slice(0, 10));

  function actionFor(r, claimKind) {
    return r.claimed_by_me ? (
      <>
        <span style={{ ...badge("success"), textAlign: "center" }}>{t("claimed")}</span>
        <button type="button" style={button("secondary")} disabled={working === r.id} onClick={() => withdraw(r.id, claimKind)}>
          {t("withdraw")}
        </button>
      </>
    ) : (
      <button type="button" style={button("primary")} disabled={working === r.id} onClick={() => claim(r.id, claimKind)}>
        {working === r.id ? t("claiming") : t("claim")}
      </button>
    );
  }

  function Card({ r }) {
    const sameRoute = !r.arrival_point || r.arrival_point === r.departure_point;
    return (
      <BoardRow
        day={dayOf(r.start_date)}
        month={monthOf(r.start_date)}
        title={labelForRole(r.crew_role)}
        route={sameRoute ? place(r) : t("route", { from: L.text(r.departure_point || regionName(r.region_id)), to: L.text(r.arrival_point) })}
        boat={boatLine(r)}
        meta={[
          regionName(r.region_id) && { icon: "pin", text: regionName(r.region_id) },
          boatName(r.boat_type_id) && { icon: "boat", text: boatName(r.boat_type_id) },
          r.party_size && { icon: "users", text: t("party", { count: r.party_size }) },
          r.private_cabin && { icon: "bed", text: t("privateCabin") },
        ].filter(Boolean)}
        facts={[
          { label: t("factDates"), value: f.dateRange(r.start_date, r.end_date) },
          { label: t("factOpenUntil"), value: closesOn(r) },
          { label: t("factClaims"), value: r.claims_count },
        ]}
        note={r.note}
        action={actionFor(r, "crew")}
        extra={notice?.requestId === r.id ? <ClaimNotice kind={notice.kind} /> : null}
      />
    );
  }

  function DeliveryCard({ r }) {
    const covers = ["covers_tickets", "covers_travel", "covers_food", "covers_fuel", "covers_port_expenses"].filter((k) => r[k]);
    return (
      <BoardRow
        day={dayOf(r.departure_date)}
        month={monthOf(r.departure_date)}
        title={labelForRole(r.crew_role)}
        route={t("route", { from: L.text(r.origin_point), to: L.text(r.destination_point) })}
        boat={boatLine(r)}
        meta={[
          { icon: "route", text: td("miles", { miles: r.distance_miles }) },
          r.flexible_days > 0 && { icon: "pin", text: td("flexDays", { days: r.flexible_days }) },
          ...covers.map((k) => ({ icon: "check", text: k === "covers_food" && r.food_allowance_amount != null ? `${td(k)} (${r.food_allowance_amount}€)` : td(k) })),
        ].filter(Boolean)}
        facts={[
          { label: t("factDeparture"), value: f.date(r.departure_date) },
          { label: t("factPay"), value: `${r.offered_price}€` },
          { label: t("factOpenUntil"), value: closesOn(r) },
          { label: t("factClaims"), value: r.claims_count },
        ]}
        note={r.notes}
        action={actionFor(r, "delivery")}
        extra={notice?.requestId === r.id ? <ClaimNotice kind={notice.kind} /> : null}
      />
    );
  }

  function ClaimNotice({ kind }) {
    const next = encodeURIComponent("/platform/board");
    return (
      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 14, paddingTop: 12 }}>
        {kind === "guest" && (
          <>
            <p style={{ ...muted, margin: "0 0 10px" }}>{t("guestNote")}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/platform/professionals" style={{ ...button("primary"), textDecoration: "none" }}>
                {t("signupToClaim")}
              </Link>
              <Link href={`/platform/login?next=${next}`} style={{ ...button("secondary"), textDecoration: "none" }}>
                {t("loginToClaim")}
              </Link>
            </div>
          </>
        )}
        {kind === "profile" && (
          <>
            <p style={{ ...muted, margin: "0 0 10px" }}>{t("becomePro")}</p>
            <Link href="/platform/profile" style={{ ...button("secondary"), textDecoration: "none" }}>
              {t("openProfile")}
            </Link>
          </>
        )}
        {kind === "approval" && <p style={{ ...muted, margin: 0 }}>{t("pendingApproval")}</p>}
        {kind === "credit" && (
          <>
            <b style={{ fontWeight: 600 }}>{t("needCreditTitle")}</b>
            <p style={{ ...muted, margin: "6px 0 10px" }}>{t("needCreditBody")}</p>
            <button type="button" style={button("primary")} onClick={() => router.push("/platform/wallet")}>
              {t("buyCredits")}
            </button>
          </>
        )}
      </div>
    );
  }

  const stateKey = { active: "stateActive", chosen: "stateChosen", closed: "stateClosed", withdrawn: "stateWithdrawn" };
  const stateTone = { active: "brand", chosen: "success", closed: "neutral", withdrawn: "neutral" };

  return (
    <div style={{ ...container, maxWidth: 1080 }}>
      <style>{BOARD_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h1 style={{ ...h1, marginBottom: 8 }}>{t("title")}</h1>
          <p style={{ ...muted, margin: "0 0 24px", maxWidth: 620 }}>{t("subtitle")}</p>
        </div>
        <Link href="/platform/board/new" className="bd-leave" style={button("secondary")}>
          {t("leaveRequest")}
        </Link>
      </div>

      {isPro && (
        <div role="tablist" style={{ ...segWrap, marginBottom: 12 }}>
          {[["all", "tabAll"], ["mine", "tabMine"]].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} style={seg(tab === k)} onClick={() => setTab(k)}>
              {t(label)}
            </button>
          ))}
        </div>
      )}

      {pendingId && !notice && session && !approved && (
        <div style={{ ...card, borderLeft: `3px solid ${colors.accent}` }}>
          <b style={{ fontWeight: 600 }}>{t("pendingTitle")}</b>
          <p style={{ ...muted, margin: "6px 0 0" }}>{isPro ? t("pendingApproval") : t("becomePro")}</p>
        </div>
      )}

      {tab === "all" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0 16px", borderBottom: `1px solid ${colors.border}`, marginBottom: 16 }}>
            <div role="tablist" style={segWrap}>
              {["crew", "delivery"].map((k) => (
                <button key={k} type="button" role="tab" aria-selected={kind === k} data-board-kind={k} style={seg(kind === k)} onClick={() => { setKind(k); setRole(null); setNotice(null); }}>
                  {t(k === "crew" ? "kindCrew" : "kindDelivery")}
                </button>
              ))}
            </div>
            <select aria-label={t("roleFilter")} value={role || ""} onChange={(e) => setRole(e.target.value || null)} style={{ ...select, width: "auto", minWidth: 180, height: 44, fontSize: 15 }}>
              <option value="">{t("allRoles")}</option>
              {CREW_ROLES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <span style={{ ...muted, fontSize: 13, marginLeft: "auto" }}>
              {!busy || items.length > 0 ? (done ? t("showing", { count: items.length }) : t("showingMore", { count: items.length })) : ""}
            </span>
          </div>
          {failed ? (
            <LoadError what={t("loadWhat")} onRetry={() => loadPage(true)} />
          ) : (
            <>
              {items.map((r) => (
                kind === "delivery" ? <DeliveryCard key={r.id} r={r} /> : <Card key={r.id} r={r} />
              ))}
              {busy && <p style={muted}>{t("loading")}</p>}
              {!busy && items.length === 0 && (
                <div style={{ ...card, textAlign: "center" }}>
                  <p style={{ ...muted, margin: 0 }}>{kind === "delivery" ? t("deliveryEmpty") : t("empty")}</p>
                </div>
              )}
              {!done && !busy && (
                <div ref={sentinel} style={{ textAlign: "center", padding: 12 }}>
                  <button type="button" style={button("secondary")} onClick={() => loadPage(false)}>
                    {t("loadMore")}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === "mine" && (
        <>
          <p style={{ ...muted, margin: "0 0 12px", fontSize: 13 }}>{t("mineHint")}</p>
          {mine.length === 0 && (
            <div style={{ ...card, textAlign: "center" }}>
              <p style={{ ...muted, margin: 0 }}>{t("emptyMine")}</p>
            </div>
          )}
          {mine.map((c) => (
            <div key={c.claim_id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <b style={{ fontWeight: 600 }}>{labelForRole(c.crew_role)}{c.kind === "delivery" ? ` · ${t("kindDelivery")}` : ""}</b>
                <span style={money}>{c.kind === "delivery" ? f.date(c.departure_date) : f.dateRange(c.start_date, c.end_date)}</span>
              </div>
              <p style={{ margin: "6px 0 0" }}>
                {c.kind === "delivery"
                  ? t("route", { from: L.text(c.origin_point), to: L.text(c.destination_point) })
                  : L.text(c.departure_point || regionName(c.region_id))}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                <span style={badge(stateTone[c.state] || "neutral")}>{t(stateKey[c.state] || "stateClosed")}</span>
                {c.needs_credit && <span style={badge("warn")}>{t("needsCredit")}</span>}
                {c.state === "active" && (
                  <button type="button" style={{ ...button("secondary"), marginLeft: "auto" }} disabled={working === (c.request_id || c.role_request_id)} onClick={() => withdraw(c.request_id || c.role_request_id, c.kind)}>
                    {t("withdraw")}
                  </button>
                )}
                {c.state === "chosen" && (
                  <Link href="/platform/bookings" style={{ ...button("secondary"), textDecoration: "none", marginLeft: "auto" }}>
                    {t("viewBookings")}
                  </Link>
                )}
              </div>
              {c.needs_credit && (
                <button type="button" style={{ ...button("primary"), marginTop: 10 }} onClick={() => router.push("/platform/wallet")}>
                  {t("buyCredits")}
                </button>
              )}
            </div>
          ))}
        </>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
