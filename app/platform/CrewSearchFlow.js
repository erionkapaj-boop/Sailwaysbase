"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listLookups } from "../../lib/platform/db";
import { CREW_ROLES } from "../../lib/platform/roles";
import { button, colors, input, label, muted, radius, h2 } from "../../lib/platform/theme";

// Progressive disclosure (brief §4): one question on screen at a time, gentle
// fade/slide between them — never the whole form at once.
const STEPS = ["role", "dates", "port", "boat"];

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
  const [lookups, setLookups] = useState({ ports: [], boatTypes: [] });
  const [roles, setRoles] = useState([]);
  const [dates, setDates] = useState({ start: "", end: "" });
  const [portId, setPortId] = useState("");

  useEffect(() => {
    listLookups().then(setLookups).catch(() => {});
  }, []);

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

  function finish(boatTypeId) {
    const params = new URLSearchParams({
      roles: roles.join(","),
      start: dates.start,
      end: dates.end,
      port: portId,
      boat: boatTypeId,
    });
    router.push(`/platform/search?${params.toString()}`);
  }

  // Ports arrive ordered by tier then region from the query; group them so the
  // list reads by area instead of as one long flat run.
  const portsByRegion = lookups.ports.reduce((acc, p) => {
    const key = p.region || "Άλλα";
    (acc[key] ||= []).push(p);
    return acc;
  }, {});

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
          <label style={label} htmlFor="sf-start">
            Από
          </label>
          <input
            id="sf-start"
            type="date"
            style={{ ...input, marginBottom: 16 }}
            value={dates.start}
            onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))}
          />
          <label style={label} htmlFor="sf-end">
            Έως
          </label>
          <input
            id="sf-end"
            type="date"
            style={{ ...input, marginBottom: 24 }}
            min={dates.start || undefined}
            value={dates.end}
            onChange={(e) => setDates((d) => ({ ...d, end: e.target.value }))}
          />
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

      {current === "port" && (
        <div key="port" data-sf-step style={stepWrap}>
          <StepHeading>Από ποιο λιμάνι;</StepHeading>
          <div style={{ maxHeight: 380, overflowY: "auto", marginBottom: 20 }}>
            {Object.entries(portsByRegion).map(([region, ports]) => (
              <div key={region} style={{ marginBottom: 14 }}>
                <div style={{ ...muted, fontSize: 12, marginBottom: 8 }}>{region}</div>
                {ports.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={option(portId === p.id)}
                    onClick={() => {
                      setPortId(p.id);
                      next();
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ))}
            {lookups.ports.length === 0 && <p style={muted}>Φόρτωση λιμανιών…</p>}
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
