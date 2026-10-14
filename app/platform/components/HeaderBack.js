"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

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

export function useHeaderBack() {
  return useContext(Ctx);
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
