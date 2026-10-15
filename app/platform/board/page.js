"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import Toast from "../components/Toast";
import LoadError from "../components/LoadError";
import BoardRow, { BOARD_CSS } from "../components/BoardRow";
import MapView from "../components/map/MapView";
import { usePlacePositions } from "../components/map/usePlacePositions";
import { locatePoint, boundsOf } from "../../../lib/platform/geo";
import { boatLine } from "../../../lib/platform/boat";
import { cabinKindFrom } from "../../../lib/platform/cabin";
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

// Λίστα και χάρτης (μοτίβο Airbnb): σε μεγάλη οθόνη ο χάρτης κολλά δεξιά, σε
// μικρή ανοίγει πάνω από τη λίστα με το κουμπί «Χάρτης».
const MAP_CSS = `
.bd-split { display: block; }
.bd-list { container-type: inline-size; container-name: board; min-width: 0; }
.bd-item { border-radius: 14px; }
.bd-item[data-hot="true"] > .bd-row { border-color: ${colors.ink}; box-shadow: 0 2px 4px rgba(22,40,60,0.05), 0 10px 24px rgba(22,40,60,0.08); }
.bd-fab { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(var(--sf-bnav, 0px) + 24px + env(safe-area-inset-bottom, 0px)); z-index: 45;
  display: inline-flex; align-items: center; gap: 9px; min-height: 48px; padding: 0 22px; border: 0; border-radius: 999px;
  background: ${colors.ink}; color: #fff; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 18px rgba(22,40,60,0.28); }
.bd-fab:focus-visible { outline: 2px solid ${colors.accent}; outline-offset: 3px; }
.bd-area { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 5; display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: #fff; color: ${colors.ink}; font: inherit; font-size: 14px; font-weight: 600;
  white-space: nowrap; cursor: pointer; box-shadow: 0 1px 2px rgba(22,40,60,0.08), 0 6px 16px rgba(22,40,60,0.14); }
.bd-overlay { position: fixed; inset: 0; z-index: 60; background: ${colors.bg}; }
.bd-sheet { position: absolute; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 6; background: #fff;
  border-radius: 16px; padding: 16px; box-shadow: 0 8px 28px rgba(22,40,60,0.22); }
.bd-sheet .bd-date { width: 56px; height: 56px; }
@media (min-width: 1100px) {
  .bd-split[data-map="true"] { display: grid; grid-template-columns: minmax(0, 1fr) minmax(380px, 42%); gap: 24px; align-items: start; }
  .bd-mapcol { position: sticky; top: 88px; height: calc(100vh - 112px); }
}
@media (prefers-reduced-motion: reduce) { .bd-item > .bd-row { transition: none; } }
`;

const MapIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" />
  </svg>
);
const ListIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
);
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" />
  </svg>
);

// true σε οθόνη από 1100px και πάνω (μετά τη φόρτωση, ώστε να μη διαφέρει από τον διακομιστή).
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1100px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

const inBounds = (p, b) => p && b && p.lng >= b[0][0] && p.lng <= b[1][0] && p.lat >= b[0][1] && p.lat <= b[1][1];

// Δημόσιος πίνακας ανοιχτών αιτημάτων: ανώνυμα, χωρίς λογαριασμό. Κοντινότερη
// ημερομηνία πρώτα, συνεχής κύλιση. Εγγραφή και αγορά credits ζητούνται μόνο
// όταν πατηθεί «Διεκδίκηση», και η αγορά είναι πάντα το τελευταίο βήμα.
export default function BoardPage() {
  const t = useTranslations("Board");
  const td = useTranslations("DeliveryRequests");
  const tc = useTranslations("Cabin");
  const tb = useTranslations("BoatType");
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
  const wide = useWide();
  const positioned = usePlacePositions();
  const [mapOpen, setMapOpen] = useState(false); // μικρή οθόνη: ο χάρτης πάνω από τη λίστα
  const [hot, setHot] = useState(null); // αίτημα που δείχνει ο δείκτης (κάρτα ↔ ετικέτα)
  const [chosen, setChosen] = useState(null); // μεγάλη οθόνη: αίτημα που πατήθηκε στον χάρτη
  const [picked, setPicked] = useState(null); // μικρή οθόνη: το αίτημα της κάρτας κάτω από τον χάρτη
  const [area, setArea] = useState(null); // φίλτρο «σε αυτή την περιοχή του χάρτη»
  const [moved, setMoved] = useState(null); // όρια μετά από κίνηση του χρήστη (για το κουμπί αναζήτησης)
  const [mapFocus, setMapFocus] = useState(null);
  const fittedFor = useRef(null);

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
    setArea(null);
    setMoved(null);
    setPicked(null);
    fittedFor.current = null;
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
  // Η ακριβής καμπίνα που ζήτησε ο πελάτης (παλιές γραμμές: από το true/false).
  const cabinFor = (r) => {
    const kind = cabinKindFrom(r.cabin_kind, r.private_cabin);
    return kind ? { kind, label: tc(kind), hint: tc(`${kind}Hint`) } : null;
  };
  const boatName = (id) => L.text(lookups.boatTypes.find((b) => b.id === id)?.name || "");
  const place = (r) => L.text(r.departure_point || regionName(r.region_id));

  const monthOf = (iso) => f.monthNames("short")[Number(String(iso).slice(5, 7)) - 1];
  const dayOf = (iso) => Number(String(iso).slice(8, 10));
  const closesOn = (r) => f.dateRange(String(r.closes_at).slice(0, 10), String(r.closes_at).slice(0, 10));

  // Θέσεις στον χάρτη: λιμάνι αναχώρησης (πλήρωμα) ή αφετηρία και προορισμός (μεταφορά).
  const regionRaw = (id) => lookups.regions.find((r) => r.id === id)?.name || "";
  const located = useMemo(
    () =>
      items.map((r) =>
        kind === "delivery"
          ? { r, from: locatePoint(r.origin_point, { positioned }), to: locatePoint(r.destination_point, { positioned }) }
          : { r, from: locatePoint(r.departure_point, { positioned }) || locatePoint(regionRaw(r.region_id), { positioned }), to: null }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, kind, positioned, lookups.regions]
  );
  const shown = area ? located.filter((x) => inBounds(x.from, area) || inBounds(x.to, area)) : located;
  const onMap = shown.filter((x) => x.from);
  const shortDate = (r) => {
    const iso = kind === "delivery" ? r.departure_date : r.start_date;
    return `${dayOf(iso)} ${monthOf(iso)}`;
  };

  // Μία ετικέτα ανά σημείο: πολλά αιτήματα στο ίδιο λιμάνι δείχνουν «15 Ιουν +2».
  const markers = useMemo(() => {
    const groups = new Map();
    for (const x of onMap) {
      const k = `${x.from.lat.toFixed(3)},${x.from.lng.toFixed(3)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    return [...groups.values()].map((g) => {
      const first = g[0];
      const ids = g.map((x) => x.r.id);
      const label = g.length > 1 ? `${shortDate(first.r)} +${g.length - 1}` : shortDate(first.r);
      return {
        id: first.r.id,
        lng: first.from.lng,
        lat: first.from.lat,
        label,
        ariaLabel: t("pinAria", { date: label, place: L.text(first.from.kind === "place" ? first.from.place.name : first.from.region) }),
        active: ids.includes(hot) || ids.includes(picked) || ids.includes(chosen),
        ids,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMap.map((x) => x.r.id).join(","), hot, picked, chosen, positioned]);

  const routeLayers = useMemo(() => {
    if (kind !== "delivery") return [];
    const line = (x) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[x.from.lng, x.from.lat], [x.to.lng, x.to.lat]] } });
    const all = onMap.filter((x) => x.to);
    const activeId = hot || picked || chosen;
    return [
      { id: "routes", kind: "lines", color: "#7D8C9B", width: 2, data: { type: "FeatureCollection", features: all.filter((x) => x.r.id !== activeId).map(line) } },
      { id: "route-active", kind: "lines", color: colors.ink, width: 3.5, data: { type: "FeatureCollection", features: all.filter((x) => x.r.id === activeId).map(line) } },
      // Το τέλος κάθε διαδρομής (η αρχή έχει την ετικέτα με την ημερομηνία).
      { id: "route-ends", kind: "points", radius: 4, data: { type: "FeatureCollection", features: all.map((x) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [x.to.lng, x.to.lat] } })) } },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, onMap.map((x) => x.r.id).join(","), hot, picked, chosen]);

  // Ο χάρτης πλαισιώνει τα αιτήματα μία φορά ανά είδος (όχι σε κάθε «περισσότερα»).
  useEffect(() => {
    if (fittedFor.current === kind || area) return;
    const pts = located.flatMap((x) => [x.from, x.to].filter(Boolean));
    if (!pts.length) return;
    fittedFor.current = kind;
    const b = boundsOf(pts);
    setMapFocus({ bounds: b, padding: 60, maxZoom: 9, key: `${kind}-${Date.now()}` });
  }, [located, kind, area]);

  const showMap = tab === "all" && (wide || mapOpen);
  useEffect(() => {
    if (!mapOpen || wide) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e) => e.key === "Escape" && setMapOpen(false);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [mapOpen, wide]);
  useEffect(() => {
    if (wide) setMapOpen(false);
  }, [wide]);

  function onMarker(id) {
    if (wide) {
      setChosen(id);
      document.querySelector(`[data-board-item="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setPicked(id);
    }
  }

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
        boatName={r.boat_model}
        cabin={cabinFor(r)}
        meta={[
          regionName(r.region_id) && { icon: "pin", text: regionName(r.region_id) },
          (boatName(r.boat_type_id) || (r.crew_role === "skipper" ? tb("notSet") : "")) && { icon: "boat", text: boatName(r.boat_type_id) || tb("notSet") },
          r.party_size && { icon: "users", text: t("party", { count: r.party_size }) },
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
        boatName={r.boat_model}
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
              <Link href="/platform/register?as=professional" style={{ ...button("primary"), textDecoration: "none" }}>
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
    <div style={{ ...container, maxWidth: wide && tab === "all" ? 1440 : 1080 }}>
      <style>{BOARD_CSS + MAP_CSS}</style>
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
              {area ? t("showing", { count: shown.length }) : !busy || items.length > 0 ? (done ? t("showing", { count: items.length }) : t("showingMore", { count: items.length })) : ""}
            </span>
          </div>
          <div className="bd-split" data-map={wide ? "true" : "false"}>
          <div className="bd-list">
          {failed ? (
            <LoadError what={t("loadWhat")} onRetry={() => loadPage(true)} />
          ) : (
            <>
              {area && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 14px" }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{t("areaOnly")}</span>
                  <button type="button" data-board-area-clear style={{ ...button("secondary"), minHeight: 36, padding: "0 14px", fontSize: 13 }} onClick={() => setArea(null)}>
                    {t("areaClear")}
                  </button>
                </div>
              )}
              {shown.map(({ r }) => (
                <div
                  key={r.id}
                  className="bd-item"
                  data-board-item={r.id}
                  data-hot={hot === r.id || chosen === r.id ? "true" : "false"}
                  onMouseEnter={() => setHot(r.id)}
                  onMouseLeave={() => setHot((h) => (h === r.id ? null : h))}
                >
                  {kind === "delivery" ? DeliveryCard({ r }) : Card({ r })}
                </div>
              ))}
              {busy && <p style={muted}>{t("loading")}</p>}
              {!busy && items.length > 0 && shown.length === 0 && (
                <div style={{ ...card, textAlign: "center" }}>
                  <p style={{ ...muted, margin: 0 }}>{t("areaEmpty")}</p>
                </div>
              )}
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
          </div>
          {showMap && (
            <div className={wide ? "bd-mapcol" : "bd-overlay"} data-board-map role={wide ? undefined : "dialog"} aria-label={wide ? undefined : t("mapShow")}>
              <div style={{ position: "relative", height: "100%" }}>
                <MapView
                  height="100%"
                  markers={markers}
                  layers={routeLayers}
                  focus={mapFocus}
                  positioned={positioned}
                  onMarker={onMarker}
                  onMarkerHover={wide ? setHot : undefined}
                  onMove={(b) => setMoved(b)}
                  onPick={() => { setPicked(null); setChosen(null); }}
                  controls={wide ? "bottom-right" : "top-right"}
                />
                {moved && (
                  <button type="button" className="bd-area" data-board-search-area onClick={() => { setArea(moved); setMoved(null); setPicked(null); }}>
                    <SearchIcon /> {t("searchArea")}
                  </button>
                )}
                {!wide && (
                  <>
                    <button type="button" className="bd-fab" data-board-list style={{ position: "absolute", bottom: picked ? 230 : "calc(24px + env(safe-area-inset-bottom, 0px))" }} onClick={() => setMapOpen(false)}>
                      <ListIcon /> {t("listShow")}
                    </button>
                    {picked && (() => {
                      const x = located.find((y) => y.r.id === picked);
                      if (!x) return null;
                      const r = x.r;
                      const iso = kind === "delivery" ? r.departure_date : r.start_date;
                      const route = kind === "delivery" ? t("route", { from: L.text(r.origin_point), to: L.text(r.destination_point) }) : L.text(r.departure_point || regionName(r.region_id));
                      return (
                        <div className="bd-sheet" data-board-sheet>
                          <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr)", gap: "4px 14px" }}>
                            <div className="bd-date" aria-hidden="true"><b>{dayOf(iso)}</b><span>{monthOf(iso)}</span></div>
                            <div style={{ minWidth: 0 }}>
                              <h3 className="bd-title" style={{ fontSize: 16 }}>{labelForRole(r.crew_role)}</h3>
                              <p className="bd-route" style={{ fontSize: 14 }}>{route}</p>
                              {boatLine(r) && <p className="bd-boat" style={{ fontSize: 13 }}>{boatLine(r)}</p>}
                              <p style={{ ...muted, fontSize: 12.5, margin: "6px 0 0" }}>
                                {kind === "delivery" ? `${td("miles", { miles: r.distance_miles })} · ${r.offered_price}€` : f.dateRange(r.start_date, r.end_date)}
                              </p>
                            </div>
                          </div>
                          <div className="bd-act" style={{ marginTop: 12 }}>{actionFor(r, kind)}</div>
                          {notice?.requestId === r.id && <ClaimNotice kind={notice.kind} />}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          )}
          </div>
          {!wide && !mapOpen && items.length > 0 && (
            <button type="button" className="bd-fab" data-board-map-open onClick={() => setMapOpen(true)}>
              <MapIcon /> {t("mapShow")}
            </button>
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
