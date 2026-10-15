"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buildPlaceIndex, pointOf, suggestedPlaces } from "../../../lib/platform/placeSearch";
import { locatePoint } from "../../../lib/platform/geo";
import { button, colors, muted, radius } from "../../../lib/platform/theme";
import { scrollToElement } from "../../../lib/platform/motion";
import { useLocalData } from "../useLocalData";
import Icon from "./Icon";
import MapView from "./map/MapView";
import { usePlacePositions } from "./map/usePlacePositions";
import PlacePicker, { placeTitle, choicePoint } from "./PlacePicker";

// "From port" step of the request flow: ONE card (the From field + the route line), ONE map, and below it the
// picker for the active field. The return port is optional (empty = same port); tapping the route line opens it,
// tapping a pin or the map changes the active point.
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
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "6px 6px 6px 16px", background: "none", border: 0, font: "inherit", textAlign: "left", cursor: disabled ? "default" : "pointer", color: colors.ink }}
      >
        {badge && (
          <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, background: active ? colors.ink : "#fff", color: active ? "#fff" : colors.ink, border: `1px solid ${active ? colors.ink : colors.border}` }}>
            {badge}
          </span>
        )}
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

// A light curve from A to B (not a straight line): where we go matters, not the route.
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
  const [routeOpen, setRouteOpen] = useState(false);
  const [editingFrom, setEditingFrom] = useState(false);
  // Until the client touches the From field the default applies and Continue stays enabled.
  const touched = useRef(false);
  const [missed, setMissed] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  const [fromKey, setFromKey] = useState(0);
  const cardRef = useRef(null);
  const panelRef = useRef(null);
  const pickerRef = useRef(null);
  const hasFrom = Boolean(from.regionId && from.point.trim());
  const fromTitle = hasFrom ? placeTitle(index, from, L) : "";
  const toTitle = to.trim() ? L.text(to.trim()) : "";
  const returnsHome = sameReturn || !toTitle;
  const active = routeOpen ? "to" : "from";

  const locFrom = useMemo(() => (hasFrom ? locatePoint(choicePoint(index, from), { positioned }) : null), [hasFrom, index, from, positioned]);
  const locTo = useMemo(() => (!returnsHome ? locatePoint(to.trim(), { positioned }) : null), [returnsHome, to, positioned]);

  // Default start (the first base port of the country): the map shows at once and changes with one tap on the
  // map or the list.
  const defaultFrom = useMemo(() => {
    const e = suggestedPlaces(index, country).find((x) => x.covered);
    return e ? { regionId: e.regionId, point: pointOf(e) } : null;
  }, [index, country]);
  useEffect(() => {
    if (!hasFrom && defaultFrom) setFrom(defaultFrom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFrom, defaultFrom]);

  // The page must stay put when a port is picked: the list under the map is replaced by a shorter view, and the
  // browser would clamp the scroll position to the new, shorter page (a sudden jump). So the picker area keeps its
  // height while we smoothly bring the card with the updated From field to the centre of the screen, then lets it shrink.
  function settle() {
    const pk = pickerRef.current;
    if (pk) pk.style.minHeight = `${pk.offsetHeight}px`;
    return () => {
      setTimeout(() => scrollToElement(cardRef.current), 60);
      setTimeout(() => { if (pickerRef.current) pickerRef.current.style.minHeight = ""; }, 700);
    };
  }
  function pickFrom(v) {
    const after = settle();
    setFrom(v);
    after();
  }

  function openRoute() {
    if (!hasFrom) return;
    setMissed(false);
    if (routeOpen) {
      setRouteOpen(false);
      return;
    }
    setPanelKey((n) => n + 1);
    setRouteOpen(true);
    setTimeout(() => {
      const r = panelRef.current?.getBoundingClientRect();
      if (r && (r.bottom > window.innerHeight - 90 || r.top < 0)) scrollToElement(panelRef.current);
    }, 300);
  }
  function pickReturn(name) {
    setTo(name);
    setSameReturn(false);
    setRouteOpen(false);
  }
  function backHome() {
    setTo("");
    setSameReturn(true);
    setRouteOpen(false);
  }
  function openFrom() {
    touched.current = true;
    setEditingFrom(true);
    setRouteOpen(false);
    setMissed(false);
    setFromKey((n) => n + 1);
  }

  const markers = [
    locFrom && { id: "from", lng: locFrom.lng, lat: locFrom.lat, label: "A", shape: "pin", active: active === "from", ariaLabel: t("fromLabel") },
    locTo && { id: "to", lng: locTo.lng, lat: locTo.lat, label: "B", shape: "pin", active: active === "to", ariaLabel: t("toLabel") },
  ].filter(Boolean);
  const layers = locFrom && locTo
    ? [{ id: "route", kind: "lines", color: colors.ink, width: 2.5, data: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: arc(locFrom, locTo) } }] } }]
    : [];

  // The map centres on the port smoothly (the very first placement is instant, so it does not fly in from nowhere).
  const focusCount = useRef(0);
  const focus = useMemo(() => {
    const instant = focusCount.current++ === 0;
    if (locFrom && locTo && (locFrom.lng !== locTo.lng || locFrom.lat !== locTo.lat)) {
      const pts = arc(locFrom, locTo);
      const lngs = pts.map((p) => p[0]);
      const lats = pts.map((p) => p[1]);
      return { bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], padding: 50, maxZoom: 9, instant };
    }
    const loc = active === "to" ? locTo || locFrom : locFrom || locTo;
    if (!loc) return undefined;
    return loc.kind === "region" ? { bounds: loc.bounds, padding: 30, maxZoom: 9, instant } : { lng: loc.lng, lat: loc.lat, zoom: 10, instant };
  }, [locFrom, locTo, active]);

  // A tap on the map goes to the active field.
  function handlePick({ here }) {
    const p = here?.kind === "place" ? here.place : null;
    const entry = p && index.find((e) => e.type === "place" && e.name === p.name && (e.parent || null) === (p.parent || null));
    if (!entry || (active === "from" && !entry.covered)) return setMissed(true);
    setMissed(false);
    if (active === "from") setFrom({ regionId: entry.regionId, point: pointOf(entry) });
    else pickReturn(entry.name);
  }

  const mapBlock = (
    <div data-choice-map style={{ marginTop: 16 }}>
      <MapView height={200} markers={markers} layers={layers} focus={focus} gestures="tap" controls="top-right" positioned={positioned} onPick={handlePick} onMarker={(id) => (id === "to" ? openRoute() : openFrom())} />
      <p style={{ ...muted, fontSize: 12.5, margin: "8px 2px 0" }}>{missed ? t("mapNothing") : active === "from" ? t("mapHintFrom") : t("mapHintTo")}</p>
    </div>
  );

  const routeText = `${fromTitle || t("fromPlaceholder")} → ${returnsHome ? fromTitle || t("fromPlaceholder") : toTitle}`;

  return (
    <div>
      {/* One card: the From field, and under it the route line (default: back to the same port). The route line
          opens smoothly to choose another return port; changing From updates it by itself. */}
      <div ref={cardRef} data-route-card style={{ border: `1px solid ${colors.border}`, borderRadius: radius.lg, background: colors.card, padding: 12 }}>
        <Field field="from" label={t("fromLabel")} value={fromTitle} placeholder={t("fromPlaceholder")} active={active === "from" && editingFrom} onOpen={openFrom} />

        <button
          type="button"
          data-route-row
          aria-expanded={routeOpen}
          aria-label={`${t("routeChangeAria")}: ${routeText}`}
          disabled={!hasFrom}
          onClick={openRoute}
          style={{ display: "block", width: "100%", marginTop: 10, padding: "14px 16px 12px", textAlign: "left", font: "inherit", color: colors.ink, background: "#F3F2EF", border: 0, borderRadius: radius.md, cursor: hasFrom ? "pointer" : "default" }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: colors.inkSoft, display: "inline-flex" }}><Icon name="swap" size={22} stroke={1.5} /></span>
            <span data-route-text style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{routeText}</span>
            <span style={{ display: "inline-flex", color: colors.inkSoft, transition: "transform var(--sf-motion-ms, 240ms) var(--sf-ease, ease-out)", transform: routeOpen ? "rotate(180deg)" : "none" }}>
              <Icon name="chevDown" size={22} stroke={1.6} />
            </span>
          </span>
          {!routeOpen && <span style={{ ...muted, display: "block", fontSize: 12.5, margin: "6px 0 0 34px" }}>{t("routeChange")}</span>}
        </button>

        <div
          ref={panelRef}
          data-route-panel
          aria-hidden={!routeOpen}
          style={{ display: "grid", gridTemplateRows: routeOpen ? "1fr" : "0fr", transition: "grid-template-rows var(--sf-motion-ms, 240ms) var(--sf-ease, ease-out)" }}
        >
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            {routeOpen && (
              <div style={{ paddingTop: 12 }}>
                <PlacePicker key={`to-${panelKey}`} bare mode="arrival" openEditing regions={regions} value={returnsHome ? "" : to} onChange={pickReturn} placeholder={t("toTyping")} autoFocus />
                {!returnsHome && (
                  <button type="button" data-return-home onClick={backHome} style={{ ...muted, marginTop: 10, minHeight: 44, padding: "0 4px", background: "none", border: 0, font: "inherit", fontSize: 14, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>
                    {t("sameReturn")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {markers.length > 0 && mapBlock}

      <div ref={pickerRef} style={{ marginTop: 16, display: routeOpen ? "none" : undefined }}>
        {!hasFrom && defaultFrom ? null : (
          <PlacePicker
            key={`from-${fromKey}`}
            bare
            openEditing
            regions={regions}
            country={country}
            value={from}
            onChange={pickFrom}
            autoFocus={touched.current}
            onEditingChange={(v) => touched.current && setEditingFrom(v)}
            failed={failed}
            onRetry={onRetry}
          />
        )}
      </div>

      <div className="sf-step-footer">
        <button type="button" disabled={!hasFrom || editingFrom} onClick={onNext} style={cta}>
          {t("continue")}
        </button>
      </div>
    </div>
  );
}
