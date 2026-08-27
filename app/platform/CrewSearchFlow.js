"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listLookups } from "../../lib/platform/db";
import DateRangeCalendar from "./components/DateRangeCalendar";
import { CREW_ROLES } from "../../lib/platform/roles";
import { Mark } from "./components/Logo";
import { button, colors, muted, radius, h2 } from "../../lib/platform/theme";

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
// results instead of asking a question that has no right answer for it.
function stepsFor(roles) {
  const base = ["role", "dates", "country", "region", "port"];
  return roles.includes("skipper") ? [...base, "boat"] : base;
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

function StepHeading({ children }) {
  return <h2 style={{ ...h2, fontSize: 24, marginBottom: 20 }}>{children}</h2>;
}

export default function CrewSearchFlow({ onCancel }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [lookups, setLookups] = useState({ ports: [], boatTypes: [], regions: [] });
  const [roles, setRoles] = useState([]);
  const [dates, setDates] = useState({ start: "", end: "" });
  const [regionId, setRegionId] = useState("");
  const [portId, setPortId] = useState("");

  useEffect(() => {
    listLookups().then(setLookups).catch(() => {});
  }, []);

  const STEPS = stepsFor(roles);

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    if (step === 0) return onCancel?.();
    setStep((s) => s - 1);
  }

  function toggleRole(key) {
    setRoles((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]));
  }

  // portOverride exists because the port step, when it's the last one (no
  // "boat" step after it), calls finish() in the same handler that sets
  // portId — and state set there isn't visible yet through the closure.
  function finish(boatTypeId, portOverride) {
    const params = new URLSearchParams({
      roles: roles.join(","),
      start: dates.start,
      end: dates.end,
      port: portOverride ?? portId,
      boat: boatTypeId || "",
    });
    router.push(`/platform/search?${params.toString()}`);
  }

  // The region step already narrowed this down — no need to re-group by
  // region here, just the ports that actually belong to the chosen one.
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
                  setPortId("");
                  next();
                }}
              >
                {r.name}
              </button>
            ))}
            {lookups.regions.length === 0 && <p style={muted}>Φόρτωση περιοχών…</p>}
          </div>
        </div>
      )}

      {current === "port" && (
        <div key="port" data-sf-step style={stepWrap}>
          <StepHeading>Από ποιο λιμάνι;</StepHeading>
          <div style={{ maxHeight: 380, overflowY: "auto", marginBottom: 20 }}>
            {portsInRegion.map((p) => (
              <button
                key={p.id}
                type="button"
                style={option(portId === p.id)}
                onClick={() => {
                  setPortId(p.id);
                  // "boat" is only in STEPS when the search includes
                  // skipper — otherwise port is the last question, so
                  // finish straight from here instead of advancing into
                  // a step that isn't there.
                  if (STEPS.includes("boat")) next();
                  else finish(null, p.id);
                }}
              >
                {p.name}
              </button>
            ))}
            {portsInRegion.length === 0 && <p style={muted}>Δεν υπάρχουν λιμάνια σε αυτή την περιοχή ακόμα.</p>}
          </div>
        </div>
      )}

      {current === "boat" && (
        <div key="boat" data-sf-step style={stepWrap}>
          <StepHeading>Τι σκάφος;</StepHeading>
          {lookups.boatTypes.map((b) => (
            <button key={b.id} type="button" style={option(false)} onClick={() => finish(b.id)}>
              {b.name}
            </button>
          ))}
          {lookups.boatTypes.length === 0 && <p style={muted}>Φόρτωση τύπων σκάφους…</p>}
        </div>
      )}
    </div>
  );
}
