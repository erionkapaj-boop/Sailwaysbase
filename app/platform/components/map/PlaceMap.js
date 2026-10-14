"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import MapView from "./MapView";
import { usePlacePositions } from "./usePlacePositions";
import { locatePoint, distanceNm } from "../../../../lib/platform/geo";
import { useLocalData } from "../../useLocalData";
import { colors } from "../../../../lib/platform/theme";

// Μικρός χάρτης «Πού» για ένα αίτημα ή μια κράτηση: το λιμάνι αναχώρησης, ή τη
// διαδρομή από → προς. Αν κανένα μέρος δεν αναγνωρίζεται με βεβαιότητα, δεν
// δείχνει τίποτα (ποτέ λάθος θέση). Ο χάρτης φορτώνεται μόνο όταν πλησιάσει
// στην οθόνη και αφαιρείται όταν απομακρυνθεί (ο φυλλομετρητής αντέχει λίγους
// χάρτες ταυτόχρονα).
//   from, to       τα μέρη όπως αποθηκεύονται («Νάουσα (Πάρος)», «Λαύριο», περιοχή)
//   fallback       εναλλακτικό «από» (π.χ. η περιοχή), αν το from δεν αναγνωρίζεται
//   showDistance   γράφει την ευθεία απόσταση κάτω από τον χάρτη (διαδρομές)
export default function PlaceMap({ from, to, fallback, height = 200, showDistance = false, style }) {
  const t = useTranslations("Map");
  const L = useLocalData();
  const locale = useLocale();
  const positioned = usePlacePositions();
  const a = useMemo(() => locatePoint(from, { positioned }) || locatePoint(fallback, { positioned }), [from, fallback, positioned]);
  const sameAsFrom = !to || String(to).trim() === String(from || "").trim();
  const b = useMemo(() => (sameAsFrom ? null : locatePoint(to, { positioned })), [to, sameAsFrom, positioned]);

  const box = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return setNear(true);
    const io = new IntersectionObserver((es) => setNear(es[0].isIntersecting), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [Boolean(a)]);

  if (!a) return null;

  const name = (loc, text) => L.text(loc.kind === "place" ? loc.place.name : loc.region || text);
  const markers = [{ id: "from", lng: a.lng, lat: a.lat, label: name(a, from) }];
  let focus;
  let layers = [];
  if (b) {
    markers.push({ id: "to", lng: b.lng, lat: b.lat, label: name(b, to) });
    layers = [
      {
        id: "route",
        kind: "lines",
        width: 3,
        data: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } }] },
      },
    ];
    focus = { bounds: [[Math.min(a.lng, b.lng), Math.min(a.lat, b.lat)], [Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)]], padding: 56, maxZoom: 10, instant: true };
  } else if (a.kind === "region") {
    focus = { bounds: a.bounds, padding: 30, maxZoom: 9, instant: true };
  } else {
    focus = { lng: a.lng, lat: a.lat, zoom: 9.5, instant: true };
  }
  const miles = b ? Math.round(distanceNm(a, b)) : null;
  const nf = new Intl.NumberFormat(locale);

  return (
    <div ref={box} data-place-map style={{ marginTop: 14, ...style }}>
      {near ? (
        <MapView height={height} markers={markers} layers={layers} focus={focus} gestures="tap" />
      ) : (
        <div aria-hidden="true" style={{ height, borderRadius: 14, background: "#E4ECEF", border: `1px solid ${colors.border}` }} />
      )}
      {showDistance && miles != null && (
        <p data-place-map-distance style={{ margin: "8px 2px 0", fontSize: 13, color: colors.inkSoft }}>
          {t("straightDistance", { miles: nf.format(miles) })}
        </p>
      )}
    </div>
  );
}
