"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buildPlaceIndex, pointOf, suggestedPlaces } from "../../../lib/platform/placeSearch";
import { locatePoint } from "../../../lib/platform/geo";
import { button, colors, muted, radius } from "../../../lib/platform/theme";
import { useLocalData } from "../useLocalData";
import Icon from "./Icon";
import MapView from "./map/MapView";
import { usePlacePositions } from "./map/usePlacePositions";
import PlacePicker, { placeTitle, choicePoint } from "./PlacePicker";

// Βήμα «Από / Προς» της ροής αιτήματος: δύο πεδία από πάνω, ΕΝΑΣ χάρτης, και κάτω η
// επιλογή για το ενεργό πεδίο. Το ενεργό πεδίο είναι τονισμένο και εκεί πάει το
// πάτημα στον χάρτη. Το «Προς» είναι προαιρετικό (άδειο = ίδιο σημείο): όποιος δεν το
// πατήσει μένει μόνο με το πρώτο κομμάτι· όποιος το πατήσει βλέπει από κάτω τη λίστα
// και τον χάρτη του. Πάτημα σε πεδίο ή σε καρφίτσα = αλλαγή του σημείου του.
const cta = { ...button("primary"), width: "100%", height: 52, padding: "0 18px", fontSize: 16, borderRadius: 12 };

function Field({ badge, label, value, placeholder, active, disabled, onOpen, onClear, clearLabel, field }) {
  return (
    <div
      data-route-field={field}
      data-active={active ? "true" : "false"}
      style={{
        display: "flex", alignItems: "center", gap: 4, borderRadius: radius.md,
        border: `${active ? 2 : 1}px solid ${active ? colors.ink : colors.border}`,
        background: active ? colors.seaGlass : colors.card, opacity: disabled ? 0.5 : 1,
        transition: "background .18s ease, border-color .18s ease",
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "6px 6px 6px 14px", background: "none", border: 0, font: "inherit", textAlign: "left", cursor: disabled ? "default" : "pointer", color: colors.ink }}
      >
        <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, background: active ? colors.ink : "#fff", color: active ? "#fff" : colors.ink, border: `1px solid ${active ? colors.ink : colors.border}` }}>
          {badge}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ ...muted, display: "block", fontSize: 12 }}>{label}</span>
          <span data-place-title style={{ display: "block", fontSize: 16, fontWeight: value ? 600 : 400, color: value ? colors.ink : colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {value || placeholder}
          </span>
        </span>
      </button>
      {onClear && value && (
        <button type="button" aria-label={clearLabel} onClick={onClear} style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: 0, cursor: "pointer", color: colors.inkSoft }}>
          <Icon name="x" size={18} />
        </button>
      )}
    </div>
  );
}

// Ελαφριά καμπύλη από το Α στο Β (όχι ευθεία): το «πού πάμε» μετρά, όχι η διαδρομή.
function arc(a, b) {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  let px = -dy;
  let py = dx;
  if (py < 0) {
    px = -px;
    py = -py;
  }
  const k = 0.2;
  const cx = (a.lng + b.lng) / 2 + px * k;
  const cy = (a.lat + b.lat) / 2 + py * k;
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const u = 1 - t;
    pts.push([u * u * a.lng + 2 * u * t * cx + t * t * b.lng, u * u * a.lat + 2 * u * t * cy + t * t * b.lat]);
  }
  return pts;
}

export default function RouteStep({ regions, country, from, setFrom, to, setTo, sameReturn, setSameReturn, failed, onRetry, onNext }) {
  const t = useTranslations("CrewSearchFlow");
  const L = useLocalData();
  const positioned = usePlacePositions();
  const index = useMemo(() => buildPlaceIndex(regions), [regions]);
  const [active, setActive] = useState("from");
  const [panel, setPanel] = useState({ n: 0, edit: true });
  const [editingFrom, setEditingFrom] = useState(false);
  // Μέχρι ο χρήστης να αγγίξει το «Από», η προεπιλογή ισχύει και το «Συνέχεια» μένει ενεργό.
  const touched = useRef(false);
  const [missed, setMissed] = useState(false);

  const hasFrom = Boolean(from.regionId && from.point.trim());
  const fromTitle = hasFrom ? placeTitle(index, from, L) : "";
  const toTitle = to.trim() ? L.text(to.trim()) : "";

  const locFrom = useMemo(() => (hasFrom ? locatePoint(choicePoint(index, from), { positioned }) : null), [hasFrom, index, from, positioned]);
  const locTo = useMemo(() => (!sameReturn && toTitle ? locatePoint(to.trim(), { positioned }) : null), [sameReturn, toTitle, to, positioned]);

  // Προεπιλεγμένο σημείο αναφοράς (το πρώτο βασικό λιμάνι της χώρας, π.χ. Άλιμος):
  // ο χάρτης φαίνεται αμέσως και αλλάζει με ένα πάτημα στον χάρτη ή στη λίστα.
  const defaultFrom = useMemo(() => {
    const e = suggestedPlaces(index, country).find((x) => x.covered);
    return e ? { regionId: e.regionId, point: pointOf(e) } : null;
  }, [index, country]);
  useEffect(() => {
    if (!hasFrom && defaultFrom) setFrom(defaultFrom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFrom, defaultFrom]);

  function toggleReturn(on) {
    setSameReturn(on);
    if (on) {
      setTo("");
      setActive("from");
    } else {
      setActive("to");
      setPanel((p) => ({ n: p.n + 1, edit: true }));
    }
  }

  function open(field) {
    touched.current = true;
    // Στη μέση αλλαγής το «Συνέχεια» κλειδώνει αμέσως (όχι μετά την επανασύνδεση του πεδίου).
    if (field === "from") setEditingFrom(true);
    setActive(field);
    setMissed(false);
    setPanel((p) => ({ n: p.n + 1, edit: true }));
  }

  const markers = [
    locFrom && { id: "from", lng: locFrom.lng, lat: locFrom.lat, label: "A", shape: "pin", active: active === "from", ariaLabel: t("fromLabel") },
    locTo && { id: "to", lng: locTo.lng, lat: locTo.lat, label: "B", shape: "pin", active: active === "to", ariaLabel: t("toLabel") },
  ].filter(Boolean);
  const layers = locFrom && locTo
    ? [{ id: "route", kind: "lines", color: colors.ink, width: 2.5, data: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: arc(locFrom, locTo) } }] } }]
    : [];

  let focus;
  if (locFrom && locTo && (locFrom.lng !== locTo.lng || locFrom.lat !== locTo.lat)) {
    const pts = arc(locFrom, locTo);
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    focus = { bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], padding: 50, maxZoom: 9, instant: true };
  } else {
    const loc = active === "to" ? locTo || locFrom : locFrom || locTo;
    if (loc) focus = loc.kind === "region" ? { bounds: loc.bounds, padding: 30, maxZoom: 9, instant: true } : { lng: loc.lng, lat: loc.lat, zoom: 10, instant: true };
  }

  // Πάτημα στον χάρτη: πάει στο ενεργό πεδίο.
  function handlePick({ here }) {
    const p = here?.kind === "place" ? here.place : null;
    const entry = p && index.find((e) => e.type === "place" && e.name === p.name && (e.parent || null) === (p.parent || null));
    if (!entry || (active === "from" && !entry.covered)) return setMissed(true);
    setMissed(false);
    if (active === "from") setFrom({ regionId: entry.regionId, point: pointOf(entry) });
    else setTo(entry.name);
  }

  const mapBlock = (
    <div data-choice-map style={{ marginTop: 16 }}>
      <MapView height={200} markers={markers} layers={layers} focus={focus} gestures="tap" controls="top-right" positioned={positioned} onPick={handlePick} onMarker={(id) => open(id)} />
      <p style={{ ...muted, fontSize: 12.5, margin: "8px 2px 0" }}>{missed ? t("mapNothing") : active === "from" ? t("mapHintFrom") : t("mapHintTo")}</p>
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gap: 10 }}>
        <Field field="from" badge="A" label={t("fromLabel")} value={fromTitle} placeholder={t("fromPlaceholder")} active={active === "from"} onOpen={() => open("from")} />
        {!sameReturn && (
          <Field
            field="to" badge="B" label={t("toLabel")} value={toTitle} placeholder={t("toPlaceholder")} active={active === "to"}
            disabled={!hasFrom} onOpen={() => open("to")} onClear={() => { setTo(""); setActive("from"); }} clearLabel={t("clearTo")}
          />
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={sameReturn}
        data-same-return
        onClick={() => toggleReturn(!sameReturn)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", minHeight: 52, marginTop: 12, padding: "0 4px 0 2px", background: "none", border: 0, font: "inherit", fontSize: 15.5, color: colors.ink, cursor: "pointer", textAlign: "left" }}
      >
        <span>{t("sameReturn")}</span>
        <span aria-hidden="true" style={{ position: "relative", flexShrink: 0, width: 46, height: 28, borderRadius: 14, background: sameReturn ? colors.ink : "#D5DADF", transition: "background .18s ease" }}>
          <span style={{ position: "absolute", top: 3, left: sameReturn ? 21 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .18s ease" }} />
        </span>
      </button>

      {markers.length > 0 && mapBlock}

      <div style={{ marginTop: 16 }}>
        {!hasFrom && defaultFrom ? null : active === "from" || sameReturn ? (
          <PlacePicker
            key={`from-${panel.n}`}
            bare
            openEditing={panel.edit}
            regions={regions}
            country={country}
            value={from}
            onChange={setFrom}
            autoFocus={touched.current}
            onEditingChange={(v) => touched.current && setEditingFrom(v)}
            failed={failed}
            onRetry={onRetry}
          />
        ) : (
          <PlacePicker
            key={`to-${panel.n}`}
            bare
            mode="arrival"
            openEditing={panel.edit}
            regions={regions}
            value={to}
            onChange={setTo}
            placeholder={t("toTyping")}
            autoFocus
          />
        )}
      </div>

      <div className="sf-step-footer">
        <button type="button" disabled={!hasFrom || (active === "from" && editingFrom)} onClick={onNext} style={cta}>
          {t("continue")}
        </button>
      </div>
    </div>
  );
}
