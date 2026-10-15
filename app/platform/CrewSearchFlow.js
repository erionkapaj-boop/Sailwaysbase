"use client";
import { useEffect, useState } from "react";
import { useSessionState } from "./useSessionState";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { listLookups } from "../../lib/platform/db";
import DateRangeCalendar from "./components/DateRangeCalendar";
import { CREW_ROLES } from "../../lib/platform/roles";
import RoleInfoSheet from "./components/RoleInfoSheet";
import BackButton from "./components/BackButton";
import ForwardButton from "./components/ForwardButton";
import Icon, { ROLE_ICON, BOAT_ICON } from "./components/Icon";
import Counter from "./components/Counter";
import CabinChoice from "./components/CabinChoice";
import { serializeCabins, serializePositions, isMultiDay, MAX_POSITIONS } from "../../lib/platform/cabin";
import { BrandStep, ModelStep, FeetStep, YearStep } from "./components/BoatSteps";
import { boatKind, boatName } from "../../lib/platform/boatCatalog";
import { BOAT_UNKNOWN } from "../../lib/platform/boat";
import RouteStep from "./components/RouteStep";
import { useLocalData } from "./useLocalData";
import { COUNTRIES } from "../../lib/platform/places";
import { button, colors, input, label, muted, radius, select, h2 } from "../../lib/platform/theme";

// Progressive disclosure (brief §4): one question on screen at a time, gentle
// fade/slide between them — never the whole form at once.
//
// "country" and "where" are two questions instead of country → region → port:
// first the country (its own page — more countries are coming), then the
// client types what they know (island, town, marina — typos welcome) or picks
// one of the base ports, and the region follows from the place (PlacePicker).
// Anyone who doesn't know yet can browse the regions from the same step.
//
// The boat is asked for every search, before the roles. "I don't know yet" on the boat-type screen
// skips the brand/model/feet/year screens (many clients look for a skipper before booking a boat).
//
// The last step is always the last role's cabin question — everything
// the results page used to ask for AFTER the wizard handed off now gets
// asked for here instead, so landing on results means there's nothing left
// to fill in, just candidates to browse and pick.
function stepsFor(roles, kind, boatUnknown = false, multiDay = true, counts = {}) {
  // Trip first (country, port, dates, party, boat), then the help the client wants (roles) and where it sleeps.
  // Gulet: no brand/model (no catalogues), feet only.
  // «Δεν ξέρω ακόμα»: μετά τον τύπο σκάφους δεν ρωτιέται τίποτα άλλο για το σκάφος.
  const boat = boatUnknown ? ["boat"] : kind === "gulet" ? ["boat", "feet", "year"] : ["boat", "brand", "model", "feet", "year"];
  // One accommodation screen for EVERY person the client asks for (two hostesses = two screens), in the fixed role order.
  // Only for a multi-day trip: a day trip has nowhere to stay.
  const cabins = multiDay
    ? CREW_ROLES.filter((r) => roles.includes(r.key)).flatMap((r) => Array.from({ length: counts[r.key] || 1 }, (_, i) => `cabin:${r.key}:${i}`))
    : [];
  return ["country", "where", "dates", "party", ...boat, "role", ...cabins];
}

const stepperBtn = {
  width: 36, height: 36, borderRadius: "50%", border: `1px solid ${colors.border}`, background: colors.card, color: colors.ink,
  fontFamily: "inherit", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
};

const KIND_ORDER = ["sail", "cat", "motor", "gulet", "other"];

const stepWrap = {
  animation: "sf-step-in 320ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
};

const option = (active) => ({
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "14px 16px",
  marginBottom: 8,
  borderRadius: radius.md,
  fontSize: 15,
  fontFamily: "inherit",
  cursor: "pointer",
  transition: "background 0.18s ease, border-color 0.18s ease",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.seaGlass : colors.card,
  color: colors.ink,
});

// Small secondary action (retry after a failed load).
const chip = (active) => ({
  padding: "8px 14px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});

const cta = { ...button("primary"), width: "100%", height: 52, padding: "0 18px", fontSize: 16, borderRadius: 12 };

function StepHeading({ children }) {
  return <h2 style={{ ...h2, fontSize: 24, marginBottom: 20 }}>{children}</h2>;
}

export default function CrewSearchFlow() {
  const router = useRouter();
  const t = useTranslations("CrewSearchFlow");
  const L = useLocalData();
  const [step, setStep] = useState(0);
  const [lookups, setLookups] = useState({ ports: [], boatTypes: [], regions: [], languages: [] });
  const [roles, setRoles] = useSessionState("sf_wizard:roles", []);
  const [dates, setDates] = useSessionState("sf_wizard:dates", { start: "", end: "" });
  const [country, setCountry] = useSessionState("sf_wizard:country", "");
  const [regionId, setRegionId] = useSessionState("sf_wizard:region", "");
  const [departurePoint, setDeparturePoint] = useSessionState("sf_wizard:from", "");
  const [arrivalPoint, setArrivalPoint] = useSessionState("sf_wizard:to", "");
  const [boatTypeId, setBoatTypeId] = useSessionState("sf_wizard:boatType", "");
  const [boatBrand, setBoatBrand] = useSessionState("sf_wizard:brand", "");
  const [boatModel, setBoatModel] = useSessionState("sf_wizard:modelName", "");
  const [partySize, setPartySize] = useSessionState("sf_wizard:party", "");
  const [boatInfo, setBoatInfo] = useSessionState("sf_wizard:boat", { model: "", lengthFt: "", year: "" });
  // null = δεν το άγγιξε: ισχύει «επιστροφή στο ίδιο λιμάνι» αν δεν υπάρχει άλλο «Προς».
  const [sameReturnRaw, setSameReturn] = useSessionState("sf_wizard:sameReturn", null);
  const sameReturn = sameReturnRaw ?? !arrivalPoint.trim();
  // Όταν αλλάζει η μάρκα αδειάζουν το μοντέλο, τα πόδια και το έτος· όταν αλλάζει το μοντέλο, τα πόδια
  // και το έτος: κανένα υπόλειμμα από προηγούμενη επιλογή (docs/DESIGN.md «Σκάφος»).
  const changeBrand = (b) => {
    if (b === boatBrand) return;
    setBoatBrand(b);
    setBoatModel("");
    setBoatInfo((cur) => ({ ...cur, lengthFt: "", year: "" }));
  };
  const changeModel = (m) => {
    if (m === boatModel) return;
    setBoatModel(m);
    setBoatInfo((cur) => ({ ...cur, lengthFt: "", year: "" }));
  };
  const [infoRole, setInfoRole] = useState(null);
  // Accommodation per person: { role: [kind of person 1, kind of person 2, …] }; counts: how many people per role.
  const [cabins, setCabins] = useSessionState("sf_wizard:cabins", {});
  const [counts, setCounts] = useSessionState("sf_wizard:counts", {});
  const countOf = (role) => counts[role] || 1;
  const setCount = (role, n) => setCounts((cur) => ({ ...cur, [role]: Math.min(MAX_POSITIONS, Math.max(1, n)) }));
  // Το πιο μακρινό βήμα που έχει ανοίξει ο χρήστης: το «μπροστά» φτάνει μέχρι εκεί.
  const [furthest, setFurthest] = useSessionState("sf_wizard:furthest", 0);

  const [lookupsError, setLookupsError] = useState(false);
  const [lookupsAttempt, setLookupsAttempt] = useState(0);

  // A failed fetch here (network hiccup, cold start) used to leave the
  // region/boat steps stuck on "Φόρτωση…" forever with no way out except
  // reloading the whole page — nothing told the visitor anything had gone
  // wrong. Retrying just bumps lookupsAttempt to re-run the effect below.
  useEffect(() => {
    let cancelled = false;
    setLookupsError(false);
    listLookups()
      .then((data) => {
        if (!cancelled) setLookups(data);
      })
      .catch(() => {
        if (!cancelled) setLookupsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lookupsAttempt]);

  // HomeEntry pushed one history entry (step 0) the moment it opened this
  // component — every step forward pushes one more on top, so the device's
  // own back button/gesture steps back through the wizard one question at a
  // time instead of leaving the whole page in a single press. Popping past
  // step 0 lands on HomeEntry's own pre-wizard entry; its matching listener
  // is what actually closes the wizard, so there's nothing left to do here
  // once a popstate carries no step number.
  useEffect(() => {
    function onPopState(e) {
      if (typeof e.state?.sfStep === "number") setStep(e.state.sfStep);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Επιστροφή με «πίσω» από άλλη οθόνη: το βήμα που ήταν ανοιχτό γράφτηκε στην εγγραφή ιστορικού.
  useEffect(() => {
    const n = window.history.state?.sfStep;
    if (typeof n === "number") setStep(n);
  }, []);

  const kind = boatKind(lookups.boatTypes.find((b) => b.id === boatTypeId)?.name || "");
  const boatUnknown = boatTypeId === BOAT_UNKNOWN;
  const multiDay = isMultiDay(dates.start, dates.end);
  const STEPS = stepsFor(roles, kind, boatUnknown, multiDay, counts);

  // The number of cabin screens depends on the roles picked ON the role step, so while standing on it
  // the total assumes one cabin screen (then switches to the real count once the client has moved past
  // it): the fraction in the header never changes underneath an answer still being chosen.
  const displaySteps = STEPS[step] === "role" ? stepsFor(roles.slice(0, 1).length ? roles.slice(0, 1) : ["skipper"], kind, boatUnknown, multiDay, {}) : STEPS;

  // Pushes history itself rather than inside a setStep updater — React
  // (StrictMode, in dev) can invoke an updater function twice per call,
  // which would push two history entries for a single "Συνέχεια" click and
  // throw the step count out of sync with the real stack.
  function next() {
    const n = Math.min(step + 1, STEPS.length - 1);
    window.history.pushState({ sfWizardOpen: true, sfStep: n }, "");
    setStep(n);
  }

  // Always the same action regardless of step — history.back() either
  // steps to the previous question (there's an entry for it) or, from step
  // 0, pops past the wizard entirely; either way the popstate handlers
  // above and in HomeEntry are what actually update the UI.
  function back() {
    window.history.back();
  }

  function toggleRole(key) {
    setRoles((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]));
  }

  function finish() {
    const params = new URLSearchParams({
      roles: roles.join(","),
      start: dates.start,
      end: dates.end,
      region: regionId,
      point: departurePoint.trim(),
      arrival: arrivalPoint.trim() || departurePoint.trim(),
      boat: boatTypeId || "",
      lang: "en", // English is assumed; the language choice comes later as an optional link on the summary
      party: partySize || "",
      cabin: multiDay ? serializeCabins(cabins, roles, counts) : "",
      pos: serializePositions(counts, roles),
      bm: boatName(boatBrand, boatModel),
      bl: boatInfo.lengthFt || "",
      by: boatInfo.year || "",
    });
    router.push(`/platform/search?${params.toString()}`);
  }

  const current = STEPS[step];

  useEffect(() => {
    setFurthest((f) => (step > f ? step : f));
  }, [step, setFurthest]);

  // Το «μπροστά» ισχύει όπου θα ίσχυε και το «Συνέχεια»: το τρέχον βήμα να
  // είναι πλήρες και το επόμενο να έχει ήδη επισκεφθεί.
  const stepDone =
    current === "role" ? roles.length > 0
    : current === "dates" ? Boolean(dates.start && dates.end && dates.end >= dates.start)
    : current === "country" ? Boolean(country)
    : current === "where" ? Boolean(departurePoint.trim())
    : current === "boat" ? Boolean(boatTypeId)
    : current?.startsWith("cabin:") ? Boolean(cabins[current.split(":")[1]]?.[Number(current.split(":")[2])])
    : true;
  const canForward = step < Math.min(furthest, STEPS.length - 1);

  return (
    <div data-sf-wizard style={{ maxWidth: 460, width: "100%", margin: "0 auto" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes sf-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-sf-step] { animation: none !important; }
        }
        /* Η ενέργεια του βήματος μένει πάντα ορατή στο κάτω μέρος της οθόνης,
           * χωρίς κύλιση για να βρεθεί. */
        .sf-step-footer {
          position: sticky; bottom: var(--sf-bnav, 0px); z-index: 5;
          margin: 24px -20px 0; padding: 20px 20px calc(16px + env(safe-area-inset-bottom));
          background: linear-gradient(to bottom, rgba(252,251,249,0) 0, ${colors.bg} 20px);
        }
        .sf-step-footer button:disabled { opacity: 1 !important; background: #D5DADF !important; color: #fff !important; cursor: not-allowed; }
      ` }} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <BackButton onClick={back} />
        {canForward && <ForwardButton onClick={next} disabled={!stepDone} />}
        <span style={{ ...muted, fontSize: 13, marginLeft: "auto" }}>
          {step + 1} / {displaySteps.length}
        </span>
      </div>

      {current === "role" && (
        <div key="role" data-sf-step style={stepWrap}>
          <StepHeading>{t("whoTitle")}</StepHeading>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {CREW_ROLES.map((r) => {
              const on = roles.includes(r.key);
              return (
                <div key={r.key} style={{ position: "relative", display: "flex" }}>
                <button
                  type="button"
                  aria-pressed={on}
                  data-role-card={r.key}
                  onClick={() => toggleRole(r.key)}
                  style={{
                    position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
                    width: "100%", minHeight: 132, padding: "18px 10px 40px", borderRadius: radius.md, fontFamily: "inherit", fontSize: 16, fontWeight: 500, cursor: "pointer",
                    transition: "background 0.18s ease, border-color 0.18s ease",
                    border: `${on ? 2 : 1}px solid ${on ? colors.ink : colors.border}`,
                    background: on ? colors.seaGlass : colors.card, color: colors.ink,
                  }}
                >
                  {on && (
                    <span style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: "50%", background: colors.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="check" size={15} stroke={2.4} />
                    </span>
                  )}
                  <Icon name={ROLE_ICON[r.key]} size={40} stroke={1.5} />
                  {t(`roleName_${r.key}`)}
                </button>
                <button
                  type="button"
                  data-role-info={r.key}
                  aria-label={t("roleInfoLabel", { role: t(`roleName_${r.key}`) })}
                  onClick={() => setInfoRole(r.key)}
                  style={{ position: "absolute", top: 2, left: 2, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: 0, background: "transparent", color: colors.inkSoft, cursor: "pointer", padding: 0 }}
                >
                  <Icon name="info" size={20} stroke={1.6} />
                </button>
                {on && (
                  <div data-role-count={r.key} style={{ position: "absolute", left: 0, right: 0, bottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                    <button type="button" aria-label={t("countLess", { role: t(`roleName_${r.key}`) })} disabled={countOf(r.key) <= 1} onClick={() => setCount(r.key, countOf(r.key) - 1)} style={stepperBtn}>−</button>
                    <output aria-live="polite" style={{ minWidth: 22, textAlign: "center", fontSize: 15, fontWeight: 600, color: colors.ink }}>{countOf(r.key)}</output>
                    <button type="button" aria-label={t("countMore", { role: t(`roleName_${r.key}`) })} disabled={countOf(r.key) >= MAX_POSITIONS} onClick={() => setCount(r.key, countOf(r.key) + 1)} style={stepperBtn}>+</button>
                  </div>
                )}
                </div>
              );
            })}
          </div>
          <RoleInfoSheet role={infoRole} label={infoRole ? t(`roleName_${infoRole}`) : ""} onClose={() => setInfoRole(null)} />
          {roles.length > 0 && (
            <div className="sf-step-footer">
              <button type="button" onClick={step === STEPS.length - 1 ? finish : next} style={cta}>
                {step === STEPS.length - 1 ? t("finish") : t("continue")}
              </button>
            </div>
          )}
        </div>
      )}

      {current === "dates" && (
        <div key="dates" data-sf-step style={stepWrap}>
          <StepHeading>{t("whenTitle")}</StepHeading>
          <DateRangeCalendar
            startDate={dates.start}
            endDate={dates.end}
            onChange={({ startDate, endDate }) => setDates({ start: startDate, end: endDate })}
          />
          <div className="sf-step-footer">
            <button type="button" disabled={!dates.start || !dates.end || dates.end < dates.start} onClick={next} style={cta}>
              {t("continue")}
            </button>
          </div>
        </div>
      )}

      {current === "country" && (
        <div key="country" data-sf-step style={stepWrap}>
          <StepHeading>{t("countryTitle")}</StepHeading>
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              style={{ ...option(country === c.code), display: "flex", alignItems: "center", gap: 12 }}
              onClick={() => {
                if (country !== c.code) {
                  setCountry(c.code);
                  setRegionId("");
                  setDeparturePoint("");
                  setArrivalPoint("");
                }
                next();
              }}
            >
              <Icon name="pin" size={22} />
              <span style={{ flex: 1 }}>{L.text(c.name)}</span>
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true" style={{ color: "#A9B3BD" }}>
                <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {current === "where" && (
        <div key="where" data-sf-step style={stepWrap}>
          <StepHeading>{t("whereTitle")}</StepHeading>
          <RouteStep
            regions={lookups.regions}
            country={country || COUNTRIES[0].code}
            from={{ regionId, point: departurePoint }}
            setFrom={({ regionId: r, point }) => {
              setRegionId(r);
              setDeparturePoint(point);
            }}
            to={arrivalPoint}
            setTo={setArrivalPoint}
            sameReturn={sameReturn}
            setSameReturn={setSameReturn}
            failed={lookupsError}
            onRetry={() => setLookupsAttempt((n) => n + 1)}
            onNext={next}
          />
        </div>
      )}

      {current === "boat" && (
        <div key="boat" data-sf-step style={stepWrap}>
          <StepHeading>{t("boatTitle")}</StepHeading>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[...lookups.boatTypes].sort((x, y) => KIND_ORDER.indexOf(boatKind(x.name)) - KIND_ORDER.indexOf(boatKind(y.name))).map((b) => {
              const k = boatKind(b.name);
              const on = boatTypeId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (boatTypeId !== b.id) {
                      setBoatBrand("");
                      setBoatModel("");
                      setBoatInfo((cur) => ({ ...cur, lengthFt: "", year: "" }));
                    }
                    setBoatTypeId(b.id);
                    next();
                  }}
                  style={{
                    position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                    minHeight: 120, padding: "16px 8px", borderRadius: radius.md, fontFamily: "inherit", fontSize: 15.5, fontWeight: 500, cursor: "pointer",
                    border: `${on ? 2 : 1}px solid ${on ? colors.ink : colors.border}`, background: on ? colors.seaGlass : colors.card, color: colors.ink,
                  }}
                >
                  <Icon name={BOAT_ICON[k] || "sail"} size={48} stroke={1.2} />
                  {k === "other" ? L.text(b.name) : t(`kind_${k}`)}
                </button>
              );
            })}
            {lookups.boatTypes.length > 0 && (
              <button
                type="button"
                data-boat-unknown
                aria-pressed={boatUnknown}
                onClick={() => {
                  if (!boatUnknown) {
                    setBoatBrand("");
                    setBoatModel("");
                    setBoatInfo((cur) => ({ ...cur, lengthFt: "", year: "" }));
                  }
                  setBoatTypeId(BOAT_UNKNOWN);
                  next();
                }}
                style={{
                  position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                  minHeight: 120, padding: "16px 8px", borderRadius: radius.md, fontFamily: "inherit", fontSize: 15.5, fontWeight: 500, cursor: "pointer",
                  border: `${boatUnknown ? 2 : 1}px solid ${boatUnknown ? colors.ink : colors.border}`, background: boatUnknown ? colors.seaGlass : colors.card, color: colors.ink,
                }}
              >
                <Icon name="question" size={48} stroke={1.2} />
                {t("boatUnknown")}
              </button>
            )}
          </div>
          {lookups.boatTypes.length === 0 && lookupsError && (
            <div>
              <p style={{ ...muted, color: colors.danger }}>{t("boatTypesFailed")}</p>
              <button type="button" style={chip(false)} onClick={() => setLookupsAttempt((n) => n + 1)}>
                {t("retry")}
              </button>
            </div>
          )}
          {lookups.boatTypes.length === 0 && !lookupsError && <p style={muted}>{t("boatTypesLoading")}</p>}
        </div>
      )}

      {current === "brand" && (
        <div key="brand" data-sf-step style={stepWrap}>
          <StepHeading>{t("brandTitle")}</StepHeading>
          <BrandStep kind={kind} brand={boatBrand} setBrand={changeBrand} onNext={next} />
        </div>
      )}

      {current === "model" && (
        <div key="model" data-sf-step style={stepWrap}>
          <StepHeading>{t("modelTitle")}</StepHeading>
          <ModelStep kind={kind} brand={boatBrand} model={boatModel} setModel={changeModel} onNext={next} />
        </div>
      )}

      {current === "feet" && (
        <div key="feet" data-sf-step style={stepWrap}>
          <StepHeading>{t("feetTitle")}</StepHeading>
          <FeetStep kind={kind} brand={boatBrand} model={boatModel} feet={boatInfo.lengthFt} setFeet={(v) => setBoatInfo((cur) => ({ ...cur, lengthFt: v }))} onNext={next} />
        </div>
      )}

      {current === "year" && (
        <div key="year" data-sf-step style={stepWrap}>
          <StepHeading>{t("yearTitle")}</StepHeading>
          <YearStep kind={kind} brand={boatBrand} model={boatModel} year={boatInfo.year} setYear={(v) => setBoatInfo((cur) => ({ ...cur, year: v }))} onNext={next} />
        </div>
      )}

      {current === "party" && (
        <div key="party" data-sf-step style={stepWrap}>
          <StepHeading>{t("partyTitle")}</StepHeading>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, padding: "24px 0 8px" }}>
            <span style={{ color: colors.ink }}><Icon name="users" size={64} stroke={1.3} /></span>
            <Counter value={partySize || "2"} onChange={(n) => setPartySize(String(n))} min={1} max={50} ariaValue={t("partyTitle")} />
          </div>
          <div className="sf-step-footer">
            <button type="button" onClick={() => { if (!partySize) setPartySize("2"); next(); }} style={cta}>
              {t("continue")}
            </button>
          </div>
        </div>
      )}

      {current?.startsWith("cabin:") && (() => {
        const [, cRole, cIdx] = current.split(":");
        const idx = Number(cIdx);
        const total = countOf(cRole);
        const chosen = cabins[cRole]?.[idx] || "";
        return (
          <div key={current} data-sf-step style={stepWrap}>
            <StepHeading>
              {t(`cabinTitle_${cRole}`)}
              {total > 1 && <span data-cabin-ordinal style={{ display: "block", ...muted, fontSize: 15, fontWeight: 400, marginTop: 6 }}>{t("cabinOrdinal", { n: idx + 1, total })}</span>}
            </StepHeading>
            <CabinChoice
              value={chosen}
              onChange={(k) => {
                setCabins((cur) => {
                  const arr = Array.isArray(cur[cRole]) ? [...cur[cRole]] : [];
                  arr[idx] = k;
                  return { ...cur, [cRole]: arr };
                });
                // Στο τελευταίο βήμα η επιλογή δεν προχωρά μόνη της: ακολουθεί «Ολοκλήρωση».
                if (step < STEPS.length - 1) next();
              }}
            />
            {step === STEPS.length - 1 && (
              <div className="sf-step-footer">
                <button type="button" disabled={!chosen} onClick={finish} style={cta}>
                  {t("finish")}
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
