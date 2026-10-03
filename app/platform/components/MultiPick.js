"use client";
import { useId, useMemo, useState } from "react";
import { colors, muted } from "../../../lib/platform/theme";

// Πολλαπλή επιλογή από μεγάλη λίστα (π.χ. γλώσσες) χωρίς σύννεφο από κουμπιά
// (docs/DESIGN.md, κανόνας 1): οι επιλεγμένες ως λίγα tags με «×», από κάτω
// αναζήτηση, και πριν γράψει κανείς οι πιο συχνές επιλογές ως γραμμές.
//
// options: [{ id, name }] · value: [id] · onChange(ids) · common: [name] (σειρά)

const CSS = `
.sf-mp-tag { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 6px 0 12px; border-radius: 999px;
  background: ${colors.seaGlass}; color: ${colors.ink}; font-size: 14px; border: 1px solid #DDE5E3; }
.sf-mp-x { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 0; border-radius: 50%;
  background: none; color: ${colors.inkSoft}; cursor: pointer; font: inherit; font-size: 16px; line-height: 1; }
.sf-mp-x:hover { background: rgba(22,40,60,0.07); color: ${colors.ink}; }
.sf-mp-x:focus-visible { outline: 2px solid ${colors.ink}; outline-offset: 1px; }
.sf-mp-input { width: 100%; height: 48px; box-sizing: border-box; padding: 0 14px 0 42px; border-radius: 12px; border: 1px solid ${colors.border};
  background: ${colors.card}; color: ${colors.ink}; font: inherit; font-size: 16px; transition: border-color .15s ease, box-shadow .15s ease; }
.sf-mp-input::placeholder { color: #9AA7B3; }
.sf-mp-input:focus, .sf-mp-input:focus-visible { outline: none !important; border-color: ${colors.ink}; box-shadow: 0 0 0 4px rgba(22,40,60,0.07); }
.sf-mp-list { margin: 8px 0 0; padding: 0; list-style: none; border: 1px solid ${colors.border}; border-radius: 12px; overflow: hidden; background: ${colors.card}; }
.sf-mp-row { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 46px; padding: 0 14px; border: 0;
  border-top: 1px solid #F1EEE8; background: none; color: ${colors.ink}; font: inherit; font-size: 15px; text-align: left; cursor: pointer; transition: background .15s ease; }
.sf-mp-row:first-child { border-top: 0; }
.sf-mp-row:hover { background: ${colors.seaGlass}; }
.sf-mp-row:focus-visible { outline: 2px solid ${colors.ink}; outline-offset: -2px; }
.sf-mp-plus { color: ${colors.inkSoft}; font-size: 18px; line-height: 1; }
`;

const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function MultiPick({ options = [], value = [], onChange, common = [], placeholder = "Αναζήτηση", label }) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const selected = value.map((id) => byId.get(id)).filter(Boolean);
  const rest = options.filter((o) => !value.includes(o.id));

  const q = plain(query.trim());
  const shown = q
    ? rest.filter((o) => plain(o.name).includes(q)).slice(0, 8)
    : common
        .map((n) => rest.find((o) => o.name === n))
        .filter(Boolean)
        .slice(0, 6);

  const add = (id) => {
    onChange([...value, id]);
    setQuery("");
  };
  const remove = (id) => onChange(value.filter((v) => v !== id));

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }} aria-label={label ? `${label}: επιλεγμένες` : undefined}>
          {selected.map((o) => (
            <span key={o.id} className="sf-mp-tag">
              {o.name}
              <button type="button" className="sf-mp-x" aria-label={`Αφαίρεση: ${o.name}`} onClick={() => remove(o.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true"
          style={{ position: "absolute", left: 15, top: 16, color: colors.inkSoft, pointerEvents: "none" }}>
          <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 12l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          className="sf-mp-input"
          type="text"
          aria-label={label || placeholder}
          aria-controls={listId}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (shown[0]) add(shown[0].id);
            }
          }}
        />
      </div>
      {shown.length > 0 ? (
        <ul id={listId} className="sf-mp-list">
          {shown.map((o) => (
            <li key={o.id} style={{ display: "contents" }}>
              <button type="button" className="sf-mp-row" onClick={() => add(o.id)}>
                {o.name}
                <span className="sf-mp-plus" aria-hidden="true">+</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        q && <p style={{ ...muted, fontSize: 13, margin: "8px 0 0" }}>Δεν βρέθηκε.</p>
      )}
    </div>
  );
}
