"use client";
import { useEffect, useMemo, useState } from "react";
import { positionedPlaces } from "../../../../lib/platform/geo";
import { placePositionsPublic } from "../../../../lib/platform/db";

// Οι θέσεις των μερών (αυτόματες + διορθώσεις του ιδιοκτήτη). Οι διορθώσεις
// φορτώνονται μία φορά ανά σελίδα· μέχρι τότε (ή αν αποτύχουν) ισχύουν οι αυτόματες.
let cached = null;
let pending = null;

function loadOverrides() {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = placePositionsPublic()
      .then((o) => (cached = o || {}))
      .catch(() => {
        pending = null;
        return {};
      });
  }
  return pending;
}

export function usePlacePositions() {
  const [overrides, setOverrides] = useState(cached || {});
  useEffect(() => {
    let alive = true;
    loadOverrides().then((o) => alive && setOverrides(o));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => positionedPlaces({ overrides }), [overrides]);
}
