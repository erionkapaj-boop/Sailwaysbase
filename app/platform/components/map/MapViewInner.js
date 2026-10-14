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
// Ο εργάτης της βιβλιοθήκης σερβίρεται από τον φάκελο public (scripts/copy-maplibre.mjs).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const GREECE_BOUNDS = [[19.2, 34.6], [28.6, 41.8]];
const EMPTY = { type: "FeatureCollection", features: [] };

const CSS = `
.maplibregl-ctrl-group { border-radius: 12px !important; box-shadow: 0 1px 3px rgba(22,40,60,0.12) !important; }
.maplibregl-ctrl-group button { width: 44px !important; height: 44px !important; }
.maplibregl-ctrl-attrib { font-size: 11px !important; }
.maplibregl-canvas { outline: none; }
`;

export default function MapViewInner({ layers = [], onPick, onFeature, focus, pick, draggable, onDrag, positioned, interactive = true }) {
  const t = useTranslations("Map");
  const lang = useLocale();
  const box = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const markerRef = useRef(null);
  const handlers = useRef({});
  handlers.current = { onPick, onFeature, onDrag, positioned };
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
    if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

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
    if (focus.bounds) map.fitBounds(focus.bounds, { padding: 40, duration: 600, maxZoom: 13 });
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
      map.addLayer({ id: `${src}-line`, type: "line", source: src, paint: { "line-color": color, "line-width": l.width || 3 }, layout: { "line-cap": "round", "line-join": "round" } });
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
