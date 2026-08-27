"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listLookups } from "../../lib/platform/db";
import DateRangeCalendar from "./components/DateRangeCalendar";
import { CREW_ROLES } from "../../lib/platform/roles";
import { Mark } from "./components/Logo";
import { button, colors, input, label, muted, radius, select, h2 } from "../../lib/platform/theme";

// Progressive disclosure (brief §4): one question on screen at a time, gentle
// fade/slide between them — never the whole form at once.
//
// "country" exists as its own step even though Greece is the only option
// today — the regions table was always meant to grow beyond one country
// (see its own seed comment), so the step is there to grow into rather than
// retrofit later.
//
// The "boat" step only makes sense when the search includes skipper: a boat
// type is what a skipper operates, and hostess (or any future non-skipper
// role) doesn't have one. A hostess-only search skips straight from port to
// "extras" instead of asking a question that has no right answer for it.
//
// "extras" (language/party size/private cabin) is always last — everything
// the results page used to ask for AFTER the wizard handed off now gets
// asked for here instead, so landing on results means there's nothing left
// to fill in, just candidates to browse and pick.
function stepsFor(roles) {
  const base = ["role", "dates", "country", "region", "port"];
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

// Quick picks for the region's main ports, sitting above the free-text
// field — a tap fills the same field a keystroke would, it just saves the
// typing for the common cases (see chip() in AvailabilityCalendar for the
// same pattern applied to region selection).
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

function StepHeading({ children }) {
  return <h2 style={{ ...h2, fontSize: 24, marginBottom: 20 }}>{children}</h2>;
}

export default function CrewSearchFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [lookups, setLookups] = useState({ ports: [], boatTypes: [], regions: [], languages: [] });
  const [roles, setRoles] = useState([]);
  const [dates, setDates] = useState({ start: "", end: "" });
  const [regionId, setRegionId] = useState("");
  const [departurePoint, setDeparturePoint] = useState("");
  const [boatTypeId, setBoatTypeId] = useState("");
  const [languageId, setLanguageId] = useState("");
  const [partySize, setPartySize] = useState("");
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
      boat: boatTypeId || "",
      lang: languageId || "",
      party: partySize || "",
      cabin: privateCabin === undefined ? "" : String(privateCabin),
    });
    router.push(`/platform/search?${params.toString()}`);
  }

  // The region step already narrowed this down — just the curated ports that
  // actually belong to the chosen one, offered as quick picks. The catalog
  // never has to be complete: whatever isn't listed is exactly what the
  // free-text field below is for.
  const portsInRegion = lookups.ports.filter((p) => p.region_id === regionId);

  const current = STEPS[step];

  return (
    <div style={{ maxWidth: 460, margin: "0 auto" }}>
      <style>{`
        @keyframes sf-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-sf-step] { animation: none !important; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={back}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: colors.inkSoft,
            fontSize: 14,
            fontFamily: "inherit",
          }}
        >
          ← Πίσω
        </button>
        <span style={{ ...muted, fontSize: 13, marginLeft: "auto" }}>
          {step + 1} / {STEPS.length}
        </span>
      </div>

      {current === "role" && (
        <div key="role" data-sf-step style={stepWrap}>
          <StepHeading>Ποιον ψάχνεις;</StepHeading>
          {CREW_ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              style={option(roles.includes(r.key))}
              onClick={() => toggleRole(r.key)}
            >
              {r.label}
            </button>
          ))}
          <p style={{ ...muted, fontSize: 13, margin: "12px 0 20px" }}>
            Μπορείς να επιλέξεις περισσότερους από έναν.
          </p>
          <button
            type="button"
            disabled={roles.length === 0}
            onClick={next}
            style={{ ...button("primary"), width: "100%", padding: "13px 18px", fontSize: 15 }}
          >
            Συνέχεια
          </button>
        </div>
      )}

      {current === "dates" && (
        <div key="dates" data-sf-step style={stepWrap}>
          <StepHeading>Πότε;</StepHeading>
          <div style={{ marginBottom: 24 }}>
            <DateRangeCalendar
              startDate={dates.start}
              endDate={dates.end}
              onChange={({ startDate, endDate }) => setDates({ start: startDate, end: endDate })}
            />
          </div>
          <button
            type="button"
            disabled={!dates.start || !dates.end || dates.end < dates.start}
            onClick={next}
            style={{ ...button("primary"), width: "100%", padding: "13px 18px", fontSize: 15 }}
          >
            Συνέχεια
          </button>
        </div>
      )}

      {current === "country" && (
        <div key="country" data-sf-step style={stepWrap}>
          <StepHeading>Ποια χώρα;</StepHeading>
          <button
            type="button"
            onClick={next}
            style={{
              ...option(true),
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Mark size={22} />
            Ελλάδα
          </button>
        </div>
      )}

      {current === "region" && (
        <div key="region" data-sf-step style={stepWrap}>
          <StepHeading>Ποια περιοχή;</StepHeading>
          <div style={{ maxHeight: 380, overflowY: "auto", marginBottom: 20 }}>
            {lookups.regions.map((r) => (
              <button
                key={r.id}
                type="button"
                style={option(regionId === r.id)}
                onClick={() => {
                  setRegionId(r.id);
                  setDeparturePoint("");
                  next();
                }}
              >
                {r.name}
              </button>
            ))}
            {lookups.regions.length === 0 && lookupsError && (
              <div>
                <p style={{ ...muted, color: colors.danger }}>Κάτι πήγε στραβά κατά τη φόρτωση των περιοχών.</p>
                <button type="button" style={chip(false)} onClick={() => setLookupsAttempt((n) => n + 1)}>
                  Δοκίμασε ξανά
                </button>
              </div>
            )}
            {lookups.regions.length === 0 && !lookupsError && <p style={muted}>Φόρτωση περιοχών…</p>}
          </div>
        </div>
      )}

      {current === "port" && (
        <div key="port" data-sf-step style={stepWrap}>
          <StepHeading>Από πού φεύγεις;</StepHeading>
          {portsInRegion.length > 0 && (
            <>
              <p style={{ ...muted, fontSize: 13, margin: "-8px 0 10px" }}>Βασικά λιμάνια της περιοχής:</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                {portsInRegion.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={chip(departurePoint === p.name)}
                    onClick={() => setDeparturePoint(p.name)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <p style={{ ...muted, fontSize: 13, margin: "0 0 8px" }}>
            Ή γράψε το ακριβές σημείο αναχώρησης — λιμάνι, όρμος, ό,τι θέλεις (π.χ. Καλλιθέα, Αίγινα).
          </p>
          <input
            type="text"
            style={{ ...input, marginBottom: 20 }}
            placeholder="π.χ. Καλλιθέα"
            value={departurePoint}
            onChange={(e) => setDeparturePoint(e.target.value)}
          />
          <button
            type="button"
            disabled={!departurePoint.trim()}
            onClick={next}
            style={{ ...button("primary"), width: "100%", padding: "13px 18px", fontSize: 15 }}
          >
            Συνέχεια
          </button>
        </div>
      )}

      {current === "boat" && (
        <div key="boat" data-sf-step style={stepWrap}>
          <StepHeading>Τι σκάφος;</StepHeading>
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
              {b.name}
            </button>
          ))}
          {lookups.boatTypes.length === 0 && lookupsError && (
            <div>
              <p style={{ ...muted, color: colors.danger }}>Κάτι πήγε στραβά κατά τη φόρτωση των τύπων σκάφους.</p>
              <button type="button" style={chip(false)} onClick={() => setLookupsAttempt((n) => n + 1)}>
                Δοκίμασε ξανά
              </button>
            </div>
          )}
          {lookups.boatTypes.length === 0 && !lookupsError && <p style={muted}>Φόρτωση τύπων σκάφους…</p>}
        </div>
      )}

      {current === "extras" && (
        <div key="extras" data-sf-step style={stepWrap}>
          <StepHeading>Λίγες τελευταίες λεπτομέρειες</StepHeading>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Γλώσσα (προαιρετικό)</label>
            <select style={select} value={languageId} onChange={(e) => setLanguageId(e.target.value)}>
              <option value="">Αδιάφορο</option>
              {lookups.languages.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
              Θα δεις μόνο επαγγελματίες που μιλάνε αυτή τη γλώσσα.
            </p>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Αριθμός ατόμων</label>
            <input
              type="number"
              min={1}
              style={input}
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
            />
            <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
              Πόσα άτομα θα είναι συνολικά στο ταξίδι — το βλέπει ο επαγγελματίας πριν αποφασίσει.
            </p>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={label}>Ιδιωτική καμπίνα για τον επαγγελματία</label>
            <select
              style={select}
              value={privateCabin === undefined ? "" : String(privateCabin)}
              onChange={(e) => setPrivateCabin(e.target.value === "true")}
            >
              <option value="">Επιλογή...</option>
              <option value="true">Ναι</option>
              <option value="false">Όχι</option>
            </select>
          </div>
          <button
            type="button"
            disabled={!partySize || privateCabin === undefined}
            onClick={finish}
            style={{ ...button("primary"), width: "100%", padding: "13px 18px", fontSize: 15 }}
          >
            Ολοκλήρωση
          </button>
        </div>
      )}
    </div>
  );
}
