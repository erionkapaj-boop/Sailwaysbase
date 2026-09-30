"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildPlaceIndex,
  describeChoice,
  placesInRegion,
  pointFor,
  popularPlaces,
  searchPlaces,
} from "../../../lib/platform/placeSearch";
import { COUNTRIES, regionExamples, regionIn } from "../../../lib/platform/places";
import { logPlaceMiss } from "../../../lib/platform/health";
import { colors, muted, select } from "../../../lib/platform/theme";

// «Από πού ξεκινά το ταξίδι;» — ένα πεδίο για νησί, πόλη ή λιμάνι.
//
// Ο πελάτης γράφει ό,τι ξέρει (με ή χωρίς λάθη) ή διαλέγει ένα από τα βασικά
// λιμάνια· η περιοχή προκύπτει από το μέρος. Δεν διαλέγουμε ποτέ εμείς γι'
// αυτόν. Όποιος δεν ξέρει ακόμα, βλέπει τις περιοχές. Ό,τι δεν υπάρχει στο
// λεξικό δεν σταματά κανέναν: διαλέγει περιοχή, κρατάμε αυτό που έγραψε, και
// ο ιδιοκτήτης το βλέπει στη διαχείριση.
//
// mode="departure": value {regionId, point}, onChange({regionId, point}).
// mode="arrival":   value point, onChange(point) — ελεύθερο, χωρίς περιοχή.
// country:          κωδικός χώρας όταν η χώρα έχει ήδη επιλεγεί σε προηγούμενο
//                   βήμα (οδηγός). Χωρίς αυτό και με πολλές χώρες, το πεδίο
//                   δείχνει δικό του επιλογέα χώρας.
// onEditingChange(true|false): αν ο πελάτης είναι στη μέση αλλαγής.
//
// Σχεδίαση: λίστες με γραμμές (docs/DESIGN.md), όχι σύννεφο από κουμπιά.

const CSS = `
.sf-pp-input { width: 100%; height: 52px; box-sizing: border-box; padding: 0 44px 0 46px; border-radius: 12px;
  border: 1px solid ${colors.border}; background: ${colors.card}; color: ${colors.ink}; font: inherit; font-size: 16px;
  transition: border-color .15s ease, box-shadow .15s ease; }
.sf-pp-input::placeholder { color: #9AA7B3; }
.sf-pp-input:hover { border-color: #D9D4C9; }
.sf-pp-input:focus, .sf-pp-input:focus-visible { outline: none !important; border-color: ${colors.ink}; box-shadow: 0 0 0 4px rgba(22,40,60,0.07); }
.sf-pp-input[aria-invalid="true"] { border-color: ${colors.danger}; }
.sf-pp-list { margin: 0; padding: 0; list-style: none; border: 1px solid ${colors.border}; border-radius: 14px; background: ${colors.card}; overflow: hidden; }
.sf-pp-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 54px; box-sizing: border-box;
  padding: 10px 16px; margin: 0; border: 0; border-top: 1px solid #F1EEE8; background: transparent; color: ${colors.ink};
  font: inherit; font-size: 15.5px; text-align: left; cursor: pointer; transition: background .15s ease; }
.sf-pp-row:first-child { border-top: 0; }
.sf-pp-row:hover, .sf-pp-row[aria-selected="true"] { background: ${colors.seaGlass}; }
.sf-pp-row:focus-visible { outline: 2px solid ${colors.ink}; outline-offset: -2px; }
.sf-pp-name { font-weight: 500; letter-spacing: -0.005em; }
.sf-pp-sub { display: block; margin-top: 2px; font-size: 13px; font-weight: 400; color: ${colors.inkSoft}; }
.sf-pp-side { flex-shrink: 0; font-size: 13px; color: ${colors.inkSoft}; }
.sf-pp-ghost { border: 0; background: none; padding: 8px 4px; min-height: 44px; font: inherit; font-size: 14px; color: ${colors.inkSoft};
  cursor: pointer; border-radius: 8px; transition: color .15s ease; }
.sf-pp-ghost:hover { color: ${colors.ink}; }
.sf-pp-ghost:focus-visible { outline: 2px solid ${colors.ink}; outline-offset: 2px; }
.sf-pp-cell { border: 0; background: none; min-height: 44px; padding: 8px 12px; border-radius: 10px; text-align: left; font: inherit;
  font-size: 15px; color: ${colors.ink}; cursor: pointer; transition: background .15s ease; }
.sf-pp-cell:hover { background: rgba(22,40,60,0.05); }
.sf-pp-cell:focus-visible { outline: 2px solid ${colors.ink}; outline-offset: -2px; }
.sf-pp-radio { flex-shrink: 0; width: 20px; height: 20px; box-sizing: border-box; border-radius: 50%; border: 1.5px solid #C9C4B9; transition: all .15s ease; }
.sf-pp-row[aria-pressed="true"] .sf-pp-radio { border: 6px solid ${colors.ink}; }
.sf-pp-chev { flex-shrink: 0; color: #A9B3BD; transition: transform .2s ease; }
.sf-pp-row[aria-expanded="true"] .sf-pp-chev { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .sf-pp-input, .sf-pp-row, .sf-pp-radio, .sf-pp-chev { transition: none; } }
`;

const label = { ...muted, fontSize: 13, margin: "0 0 8px" };

const Chevron = () => (
  <svg className="sf-pp-chev" width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true">
    <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"
    style={{ position: "absolute", left: 16, top: 17, color: colors.inkSoft, pointerEvents: "none" }}>
    <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12 12l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

function placeMeta(e) {
  if (e.type === "country") return "Όλες οι περιοχές";
  if (e.type === "region")
    return ["Περιοχή", e.covered ? regionExamples(e.name, 3).join(", ") : "Χωρίς επαγγελματίες ακόμα"].filter(Boolean).join(" · ");
  return [e.parent, e.regionName, e.countryName, e.covered ? null : "Χωρίς επαγγελματίες ακόμα"].filter(Boolean).join(" · ");
}

export default function PlacePicker({
  regions = [],
  value,
  onChange,
  mode = "departure",
  placeholder,
  invalid = false,
  autoFocus = false,
  failed = false,
  onRetry,
  onEditingChange,
  country: countryProp,
}) {
  const arrival = mode === "arrival";
  const index = useMemo(() => buildPlaceIndex(regions), [regions]);
  const choice = arrival ? null : describeChoice(index, value || {});
  const hasValue = arrival ? Boolean(String(value || "").trim()) : choice.kind !== "empty";

  const [editing, setEditing] = useState(!hasValue);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const [openRegion, setOpenRegion] = useState(null);
  const [unlisted, setUnlisted] = useState(false);
  const [uncovered, setUncovered] = useState(null);
  const [ownCountry, setOwnCountry] = useState(choice?.region?.countryCode || COUNTRIES[0].code);
  const country = countryProp || ownCountry;
  const showCountryChoice = !countryProp && !arrival && COUNTRIES.length > 1;
  const inputRef = useRef(null);
  const focusNext = useRef(autoFocus);
  const listId = useId();

  // Όσο αλλάζει μέρος, η γονική φόρμα δεν προχωρά με την παλιά επιλογή.
  const editingNow = editing || !hasValue;
  useEffect(() => {
    onEditingChange?.(editingNow);
  }, [editingNow, onEditingChange]);

  // Μια επιλογή που ήρθε απ' έξω (σύνδεσμος, «καθαρισμός») αλλάζει και την προβολή.
  useEffect(() => {
    if (!hasValue) setEditing(true);
  }, [hasValue]);

  useEffect(() => {
    if (editing && focusNext.current && inputRef.current) {
      focusNext.current = false;
      inputRef.current.focus();
    }
  }, [editing, browsing]);

  const trimmed = query.trim();
  const results = useMemo(() => {
    if (trimmed.length < 2) return [];
    const found = searchPlaces(index, trimmed, arrival ? 5 : 6, arrival ? null : country);
    return arrival ? found.filter((e) => e.type === "place").slice(0, 5) : found;
  }, [index, trimmed, arrival, country]);

  useEffect(() => {
    setActive(0);
    setUnlisted(false);
  }, [trimmed]);

  // Τίποτα κοντά: κατευθείαν «σε ποια περιοχή είναι;», χωρίς αδιέξοδο.
  const noMatch = !arrival && trimmed.length >= 3 && results.length === 0;
  const askRegion = unlisted || noMatch;

  // Στο «αναχώρηση» το «δεν είναι κάποιο από αυτά» οδηγεί σε επιλογή
  // περιοχής· στο «τερματισμό» απλώς κρατά ό,τι γράφτηκε.
  const options = [...results];
  if (trimmed.length >= 2 && (arrival || results.length)) options.push({ type: "unlisted", id: "unlisted", name: trimmed });

  function reset() {
    setQuery("");
    setBrowsing(false);
    setOpenRegion(null);
    setUnlisted(false);
    setUncovered(null);
  }

  function done(next) {
    onChange(next);
    reset();
    setEditing(false);
  }

  function pick(opt) {
    if (!opt) return;
    if (opt.type === "unlisted") {
      if (arrival) return done(opt.name);
      setUnlisted(true);
      return;
    }
    if (arrival) return done(opt.name);
    if (opt.type === "country") {
      setOwnCountry(opt.code);
      setQuery("");
      setBrowsing(true);
      return;
    }
    // Περιοχή χωρίς επαγγελματίες ακόμα: το βρίσκει και ενημερώνεται, και
    // η ζήτηση καταγράφεται για τον ιδιοκτήτη.
    if (opt.covered === false) {
      logPlaceMiss(opt.name, null);
      setUncovered(opt);
      setQuery("");
      return;
    }
    done({ regionId: opt.regionId, point: opt.name });
  }

  function pickUnlistedRegion(r) {
    logPlaceMiss(trimmed, r.regionId);
    done({ regionId: r.regionId, point: trimmed });
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!askRegion && options[active]) pick(options[active]);
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else if (hasValue) {
        reset();
        setEditing(false);
      }
    }
  }

  function startEditing() {
    onEditingChange?.(true); // αμέσως, χωρίς να περιμένει το επόμενο render
    focusNext.current = true;
    reset();
    setEditing(true);
  }

  const regionEntries = index
    .filter((e) => e.type === "region" && e.covered && e.countryCode === country)
    .sort((a, b) => a.popular - b.popular);
  const countryName = COUNTRIES.find((c) => c.code === country)?.name || "";
  const styleTag = <style dangerouslySetInnerHTML={{ __html: CSS }} />;

  const regionRows = (onPick) =>
    regionEntries.map((r) => (
      <button key={r.id} type="button" className="sf-pp-row" onClick={() => onPick(r)}>
        <span>
          <span className="sf-pp-name">{r.name}</span>
          <span className="sf-pp-sub">{regionExamples(r.name, 3).join(", ")}</span>
        </span>
        <Chevron />
      </button>
    ));

  // ---- Επιλεγμένο ---------------------------------------------------------
  if (!editing && hasValue) {
    if (arrival) {
      const match = searchPlaces(index, value, 1)[0];
      const same = match && match.name === String(value).trim();
      return (
        <>
          {styleTag}
          <Summary title={value} sub={same && match.type === "place" ? placeMeta(match) : null} onChange={startEditing} invalid={invalid} />
        </>
      );
    }
    const regionName = choice.region?.name || "";
    const sub =
      choice.kind === "region"
        ? `Όλη η περιοχή · ${choice.region?.countryName || ""}`
        : choice.kind === "place"
          ? placeMeta(choice.entry)
          : [regionName, choice.region?.countryName].filter(Boolean).join(" · ");
    const title = choice.kind === "place" ? choice.entry.name : choice.kind === "region" ? regionName : choice.text;
    const ports = choice.kind === "place" ? choice.entry.ports : null;
    const nearby = choice.kind === "region" ? placesInRegion(index, value.regionId, 12) : null;
    return (
      <div data-place-picker="selected">
        {styleTag}
        <Summary title={title} sub={sub} onChange={startEditing} invalid={invalid} />
        {ports && (
          <div style={{ marginTop: 24 }}>
            <p style={label}>Λιμάνι</p>
            <div className="sf-pp-list">
              <button type="button" className="sf-pp-row" aria-pressed={!choice.port}
                onClick={() => onChange({ regionId: value.regionId, point: choice.entry.name })}>
                <span className="sf-pp-name">Όπου βολεύει</span>
                <span className="sf-pp-radio" aria-hidden="true" />
              </button>
              {ports.map((p) => (
                <button key={p} type="button" className="sf-pp-row" aria-pressed={choice.port === p}
                  onClick={() => onChange({ regionId: value.regionId, point: pointFor(choice.entry, p) })}>
                  <span className="sf-pp-name">{p}</span>
                  <span className="sf-pp-radio" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}
        {nearby && nearby.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p style={label}>Πιο συγκεκριμένα (προαιρετικό)</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, margin: "0 -12px" }}>
              {nearby.map((e) => (
                <button key={e.id} type="button" className="sf-pp-cell" onClick={() => onChange({ regionId: e.regionId, point: e.name })}>
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {regionName && (
          <p style={{ ...muted, fontSize: 13, margin: "20px 0 0" }}>Επαγγελματίες διαθέσιμοι {regionIn(regionName)}.</p>
        )}
      </div>
    );
  }

  // ---- Εκτός κάλυψης ------------------------------------------------------
  if (uncovered) {
    const nearRegions = uncovered.near.length
      ? uncovered.near
      : regionEntries.map((r) => ({ regionId: r.regionId, name: r.name }));
    return (
      <div data-place-picker="uncovered">
        {styleTag}
        <Summary
          title={uncovered.name}
          sub={[uncovered.type === "place" ? uncovered.regionName : null, uncovered.countryName].filter(Boolean).join(" · ")}
          onChange={startEditing}
        />
        <p style={{ fontSize: 15, fontWeight: 500, margin: "24px 0 4px", color: colors.ink }}>
          Δεν έχουμε ακόμα επαγγελματίες σε αυτή την περιοχή.
        </p>
        <p style={{ ...muted, fontSize: 13, margin: "0 0 12px" }}>
          {uncovered.near.length ? "Δες όσους είναι κοντά:" : "Δες πού έχουμε επαγγελματίες:"}
        </p>
        <div className="sf-pp-list">
          {nearRegions.map((r) => (
            <button key={r.regionId} type="button" className="sf-pp-row" onClick={() => done({ regionId: r.regionId, point: uncovered.name })}>
              <span className="sf-pp-name">{r.name}</span>
              <Chevron />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Περιοχές (για όποιον δεν ξέρει ακόμα) ------------------------------
  if (browsing && !arrival) {
    return (
      <div data-place-picker="browse">
        {styleTag}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <p style={{ ...label, margin: 0 }}>Περιοχές · {countryName}</p>
          <button
            type="button"
            className="sf-pp-ghost"
            onClick={() => {
              focusNext.current = true;
              setBrowsing(false);
              setOpenRegion(null);
            }}
          >
            Αναζήτηση μέρους
          </button>
        </div>
        <div className="sf-pp-list">
          {regionEntries.map((r) => {
            const open = openRegion === r.regionId;
            return (
              <div key={r.id}>
                <button type="button" className="sf-pp-row" aria-expanded={open} onClick={() => setOpenRegion(open ? null : r.regionId)}>
                  <span>
                    <span className="sf-pp-name">{r.name}</span>
                    <span className="sf-pp-sub">{regionExamples(r.name, 3).join(", ")}</span>
                  </span>
                  <Chevron />
                </button>
                {open && (
                  <div style={{ background: colors.seaGlass, padding: "6px 12px 12px", borderTop: "1px solid #F1EEE8" }}>
                    <button
                      type="button"
                      className="sf-pp-cell"
                      style={{ display: "block", width: "100%", fontWeight: 500 }}
                      onClick={() => done({ regionId: r.regionId, point: r.name })}
                    >
                      Οπουδήποτε {regionIn(r.name)}
                    </button>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                      {placesInRegion(index, r.regionId, 14).map((e) => (
                        <button key={e.id} type="button" className="sf-pp-cell" onClick={() => done({ regionId: e.regionId, point: e.name })}>
                          {e.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <RegionsState regions={regions} failed={failed} onRetry={onRetry} />
      </div>
    );
  }

  // ---- Γράφει -------------------------------------------------------------
  const showList = !askRegion && options.length > 0;
  const activeId = showList ? `${listId}-${active}` : undefined;
  const base = !arrival && trimmed.length < 2 ? popularPlaces(index, country) : [];
  return (
    <div data-place-picker="edit">
      {styleTag}
      {showCountryChoice && (
        <select aria-label="Χώρα" style={{ ...select, marginBottom: 12, height: 52 }} value={country} onChange={(e) => setOwnCountry(e.target.value)}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      )}
      <div style={{ position: "relative" }}>
        <SearchIcon />
        <input
          ref={inputRef}
          className="sf-pp-input"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder || (arrival ? "π.χ. Μύκονος" : "Νησί, πόλη ή λιμάνι")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {hasValue && (
          <button
            type="button"
            className="sf-pp-ghost"
            style={{ position: "absolute", right: 8, top: 4, fontSize: 13.5 }}
            onClick={() => {
              reset();
              setEditing(false);
            }}
          >
            Άκυρο
          </button>
        )}
      </div>

      {showList && (
        <ul id={listId} role="listbox" className="sf-pp-list" style={{ marginTop: 8 }}>
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="sf-pp-row"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              {o.type === "unlisted" ? (
                <span style={{ color: colors.inkSoft, fontSize: 14.5 }}>
                  {arrival ? <>Χρήση «{o.name}»</> : <>Άλλο μέρος: «{o.name}»</>}
                </span>
              ) : (
                <span>
                  <span className="sf-pp-name">{o.name}</span>
                  <span className="sf-pp-sub">{placeMeta(o)}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {askRegion && regions.length > 0 && (
        <div data-place-picker="unlisted" style={{ marginTop: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px", color: colors.ink }}>
            {noMatch ? "Δεν το βρήκαμε στη λίστα. " : ""}Σε ποια περιοχή είναι το «{trimmed}»;
          </p>
          <p style={{ ...muted, fontSize: 13, margin: "0 0 12px" }}>Κρατάμε το σημείο όπως το έγραψες.</p>
          <div className="sf-pp-list">{regionRows(pickUnlistedRegion)}</div>
          {!noMatch && (
            <button type="button" className="sf-pp-ghost" onClick={() => setUnlisted(false)}>
              Πίσω στις προτάσεις
            </button>
          )}
        </div>
      )}

      {base.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p style={label}>Βασικά λιμάνια</p>
          <div className="sf-pp-list">
            {base.map((e) => (
              <button key={e.id} type="button" className="sf-pp-row" onClick={() => pick(e)}>
                <span className="sf-pp-name">{e.name}</span>
                <span className="sf-pp-side">{e.regionName}</span>
              </button>
            ))}
            {regions.length > 0 && (
              <button
                type="button"
                className="sf-pp-row"
                onClick={() => {
                  setOpenRegion(null);
                  setBrowsing(true);
                }}
              >
                <span className="sf-pp-name" style={{ color: colors.inkSoft, fontWeight: 400 }}>Δες όλες τις περιοχές</span>
                <Chevron />
              </button>
            )}
          </div>
        </div>
      )}
      {!arrival && trimmed.length < 2 && <RegionsState regions={regions} failed={failed} onRetry={onRetry} />}
    </div>
  );
}

function Summary({ title, sub, onChange, invalid }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 8px 12px 18px",
        border: `1px solid ${invalid ? colors.danger : colors.border}`,
        borderRadius: 14,
        background: colors.card,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div data-place-title style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
          {title}
        </div>
        {sub && <span className="sf-pp-sub">{sub}</span>}
      </div>
      <button type="button" className="sf-pp-ghost" style={{ padding: "8px 12px", color: colors.ink }} onClick={onChange}>
        Αλλαγή
      </button>
    </div>
  );
}

function RegionsState({ regions, failed, onRetry }) {
  if (regions.length > 0) return null;
  if (failed) {
    return (
      <p style={{ ...muted, color: colors.danger, fontSize: 13, margin: "16px 0 0" }}>
        Οι περιοχές δεν φορτώθηκαν.{" "}
        {onRetry && (
          <button type="button" className="sf-pp-ghost" style={{ padding: 0, minHeight: 0, color: colors.ink, textDecoration: "underline" }} onClick={onRetry}>
            Δοκίμασε ξανά
          </button>
        )}
      </p>
    );
  }
  return <p style={{ ...muted, fontSize: 13, margin: "16px 0 0" }}>Φόρτωση περιοχών…</p>;
}
