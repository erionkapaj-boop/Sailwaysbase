"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listLookups } from "../../lib/platform/db";
import { CREW_ROLES } from "../../lib/platform/roles";
import { card, muted, button, input, label, colors, radius, shadow } from "../../lib/platform/theme";

const chip = (active) => ({
  padding: "8px 16px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "#fff",
  color: active ? "#fff" : colors.ink,
});

export default function HomeSearchForm() {
  const router = useRouter();
  const [lookups, setLookups] = useState({ ports: [], boatTypes: [] });
  const [roles, setRoles] = useState(["skipper"]);
  const [form, setForm] = useState({ startDate: "", endDate: "", portId: "", boatTypeId: "" });

  useEffect(() => {
    listLookups().then(setLookups).catch(() => {});
  }, []);

  function toggleRole(key) {
    setRoles((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const params = new URLSearchParams({
      roles: roles.join(","),
      start: form.startDate,
      end: form.endDate,
      port: form.portId,
      boat: form.boatTypeId,
    });
    router.push(`/platform/search?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 24, boxShadow: shadow.raised, marginBottom: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <span style={label}>Ποιον ψάχνεις</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CREW_ROLES.map((r) => (
            <button key={r.key} type="button" style={chip(roles.includes(r.key))} onClick={() => toggleRole(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        <div>
          <label style={label} htmlFor="home-start">
            Από
          </label>
          <input
            id="home-start"
            type="date"
            required
            style={input}
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </div>
        <div>
          <label style={label} htmlFor="home-end">
            Έως
          </label>
          <input
            id="home-end"
            type="date"
            required
            style={input}
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
        </div>
        <div>
          <label style={label} htmlFor="home-port">
            Λιμάνι / περιοχή
          </label>
          <select
            id="home-port"
            required
            style={input}
            value={form.portId}
            onChange={(e) => setForm((f) => ({ ...f, portId: e.target.value }))}
          >
            <option value="">Επιλογή…</option>
            {lookups.ports.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.region ? ` — ${p.region}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="home-boat">
            Τύπος σκάφους
          </label>
          <select
            id="home-boat"
            required
            style={input}
            value={form.boatTypeId}
            onChange={(e) => setForm((f) => ({ ...f, boatTypeId: e.target.value }))}
          >
            <option value="">Επιλογή…</option>
            {lookups.boatTypes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={roles.length === 0}
        style={{ ...button("primary"), width: "100%", marginTop: 20, padding: "12px 18px", fontSize: 15 }}
      >
        Αναζήτηση
      </button>
    </form>
  );
}
