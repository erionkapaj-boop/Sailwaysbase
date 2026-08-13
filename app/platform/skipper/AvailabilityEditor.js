"use client";
import { useEffect, useState } from "react";
import {
  listAvailabilityWindows,
  addAvailabilityWindow,
  removeAvailabilityWindow,
  listLookups,
} from "../../../lib/platform/db";
import { card, h2, muted, button, input, label, colors, radius, money, badge } from "../../../lib/platform/theme";

const chip = (active) => ({
  padding: "8px 14px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});

const EMPTY = { startDate: "", endDate: "", allPorts: false, portIds: [] };

export default function AvailabilityEditor({ skipperId, onChanged }) {
  const [windows, setWindows] = useState([]);
  const [ports, setPorts] = useState([]);
  const [draft, setDraft] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setWindows(await listAvailabilityWindows(skipperId));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  useEffect(() => {
    load();
    listLookups().then((l) => setPorts(l.ports)).catch(() => {});
  }, [skipperId]);

  function togglePort(id) {
    setDraft((d) => ({
      ...d,
      portIds: d.portIds.includes(id) ? d.portIds.filter((p) => p !== id) : [...d.portIds, id],
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!draft.allPorts && draft.portIds.length === 0) {
      setError("Διάλεξε τουλάχιστον ένα λιμάνι, ή «Από οπουδήποτε».");
      return;
    }
    setBusy(true);
    try {
      await addAvailabilityWindow(skipperId, draft);
      setDraft(EMPTY);
      setAdding(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    try {
      await removeAvailabilityWindow(id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const portsByRegion = ports.reduce((acc, p) => {
    (acc[p.region || "Άλλα"] ||= []).push(p);
    return acc;
  }, {});

  const today = new Date().toISOString().slice(0, 10);
  const past = (w) => w.end_date < today;

  return (
    <div style={card}>
      <h2 style={{ ...h2, fontSize: 17 }}>Διαθεσιμότητα</h2>
      <p style={{ ...muted, fontSize: 13, margin: "0 0 16px" }}>
        Δήλωσε πότε είσαι διαθέσιμος <b>και από πού</b>. Οι πελάτες σε βρίσκουν μόνο για τις
        ημερομηνίες και τα λιμάνια που έχεις δηλώσει εδώ.
      </p>

      {windows.length === 0 && (
        <p style={{ ...muted, marginBottom: 16 }}>
          Δεν έχεις δηλώσει διαθεσιμότητα — προς το παρόν δεν εμφανίζεσαι σε καμία αναζήτηση.
        </p>
      )}

      {windows.map((w) => (
        <div
          key={w.id}
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            padding: 14,
            marginBottom: 10,
            opacity: past(w) ? 0.55 : 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 500 }}>
                <span style={money}>{w.start_date}</span> → <span style={money}>{w.end_date}</span>
                {past(w) && <span style={{ ...muted, fontWeight: 400 }}> · πέρασε</span>}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {w.all_ports ? (
                  <span style={badge("brand")}>Από οπουδήποτε</span>
                ) : (
                  (w.availability_window_ports || []).map((p) => (
                    <span
                      key={p.port_id}
                      style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}
                    >
                      {p.ports?.name}
                    </span>
                  ))
                )}
              </div>
            </div>
            <button
              type="button"
              style={{ ...button("secondary"), alignSelf: "flex-start" }}
              disabled={busy}
              onClick={() => remove(w.id)}
            >
              Διαγραφή
            </button>
          </div>
        </div>
      ))}

      {!adding && (
        <button type="button" style={{ ...button("secondary"), marginTop: 6 }} onClick={() => setAdding(true)}>
          + Προσθήκη διαστήματος
        </button>
      )}

      {adding && (
        <form
          onSubmit={submit}
          style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 16, marginTop: 10 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12 }}>
            <div>
              <label style={label} htmlFor="av-start">
                Από
              </label>
              <input
                id="av-start"
                type="date"
                required
                style={input}
                value={draft.startDate}
                onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label style={label} htmlFor="av-end">
                Έως
              </label>
              <input
                id="av-end"
                type="date"
                required
                min={draft.startDate || undefined}
                style={input}
                value={draft.endDate}
                onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <span style={label}>Από πού</span>
            <button
              type="button"
              style={{ ...chip(draft.allPorts), marginBottom: 10 }}
              onClick={() => setDraft((d) => ({ ...d, allPorts: !d.allPorts, portIds: [] }))}
            >
              Από οπουδήποτε
            </button>

            {!draft.allPorts && (
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {Object.entries(portsByRegion).map(([region, list]) => (
                  <div key={region} style={{ marginBottom: 12 }}>
                    <div style={{ ...muted, fontSize: 12, marginBottom: 6 }}>{region}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {list.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          style={chip(draft.portIds.includes(p.id))}
                          onClick={() => togglePort(p.id)}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" disabled={busy} style={button("primary")}>
              {busy ? "Αποθήκευση…" : "Αποθήκευση"}
            </button>
            <button
              type="button"
              style={button("secondary")}
              onClick={() => {
                setAdding(false);
                setDraft(EMPTY);
                setError("");
              }}
            >
              Άκυρο
            </button>
          </div>
        </form>
      )}

      {error && !adding && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}
    </div>
  );
}
