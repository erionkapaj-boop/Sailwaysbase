"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false while React hydrates the server HTML (and on the server), true right after. Unlike a state flag set in an
// effect, this is evaluated per component during hydration: a part of the tree that React hydrates later (under load)
// still renders with the server's values first, so a state change that arrived in between cannot cause a mismatch.
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
