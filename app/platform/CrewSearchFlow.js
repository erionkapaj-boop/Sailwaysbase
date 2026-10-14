"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { listLookups } from "../../lib/platform/db";
import DateRangeCalendar from "./components/DateRangeCalendar";
import { CREW_ROLES } from "../../lib/platform/roles";
import BackButton from "./components/BackButton";
import PlacePicker from "./components/PlacePicker";
import { Mark } from "./components/Logo";
import { useLocalData } from "./useLocalData";
import { COUNTRIES } from "../../lib/platform/places";
import BoatFields from "./components/BoatFields";
import { boatValid } from "../../lib/platform/boat";
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
// The "boat" step only makes sense when the search includes skipper: a boat
// type is what a skipper operates, and hostess (or any future non-skipper
// role) doesn't have one. A hostess-only search skips straight from "where" to
// "extras" instead of asking a question that has no right answer for it.
//
// "extras" (language/party size/private cabin) is always last — everything
// the results page used to ask for AFTER the wizard handed off now gets
// asked for here instead, so landing on results means there's nothing left
// to fill in, just candidates to browse and pick.
function stepsFor(roles) {
  const base = ["role", "country", "where", "dates"];
  const withBoat = roles.includes("skipper") ? [...base, "boat"] : base;
  return [...withBoat, "extras"];
}

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
  const [roles, setRoles] = useState([]);
  const [dates, setDates] = useState({ start: "", end: "" });
  const [country, setCountry] = useState("");
  const [regionId, setRegionId] = useState("");
  const [departurePoint, setDeparturePoint] = useState("");
  const [arrivalPoint, setArrivalPoint] = useState("");
  const [sameDestination, setSameDestination] = useState(true);
  const [pickingPlace, setPickingPlace] = useState(true);
  const [boatTypeId, setBoatTypeId] = useState("");
  const [languageId, setLanguageId] = useState("");
  const [partySize, setPartySize] = useState("");
  const [boatInfo, setBoatInfo] = useState({ model: "", lengthFt: "", year: "" });
  const [privateCabin, setPrivateCabin] = useState(undefined);

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

  const STEPS = stepsFor(roles);

  // Picking "skipper" adds a "boat" step further on — recalculating the
  // total live off `roles` made the fraction in the header change the
  // instant a role got tapped, while the client was still standing on that
  // same question. Assuming the longer, skipper-included count while still
  // on the role step (then switching to the real one once they've moved
  // past it, where `roles` is fixed for the rest of the flow) means the
  // number only ever changes on the way to the next screen, not underneath
  // an answer they're still choosing.
  const displaySteps = step === 0 ? stepsFor(roles.includes("skipper") ? roles : [...roles, "skipper"]) : STEPS;

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
      arrival: sameDestination ? departurePoint.trim() : arrivalPoint.trim(),
      boat: boatTypeId || "",
      lang: languageId || "",
      party: partySize || "",
      cabin: privateCabin === undefined ? "" : String(privateCabin),
      bm: boatInfo.model.trim(),
      bl: boatInfo.lengthFt || "",
      by: boatInfo.year || "",
    });
    router.push(`/platform/search?${params.toString()}`);
  }

  const current = STEPS[step];

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
          position: sticky; bottom: 0; z-index: 5;
          margin: 24px -20px 0; padding: 20px 20px calc(16px + env(safe-area-inset-bottom));
          background: linear-gradient(to bottom, rgba(252,251,249,0) 0, ${colors.bg} 20px);
        }
        .sf-step-footer button:disabled { opacity: 1 !important; background: #D5DADF !important; color: #fff !important; cursor: not-allowed; }
      ` }} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <BackButton onClick={back} />
        <span style={{ ...muted, fontSize: 13, marginLeft: "auto" }}>
          {step + 1} / {displaySteps.length}
        </span>
      </div>

      {current === "role" && (
        <div key="role" data-sf-step style={stepWrap}>
          <StepHeading>{t("whoTitle")}</StepHeading>
          {CREW_ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              style={option(roles.includes(r.key))}
              onClick={() => toggleRole(r.key)}
            >
              {r.label}
              {r.blurb && (
                <span style={{ ...muted, display: "block", fontSize: 12.5, fontWeight: 400, marginTop: 2 }}>
                  {r.blurb}
                </span>
              )}
            </button>
          ))}
          <p style={{ ...muted, fontSize: 13, margin: "12px 0 0" }}>
            {t("whoHint")}
          </p>
          <div className="sf-step-footer">
            <button type="button" disabled={roles.length === 0} onClick={next} style={cta}>
              {t("continue")}
            </button>
          </div>
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
                  setSameDestination(true);
                }
                next();
              }}
            >
              <Mark size={22} />
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
          <StepHeading>{t("fromTitle")}</StepHeading>
          <PlacePicker
            regions={lookups.regions}
            country={country || COUNTRIES[0].code}
            value={{ regionId, point: departurePoint }}
            onChange={({ regionId: r, point }) => {
              setRegionId(r);
              setDeparturePoint(point);
            }}
            autoFocus
            onEditingChange={setPickingPlace}
            failed={lookupsError}
            onRetry={() => setLookupsAttempt((n) => n + 1)}
          />

          {regionId && !pickingPlace && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, margin: "20px 0 0", minHeight: 44, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  style={{ width: 18, height: 18, accentColor: colors.ink }}
                  checked={!sameDestination}
                  onChange={(e) => {
                    const different = e.target.checked;
                    setSameDestination(!different);
                    if (!different) setArrivalPoint("");
                  }}
                />
                {t("endsElsewhere")}
              </label>

              {!sameDestination && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ ...muted, fontSize: 13, margin: "0 0 8px" }}>{t("whereEnds")}</p>
                  <PlacePicker mode="arrival" regions={lookups.regions} value={arrivalPoint} onChange={setArrivalPoint} autoFocus />
                </div>
              )}
            </>
          )}

          <div className="sf-step-footer">
            <button
              type="button"
              disabled={pickingPlace || !regionId || !departurePoint.trim() || (!sameDestination && !arrivalPoint.trim())}
              onClick={next}
              style={cta}
            >
              {t("continue")}
            </button>
          </div>
        </div>
      )}

      {current === "boat" && (
        <div key="boat" data-sf-step style={stepWrap}>
          <StepHeading>{t("boatTitle")}</StepHeading>
          {lookups.boatTypes.map((b) => (
            <button
              key={b.id}
              type="button"
              style={option(boatTypeId === b.id)}
              onClick={() => {
                setBoatTypeId(b.id);
                next();
              }}
            >
              {L.text(b.name)}
            </button>
          ))}
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

      {current === "extras" && (
        <div key="extras" data-sf-step style={stepWrap}>
          <StepHeading>{t("extrasTitle")}</StepHeading>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>{t("languageLabel")}</label>
            <select style={select} value={languageId} onChange={(e) => setLanguageId(e.target.value)}>
              <option value="">{t("languageAny")}</option>
              {lookups.languages.map((l) => (
                <option key={l.id} value={l.id}>
                  {L.text(l.name)}
                </option>
              ))}
            </select>
            <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
              {t("languageHint")}
            </p>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>{t("partyLabel")}</label>
            <input
              type="number"
              min={1}
              style={input}
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
            />
            <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
              {t("partyHint")}
            </p>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={label}>{t("cabinLabel")}</label>
            <select
              style={select}
              value={privateCabin === undefined ? "" : String(privateCabin)}
              onChange={(e) => setPrivateCabin(e.target.value === "true")}
            >
              <option value="">{t("cabinChoose")}</option>
              <option value="true">{t("yes")}</option>
              <option value="false">{t("no")}</option>
            </select>
            <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
              {t("cabinHint")}
            </p>
          </div>
          <div style={{ marginBottom: 24 }}>
            <BoatFields idPrefix="wz-boat" value={boatInfo} onChange={(p) => setBoatInfo((cur) => ({ ...cur, ...p }))} />
          </div>
          <div className="sf-step-footer">
            {(!partySize || privateCabin === undefined) && (
              <p style={{ ...muted, fontSize: 12.5, margin: "0 0 10px", textAlign: "center" }}>
                {!partySize && privateCabin === undefined
                  ? t("missingBoth")
                  : !partySize
                    ? t("missingParty")
                    : t("missingCabin")}
              </p>
            )}
            <button type="button" disabled={!partySize || privateCabin === undefined || !boatValid(boatInfo)} onClick={finish} style={cta}>
              {t("finish")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
