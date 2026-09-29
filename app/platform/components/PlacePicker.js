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
import { colors, input, muted, radius } from "../../../lib/platform/theme";

// «Από πού ξεκινά το ταξίδι;» — ένα πεδίο αντί για χώρα → περιοχή → λιμάνι.
//
// Ο πελάτης γράφει ό,τι ξέρει (νησί, πόλη, λιμάνι, με ή χωρίς λάθη) και
// διαλέγει από τις προτάσεις· η περιοχή προκύπτει από το μέρος. Δεν
// διαλέγουμε ποτέ εμείς γι' αυτόν. Όποιος δεν ξέρει ακόμα, βλέπει τις
// περιοχές. Ό,τι δεν υπάρχει στο λεξικό δεν σταματά κανέναν: διαλέγει
// περιοχή, κρατάμε αυτό που έγραψε, και ο ιδιοκτήτης το βλέπει στη
// διαχείριση.
//
// mode="departure": value {regionId, point}, onChange({regionId, point}).
// mode="arrival":   value point, onChange(point) — ελεύθερο, χωρίς περιοχή.
// onEditingChange(true|false): αν ο πελάτης είναι στη μέση αλλαγής.

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

const linkButton = {
  background: "none",
  border: "none",
  padding: "10px 0",
  minHeight: 44,
  fontFamily: "inherit",
  fontSize: 14,
  color: colors.ink,
  textDecoration: "underline",
  textUnderlineOffset: 3,
  textDecorationColor: colors.border,
  cursor: "pointer",
};

const row = (active) => ({
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "11px 14px",
  border: "none",
  borderTop: `1px solid ${colors.border}`,
  background: active ? colors.seaGlass : colors.card,
  color: colors.ink,
  fontFamily: "inherit",
  fontSize: 15,
  cursor: "pointer",
});

const listBox = {
  listStyle: "none",
  margin: "8px 0 0",
  padding: 0,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  overflow: "hidden",
  background: colors.card,
};

const meta = { ...muted, display: "block", fontSize: 12.5, marginTop: 2 };

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
  const [country, setCountry] = useState(choice?.region?.countryCode || COUNTRIES[0].code);
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
      setCountry(opt.code);
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
    if (opt.type === "region") return done({ regionId: opt.regionId, point: opt.name });
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

  const border = invalid ? `1px solid ${colors.danger}` : `1px solid ${colors.border}`;

  // ---- Επιλεγμένο ---------------------------------------------------------
  if (!editing && hasValue) {
    if (arrival) {
      const match = searchPlaces(index, value, 1)[0];
      const same = match && match.name === String(value).trim();
      return (
        <Summary title={value} sub={same && match.type === "place" ? placeMeta(match) : null} onChange={startEditing} border={border} />
      );
    }
    const regionName = choice.region?.name || "";
    const sub =
      choice.kind === "region"
        ? `Όλη η περιοχή · ${choice.region?.countryName || ""}`
        : choice.kind === "place"
          ? placeMeta(choice.entry)
          : [regionName, choice.region?.countryName].filter(Boolean).join(" · ");
    const title =
      choice.kind === "place" ? choice.entry.name : choice.kind === "region" ? regionName : choice.text;
    const ports = choice.kind === "place" ? choice.entry.ports : null;
    const nearby = choice.kind === "region" ? placesInRegion(index, value.regionId, 8) : null;
    return (
      <div data-place-picker="selected">
        <Summary title={title} sub={sub} onChange={startEditing} border={border} />
        {ports && (
          <div style={{ marginTop: 14 }}>
            <p style={{ ...muted, fontSize: 13, margin: "0 0 8px" }}>Λιμάνι</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                style={chip(!choice.port)}
                aria-pressed={!choice.port}
                onClick={() => onChange({ regionId: value.regionId, point: choice.entry.name })}
              >
                Όπου βολεύει
              </button>
              {ports.map((p) => (
                <button
                  key={p}
                  type="button"
                  style={chip(choice.port === p)}
                  aria-pressed={choice.port === p}
                  onClick={() => onChange({ regionId: value.regionId, point: pointFor(choice.entry, p) })}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {nearby && nearby.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ ...muted, fontSize: 13, margin: "0 0 8px" }}>Πιο συγκεκριμένα (προαιρετικό)</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {nearby.map((e) => (
                <button key={e.id} type="button" style={chip(false)} onClick={() => onChange({ regionId: e.regionId, point: e.name })}>
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {regionName && (
          <p style={{ ...muted, fontSize: 12.5, margin: "12px 0 0" }}>
            Επαγγελματίες διαθέσιμοι {regionIn(regionName)}.
          </p>
        )}
      </div>
    );
  }

  // ---- Περιοχές (για όποιον δεν ξέρει ακόμα) ------------------------------
  if (browsing && !arrival) {
    return (
      <div data-place-picker="browse">
        <CountryRow current={country} onPick={setCountry} />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <p style={{ ...muted, fontSize: 13, margin: 0 }}>Περιοχές · {countryName}</p>
          <button
            type="button"
            style={{ ...linkButton, padding: 0, minHeight: 0, fontSize: 13 }}
            onClick={() => {
              focusNext.current = true;
              setBrowsing(false);
              setOpenRegion(null);
            }}
          >
            Αναζήτηση μέρους
          </button>
        </div>
        <div style={listBox}>
          {regionEntries.map((r, i) => {
            const open = openRegion === r.regionId;
            return (
              <div key={r.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  style={{ ...row(open), borderTop: i === 0 ? "none" : row(open).borderTop }}
                  onClick={() => setOpenRegion(open ? null : r.regionId)}
                >
                  {r.name}
                  <span style={meta}>{regionExamples(r.name, 3).join(", ")}</span>
                </button>
                {open && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 14px 14px", background: colors.seaGlass }}>
                    <button type="button" style={chip(false)} onClick={() => done({ regionId: r.regionId, point: r.name })}>
                      Οπουδήποτε {regionIn(r.name)}
                    </button>
                    {placesInRegion(index, r.regionId, 12).map((e) => (
                      <button key={e.id} type="button" style={chip(false)} onClick={() => done({ regionId: e.regionId, point: e.name })}>
                        {e.name}
                      </button>
                    ))}
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
  if (uncovered) {
    const options = uncovered.near.length
      ? uncovered.near
      : regionEntries.map((r) => ({ regionId: r.regionId, name: r.name }));
    return (
      <div data-place-picker="uncovered">
        <Summary title={uncovered.name} sub={[uncovered.type === "place" ? uncovered.regionName : null, uncovered.countryName].filter(Boolean).join(" · ")} onChange={startEditing} border={border} />
        <p style={{ fontSize: 14, margin: "14px 0 2px", color: colors.ink }}>Δεν έχουμε ακόμα επαγγελματίες σε αυτή την περιοχή.</p>
        <p style={{ ...muted, fontSize: 12.5, margin: "0 0 10px" }}>
          {uncovered.near.length ? "Δες όσους είναι κοντά:" : "Δες πού έχουμε επαγγελματίες:"}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {options.map((r) => (
            <button key={r.regionId} type="button" style={chip(false)} onClick={() => done({ regionId: r.regionId, point: uncovered.name })}>
              {r.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-place-picker="edit">
      {!arrival && <CountryRow current={country} onPick={setCountry} />}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
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
          style={{ ...input, border, paddingRight: hasValue ? 76 : input.padding }}
          placeholder={placeholder || (arrival ? "π.χ. Μύκονος" : "Νησί, πόλη ή λιμάνι · π.χ. Πάρος")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {hasValue && (
          <button
            type="button"
            style={{ ...linkButton, position: "absolute", right: 12, top: 0, bottom: 0, padding: 0, fontSize: 13, color: colors.inkSoft }}
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
        <ul id={listId} role="listbox" style={listBox}>
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              style={{ ...row(i === active), borderTop: i === 0 ? "none" : row(false).borderTop }}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              {o.type === "unlisted" ? (
                <span style={{ color: colors.inkSoft, fontSize: 14 }}>
                  {arrival ? <>Χρήση «{o.name}»</> : <>Άλλο μέρος: «{o.name}»</>}
                </span>
              ) : (
                <>
                  {o.name}
                  <span style={meta}>{placeMeta(o)}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {askRegion && regions.length > 0 && (
        <div data-place-picker="unlisted" style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14, margin: "0 0 2px", color: colors.ink }}>
            {noMatch ? "Δεν το βρήκαμε στη λίστα. " : ""}Σε ποια περιοχή είναι το «{trimmed}»;
          </p>
          <p style={{ ...muted, fontSize: 12.5, margin: 0 }}>Κρατάμε το σημείο όπως το έγραψες.</p>
          <div style={listBox}>
            {regionEntries.map((r, i) => (
              <button
                key={r.id}
                type="button"
                style={{ ...row(false), borderTop: i === 0 ? "none" : row(false).borderTop }}
                onClick={() => pickUnlistedRegion(r)}
              >
                {r.name}
                <span style={meta}>{regionExamples(r.name, 3).join(", ")}</span>
              </button>
            ))}
          </div>
          {!noMatch && (
            <button type="button" style={linkButton} onClick={() => setUnlisted(false)}>
              Πίσω στις προτάσεις
            </button>
          )}
        </div>
      )}

      {!arrival && trimmed.length < 2 && (
        <>
          {popularPlaces(index, country).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {popularPlaces(index, country).map((e) => (
                <button key={e.id} type="button" style={chip(false)} onClick={() => pick(e)}>
                  {e.name}
                </button>
              ))}
            </div>
          )}
          {regions.length > 0 && (
            <button
              type="button"
              style={{ ...linkButton, marginTop: 4 }}
              onClick={() => {
                setOpenRegion(null);
                setBrowsing(true);
              }}
            >
              Δεν ξέρεις ακόμα; Δες τις περιοχές
            </button>
          )}
          <RegionsState regions={regions} failed={failed} onRetry={onRetry} />
        </>
      )}
    </div>
  );
}

function Summary({ title, sub, onChange, border }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 8px 10px 14px",
        border,
        borderRadius: radius.md,
        background: colors.card,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div data-place-title style={{ fontSize: 15, fontWeight: 500, overflowWrap: "anywhere" }}>
          {title}
        </div>
        {sub && <span style={{ ...meta, marginTop: 1 }}>{sub}</span>}
      </div>
      <button type="button" style={{ ...linkButton, padding: "0 8px", fontSize: 13.5 }} onClick={onChange}>
        Αλλαγή
      </button>
    </div>
  );
}

function RegionsState({ regions, failed, onRetry }) {
  if (regions.length > 0) return null;
  if (failed) {
    return (
      <p style={{ ...muted, color: colors.danger, fontSize: 13, margin: "10px 0 0" }}>
        Οι περιοχές δεν φορτώθηκαν.{" "}
        {onRetry && (
          <button type="button" style={{ ...linkButton, padding: 0, minHeight: 0, fontSize: 13 }} onClick={onRetry}>
            Δοκίμασε ξανά
          </button>
        )}
      </p>
    );
  }
  return <p style={{ ...muted, fontSize: 13, margin: "10px 0 0" }}>Φόρτωση περιοχών…</p>;
}

// Πρώτο σκαλοπάτι: η χώρα. Με μία χώρα φαίνεται επιλεγμένη και δεν θέλει
// καμία ενέργεια· με περισσότερες, ο πελάτης διαλέγει και η αναζήτηση
// περιορίζεται σε αυτήν.
function CountryRow({ current, onPick }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }} role="group" aria-label="Χώρα">
      {COUNTRIES.map((c) => (
        <button
          key={c.code}
          type="button"
          style={chip(c.code === current)}
          aria-pressed={c.code === current}
          onClick={() => onPick(c.code)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
