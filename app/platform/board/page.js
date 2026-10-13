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
import { boardRequests, claimBoardRequest, withdrawBoardClaim, myBoardClaims, listLookups } from "../../../lib/platform/db";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { CREW_ROLES, labelForRole } from "../../../lib/platform/roles";
import { savePendingClaim, getPendingClaim, clearPendingClaim } from "../../../lib/platform/pendingClaim";
import { container, card, h1, muted, button, badge, colors, money, sectionLabel } from "../../../lib/platform/theme";

const PAGE = 20;

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
  const f = useFormat();
  const L = useLocalData();
  const router = useRouter();
  const { session, profile, loading: authLoading } = useAuth();
  const [role, setRole] = useState(null);
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
        const rows = await boardRequests({ role, afterStart: last?.start_date ?? null, afterId: last?.id ?? null, limit: PAGE });
        if (id !== seq.current) return;
        setItems((cur) => (reset ? rows : [...cur, ...rows]));
        setDone(rows.length < PAGE);
      } catch {
        if (id === seq.current) setFailed(true);
      } finally {
        if (id === seq.current) setBusy(false);
      }
    },
    [role, items]
  );

  useEffect(() => {
    setItems([]);
    setDone(false);
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

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
      setMine(await myBoardClaims());
    } catch {}
  }, [session, isPro]);
  useEffect(() => {
    loadMine();
  }, [loadMine]);

  function refreshAll() {
    loadPage(true);
    loadMine();
  }

  async function claim(requestId) {
    if (!session) {
      savePendingClaim(requestId);
      setNotice({ kind: "guest", requestId });
      return;
    }
    if (!isPro) {
      savePendingClaim(requestId);
      setNotice({ kind: "profile", requestId });
      return;
    }
    if (!approved) {
      savePendingClaim(requestId);
      setNotice({ kind: "approval", requestId });
      return;
    }
    setWorking(requestId);
    try {
      await claimBoardRequest(requestId, profile.id);
      clearPendingClaim();
      setNotice(null);
      setToast(t("claimedToast"));
      refreshAll();
    } catch (err) {
      if (err?.message === "insufficient_wallet") {
        // Η αγορά credits είναι πάντα το τελευταίο βήμα: η διεκδίκηση μένει στη συσκευή.
        savePendingClaim(requestId);
        setNotice({ kind: "credit", requestId });
      } else {
        setToast(errText(err));
      }
    } finally {
      setWorking(null);
    }
  }

  async function withdraw(requestId) {
    setWorking(requestId);
    try {
      await withdrawBoardClaim(requestId, profile.id);
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
    claim(pendingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session, approved, pendingId]);

  const regionName = (id) => L.text(lookups.regions.find((r) => r.id === id)?.name || "");
  const boatName = (id) => L.text(lookups.boatTypes.find((b) => b.id === id)?.name || "");
  const place = (r) => L.text(r.departure_point || regionName(r.region_id));

  function Card({ r }) {
    const mineClaim = r.claimed_by_me;
    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
          <b style={{ fontWeight: 600 }}>{labelForRole(r.crew_role)}</b>
          <span style={money}>{f.dateRange(r.start_date, r.end_date)}</span>
        </div>
        <p style={{ margin: "6px 0 0" }}>
          {r.arrival_point && r.arrival_point !== r.departure_point
            ? t("route", { from: L.text(r.departure_point || regionName(r.region_id)), to: L.text(r.arrival_point) })
            : place(r)}
        </p>
        <p style={{ ...muted, fontSize: 13, margin: "4px 0 0" }}>
          {[regionName(r.region_id), boatName(r.boat_type_id), r.party_size ? t("party", { count: r.party_size }) : "", r.private_cabin ? t("privateCabin") : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {r.note && (
          <p data-user-text style={{ margin: "8px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>
            {r.note}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <span style={{ ...muted, fontSize: 12 }}>
            {t("claimsCount", { count: r.claims_count })} · {t("closes", { date: f.date(r.closes_at) })}
          </span>
          {mineClaim ? (
            <button type="button" style={button("secondary")} disabled={working === r.id} onClick={() => withdraw(r.id)}>
              {t("withdraw")}
            </button>
          ) : (
            <button type="button" style={button("primary")} disabled={working === r.id} onClick={() => claim(r.id)}>
              {working === r.id ? t("claiming") : t("claim")}
            </button>
          )}
        </div>
        {mineClaim && <span style={{ ...badge("success"), marginTop: 10 }}>{t("claimed")}</span>}
        {notice?.requestId === r.id && <ClaimNotice kind={notice.kind} />}
      </div>
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
    <div style={container}>
      <h1 style={{ ...h1, marginBottom: 8 }}>{t("title")}</h1>
      <p style={{ ...muted, margin: "0 0 20px" }}>{t("subtitle")}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" style={chip(tab === "all")} onClick={() => setTab("all")}>
          {t("tabAll")}
        </button>
        {isPro && (
          <button type="button" style={chip(tab === "mine")} onClick={() => setTab("mine")}>
            {t("tabMine")}
          </button>
        )}
        <Link href="/platform/board/new" style={{ ...chip(false), textDecoration: "none", display: "inline-flex", alignItems: "center", marginLeft: "auto" }}>
          {t("leaveRequest")}
        </Link>
      </div>

      {pendingId && !notice && session && !approved && (
        <div style={{ ...card, borderLeft: `3px solid ${colors.accent}` }}>
          <b style={{ fontWeight: 600 }}>{t("pendingTitle")}</b>
          <p style={{ ...muted, margin: "6px 0 0" }}>{isPro ? t("pendingApproval") : t("becomePro")}</p>
        </div>
      )}

      {tab === "all" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button type="button" style={chip(role === null)} onClick={() => setRole(null)}>
              {t("allRoles")}
            </button>
            {CREW_ROLES.map((r) => (
              <button key={r.key} type="button" style={chip(role === r.key)} onClick={() => setRole(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          {failed ? (
            <LoadError what={t("loadWhat")} onRetry={() => loadPage(true)} />
          ) : (
            <>
              {items.map((r) => (
                <Card key={r.id} r={r} />
              ))}
              {busy && <p style={muted}>{t("loading")}</p>}
              {!busy && items.length === 0 && (
                <div style={{ ...card, textAlign: "center" }}>
                  <p style={{ ...muted, margin: 0 }}>{t("empty")}</p>
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
                <b style={{ fontWeight: 600 }}>{labelForRole(c.crew_role)}</b>
                <span style={money}>{f.dateRange(c.start_date, c.end_date)}</span>
              </div>
              <p style={{ margin: "6px 0 0" }}>{L.text(c.departure_point || regionName(c.region_id))}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                <span style={badge(stateTone[c.state] || "neutral")}>{t(stateKey[c.state] || "stateClosed")}</span>
                {c.needs_credit && <span style={badge("warn")}>{t("needsCredit")}</span>}
                {c.state === "active" && (
                  <button type="button" style={{ ...button("secondary"), marginLeft: "auto" }} disabled={working === c.request_id} onClick={() => withdraw(c.request_id)}>
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
