"use client";
import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, MAP_URL, MAP_COLORS } from "../../../../lib/platform/mapStyle";
import { whatIsHere, positionedPlaces } from "../../../../lib/platform/geo";

// Ο κοινός χάρτης. Δεν ξέρει τίποτα για τις χρήσεις του: δέχεται στρώματα και
// γεγονότα και τα δείχνει.
//
//   layers      [{ id, kind: "points" | "lines" | "areas", data: GeoJSON, color?, radius? }]
//                 points: κάθε feature.properties.label γράφεται δίπλα (μόνο με πραγματικό χάρτη)
//   onPick      ({ lng, lat, here }) πάτημα σε κενό σημείο· here = τι είναι εδώ (whatIsHere)
//   onFeature   (properties) πάτημα σε σημείο ενός στρώματος points
//   focus       { lng, lat, zoom? } ή { bounds } → ο χάρτης πηγαίνει εκεί
//   pick        { lng, lat } → σημάδι «επιλεγμένο σημείο»
//   draggable   { lng, lat } → καρφίτσα που μετακινείται· onDrag({ lng, lat }) στο τέλος
//   positioned  οι θέσεις των μερών που χρησιμοποιεί το «τι είναι εδώ» (προεπιλογή: οι γνωστές)
//   markers     [{ id, lng, lat, label, active?, ariaLabel?, shape? }] → ετικέτες-κουμπιά (π.χ. ημερομηνία)
//               shape: "pin" → κλασική καρφίτσα (στρογγυλή πάνω, μυτερή κάτω) με το γράμμα μέσα· η μύτη είναι στο σημείο
//               shape: "badge" → στρογγυλό σημάδι με εικονίδιο (icon: περιεχόμενο SVG 24×24, color, age: fresh | aging | old)
//               onMarker(id) πάτημα, onMarkerHover(id | null) πέρασμα του δείκτη
//   onMove      (bounds) όταν ο χρήστης μετακινήσει/μεγεθύνει τον χάρτη: [[w, s], [e, n]]
//   controls    θέση των κουμπιών μεγέθυνσης (προεπιλογή "bottom-right")
//   gestures    "full" (προεπιλογή) | "tap": χωρίς μεγέθυνση με τη ροδέλα/περιστροφή,
//               για μικρούς χάρτες μέσα σε σελίδα που κυλά
// Ο εργάτης της βιβλιοθήκης σερβίρεται από τον φάκελο public (scripts/copy-maplibre.mjs).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const GREECE_BOUNDS = [[19.2, 34.6], [28.6, 41.8]];
const EMPTY = { type: "FeatureCollection", features: [] };

const CSS = `
.maplibregl-ctrl-group { border-radius: 12px !important; box-shadow: 0 1px 3px rgba(22,40,60,0.12) !important; }
.maplibregl-ctrl-group button { width: 44px !important; height: 44px !important; }
.maplibregl-ctrl-attrib { font-size: 11px !important; }
.maplibregl-canvas { outline: none; }
.mv-pin { font: 600 13px/1 var(--sf-font-sans, system-ui, -apple-system, sans-serif); color: ${MAP_COLORS.point}; background: #fff; border: 0; border-radius: 999px;
  padding: 7px 11px; white-space: nowrap; cursor: pointer; box-shadow: 0 0 0 1px rgba(22,40,60,.10), 0 2px 6px rgba(22,40,60,.18);
  transition: transform .15s ease, background .15s ease, color .15s ease; }
.mv-pin:hover { transform: scale(1.06); }
.mv-pin[data-active="true"] { background: ${MAP_COLORS.point}; color: #fff; transform: scale(1.08); }
.mv-pin:focus-visible { outline: 2px solid ${MAP_COLORS.point}; outline-offset: 2px; }
.mv-pin[data-static="true"] { cursor: default; }
.mv-drop { background: none; border: 0; padding: 0; margin: 0; line-height: 0; cursor: pointer; filter: drop-shadow(0 2px 3px rgba(22,40,60,.35)); transition: transform .15s ease; transform-origin: 50% 100%; }
.mv-drop svg { display: block; }
.mv-drop path { fill: #fff; stroke: ${MAP_COLORS.point}; stroke-width: 2; }
.mv-drop text { fill: ${MAP_COLORS.point}; font: 700 12px/1 var(--sf-font-sans, system-ui, -apple-system, sans-serif); }
.mv-drop[data-active="true"] path { fill: ${MAP_COLORS.point}; }
.mv-drop[data-active="true"] text { fill: #fff; }
.mv-drop[data-static="true"] { cursor: default; }
.mv-drop:hover { transform: scale(1.08); }
.mv-drop:focus-visible { outline: 2px solid ${MAP_COLORS.point}; outline-offset: 2px; }
.mv-badge { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; padding: 0; border-radius: 999px; background: #fff;
  border: 2px solid currentColor; cursor: pointer; box-shadow: 0 2px 7px rgba(22,40,60,.22); transition: transform .15s ease, opacity .2s ease, background .15s ease, color .15s ease; }
.mv-badge svg { display: block; }
.mv-badge:hover { transform: scale(1.08); }
.mv-badge[data-age="aging"] { opacity: .78; }
.mv-badge[data-age="old"] { opacity: .55; border-style: dashed; }
.mv-badge[data-active="true"] { opacity: 1; transform: scale(1.14); background: currentColor; }
.mv-badge[data-active="true"] svg { color: #fff; }
.mv-badge:focus-visible { outline: 2px solid ${MAP_COLORS.point}; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .mv-pin, .mv-badge { transition: none; } }
`;

export default function MapViewInner({ layers = [], onPick, onFeature, focus, pick, draggable, onDrag, positioned, interactive = true, markers, onMarker, onMarkerHover, onMove, gestures = "full", controls = "bottom-right" }) {
  const t = useTranslations("Map");
  const lang = useLocale();
  const box = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const markerRef = useRef(null);
  const handlers = useRef({});
  handlers.current = { onPick, onFeature, onDrag, positioned, onMarker, onMarkerHover, onMove };
  const pinsRef = useRef(new Map());
  const layersRef = useRef(layers);
  layersRef.current = layers;

  // Δημιουργία (μία φορά).
  useEffect(() => {
    const el = box.current;
    const map = new maplibregl.Map({
      container: el,
      style: mapStyle({ lang }),
      bounds: GREECE_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
      interactive,
      locale: {
        "NavigationControl.ZoomIn": t("zoomIn"),
        "NavigationControl.ZoomOut": t("zoomOut"),
        "NavigationControl.ResetBearing": t("resetBearing"),
        "AttributionControl.ToggleAttribution": t("attribution"),
        "AttributionControl.MapFeedback": t("attribution"),
      },
    });
    el.__map = map; // γάντζος για τα τεστ περιήγησης
    mapRef.current = map;
    if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), controls);
    if (interactive && gestures === "tap") {
      map.scrollZoom.disable();
      map.dragRotate.disable();
      map.touchPitch.disable();
      map.touchZoomRotate.disableRotation();
    }
    map.on("moveend", (e) => {
      if (!e.originalEvent) return; // μόνο κινήσεις του χρήστη, όχι του κώδικα
      const b = map.getBounds();
      handlers.current.onMove?.([[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]]);
    });

    map.on("load", () => {
      readyRef.current = true;
      syncLayers(map, layersRef.current);
      el.dataset.mapReady = "true";
      el.dataset.mapMode = MAP_URL ? "tiles" : "plain";
    });
    map.on("click", (e) => {
      const clickable = layersRef.current.filter((l) => l.kind === "points").map((l) => `ov-${l.id}-dot`).filter((id) => map.getLayer(id));
      if (clickable.length) {
        const hit = map.queryRenderedFeatures(e.point, { layers: clickable })[0];
        if (hit) return handlers.current.onFeature?.(hit.properties);
      }
      const point = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      handlers.current.onPick?.({ ...point, here: whatIsHere(point, { positioned: handlers.current.positioned || positionedPlaces() }) });
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      pinsRef.current.forEach((p) => p.marker.remove());
      pinsRef.current.clear();
      markerRef.current?.remove();
      markerRef.current = null;
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Στρώματα.
  useEffect(() => {
    if (readyRef.current && mapRef.current) syncLayers(mapRef.current, layers);
  }, [layers]);

  // Επιλεγμένο σημείο.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncLayers(map, layersRef.current, pick);
  }, [pick, layers]);

  // Εστίαση.
  const focusKey = JSON.stringify(focus || null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (focus.bounds) map.fitBounds(focus.bounds, { padding: focus.padding ?? 40, duration: focus.instant ? 0 : 600, maxZoom: focus.maxZoom ?? 13 });
    else if (focus.instant) map.jumpTo({ center: [focus.lng, focus.lat], zoom: focus.zoom || 11 });
    else map.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom || 11, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Καρφίτσα που μετακινείται.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draggable) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const m = new maplibregl.Marker({ draggable: true, color: MAP_COLORS.accent }).setLngLat([draggable.lng, draggable.lat]).addTo(map);
      m.getElement().dataset.mapMarker = "true";
      m.on("dragend", () => {
        const p = m.getLngLat();
        handlers.current.onDrag?.({ lng: p.lng, lat: p.lat });
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLngLat([draggable.lng, draggable.lat]);
    }
  }, [draggable?.lng, draggable?.lat, !!draggable]);

  // Ετικέτες-κουμπιά (π.χ. ημερομηνίες αιτημάτων). Ενημερώνονται χωρίς να ξαναφτιάχνονται.
  const markersKey = JSON.stringify(markers || null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pins = pinsRef.current;
    const wanted = new Set();
    for (const m of markers || []) {
      wanted.add(m.id);
      let pin = pins.get(m.id);
      if (!pin) {
        // Το MapLibre μετακινεί το εξωτερικό στοιχείο με transform· το κουμπί μέσα
        // μπορεί έτσι να έχει δικό του (μεγέθυνση στο πέρασμα).
        const wrap = document.createElement("div");
        // Χωρίς onMarker η ετικέτα είναι μόνο ένδειξη (όχι κουμπί).
        const el = document.createElement(onMarker ? "button" : "div");
        wrap.appendChild(el);
        if (onMarker) el.type = "button";
        else el.setAttribute("aria-hidden", "true");
        el.className = m.shape === "pin" ? "mv-drop" : m.shape === "badge" ? "mv-badge" : "mv-pin";
        if (m.shape === "pin") wrap.style.lineHeight = "0"; // η μύτη ακριβώς στο σημείο, χωρίς κενό από γραμμή κειμένου
        el.dataset.mapPin = m.id;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          handlers.current.onMarker?.(m.id);
        });
        el.addEventListener("mouseenter", () => handlers.current.onMarkerHover?.(m.id));
        el.addEventListener("mouseleave", () => handlers.current.onMarkerHover?.(null));
        if (m.shape === "badge") wrap.style.lineHeight = "0";
        const marker = new maplibregl.Marker({ element: wrap, anchor: m.shape === "pin" ? "bottom" : "center" }).setLngLat([m.lng, m.lat]).addTo(map);
        pin = { marker, el };
        pins.set(m.id, pin);
      }
      pin.marker.setLngLat([m.lng, m.lat]);
      if (m.shape === "pin") {
        if (!pin.el.firstChild) {
          pin.el.innerHTML = '<svg width="24" height="31" viewBox="0 0 28 36" aria-hidden="true"><path d="M14 34.5S2.5 22.5 2.5 13.5a11.5 11.5 0 0 1 23 0C25.5 22.5 14 34.5 14 34.5Z"/><text x="14" y="18" text-anchor="middle"></text></svg>';
        }
        pin.el.querySelector("text").textContent = m.label;
      } else if (m.shape === "badge") {
        pin.el.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${m.icon || ""}</svg>`;
        pin.el.style.color = m.color || MAP_COLORS.point;
        pin.el.dataset.age = m.age || "fresh";
        if (m.category) pin.el.dataset.mapCategory = m.category;
      } else pin.el.textContent = m.label;
      if (onMarker) pin.el.setAttribute("aria-label", m.ariaLabel || m.label);
      pin.el.dataset.active = m.active ? "true" : "false";
      pin.el.dataset.static = onMarker ? "false" : "true";
      pin.marker.getElement().style.zIndex = m.active ? "3" : "1";
    }
    for (const [id, pin] of pins) {
      if (!wanted.has(id)) {
        pin.marker.remove();
        pins.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey]);

  return (
    <>
      <style>{CSS}</style>
      <div ref={box} role="region" aria-label={t("label")} style={{ position: "absolute", inset: 0 }} />
    </>
  );
}

// Συγχρονίζει τα στρώματα του χρήστη και το σημάδι επιλογής με τον χάρτη.
function syncLayers(map, layers, pick) {
  const withLabels = Boolean(MAP_URL);
  const wanted = new Set();
  for (const l of layers) {
    const src = `ov-${l.id}`;
    wanted.add(l.id);
    if (map.getSource(src)) {
      map.getSource(src).setData(l.data || EMPTY);
      continue;
    }
    map.addSource(src, { type: "geojson", data: l.data || EMPTY });
    const color = l.color || MAP_COLORS.point;
    if (l.kind === "lines") {
      map.addLayer({ id: `${src}-line`, type: "line", source: src, paint: { "line-color": color, "line-width": l.width || 3, ...(l.dash ? { "line-dasharray": l.dash } : {}) }, layout: { "line-cap": "round", "line-join": "round" } });
    } else if (l.kind === "areas") {
      map.addLayer({ id: `${src}-fill`, type: "fill", source: src, paint: { "fill-color": color, "fill-opacity": 0.15 } });
      map.addLayer({ id: `${src}-line`, type: "line", source: src, paint: { "line-color": color, "line-width": 1.5 } });
    } else {
      map.addLayer({
        id: `${src}-dot`,
        type: "circle",
        source: src,
        paint: {
          "circle-radius": l.radius || 6,
          "circle-color": ["case", ["==", ["get", "review"], true], MAP_COLORS.review, ["==", ["get", "selected"], true], MAP_COLORS.accent, color],
          "circle-stroke-color": MAP_COLORS.pointRing,
          "circle-stroke-width": 2,
        },
      });
      if (withLabels) {
        map.addLayer({
          id: `${src}-label`,
          type: "symbol",
          source: src,
          minzoom: l.labelMinZoom ?? 8,
          layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Medium"], "text-size": 12, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true },
          paint: { "text-color": "#16283C", "text-halo-color": "#FFFFFF", "text-halo-width": 1.5 },
        });
      }
    }
  }
  // Σημάδι επιλογής.
  const pickData = pick ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [pick.lng, pick.lat] } }] } : EMPTY;
  if (map.getSource("ov-pick")) map.getSource("ov-pick").setData(pickData);
  else {
    map.addSource("ov-pick", { type: "geojson", data: pickData });
    map.addLayer({ id: "ov-pick-dot", type: "circle", source: "ov-pick", paint: { "circle-radius": 8, "circle-color": MAP_COLORS.pick, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 3 } });
  }
  // Αφαίρεση στρωμάτων που δεν υπάρχουν πια.
  for (const style of map.getStyle().layers || []) {
    const m = /^ov-(.+)-(dot|label|line|fill)$/.exec(style.id);
    if (m && m[1] !== "pick" && !wanted.has(m[1])) map.removeLayer(style.id);
  }
  for (const id of Object.keys(map.getStyle().sources || {})) {
    const m = /^ov-(.+)$/.exec(id);
    if (m && m[1] !== "pick" && !wanted.has(m[1]) && !map.getStyle().layers.some((s) => s.source === id)) map.removeSource(id);
  }
}
