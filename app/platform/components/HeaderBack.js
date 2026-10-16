"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useHydrated } from "../useHydrated";

// Το «Πίσω» ζει πάντα στην ίδια θέση: αριστερά στην κεφαλίδα, δίπλα στο μενού.
// Η κεφαλίδα εκθέτει μια υποδοχή (slot)· κάθε BackButton της σελίδας (βήμα
// οδηγού, επιστροφή σε λίστα) εμφανίζεται εκεί αντί για μέσα στο περιεχόμενο.
// Όσο καμία σελίδα δεν έχει δικό της, η κεφαλίδα δείχνει το προεπιλεγμένο
// βέλος (προηγούμενη οθόνη) σε κάθε οθόνη που δεν είναι αρχική ενότητα.
const Ctx = createContext(null);

export function HeaderBackProvider({ children }) {
  const [slot, setSlot] = useState(null);
  const [custom, setCustom] = useState(0);
  const register = useCallback(() => {
    setCustom((n) => n + 1);
    return () => setCustom((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ slot, setSlot, custom, register }), [slot, custom, register]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// While React hydrates, every reader sees what the server rendered: no slot (each BackButton in its own place) and no
// page button registered. The slot is set as soon as the header commits, which under load can be before a later part
// of the page has hydrated; rendering that part with the slot (a portal into the header) did not match the server HTML
// and caused React #418 (seen on /platform/search, 16/10/2026). Right after hydration the real values apply.
export function useHeaderBack() {
  const ctx = useContext(Ctx);
  const hydrated = useHydrated();
  if (!ctx || hydrated) return ctx;
  return { ...ctx, slot: null, custom: 0 };
}

// Οι αρχικές ενότητες (κάτω μπάρα, αρχική, είσοδος, διαχείριση): χωρίς βέλος.
const ROOTS = [
  "/platform",
  "/",
  "/platform/requests",
  "/platform/bookings",
  "/platform/profile",
  "/platform/wallet",
  "/platform/availability",
  "/platform/board",
  "/platform/professionals",
  "/platform/login",
  "/platform/experiences",
];
export function isRootPath(pathname) {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  return ROOTS.includes(p) || p.startsWith("/platform/admin");
}
