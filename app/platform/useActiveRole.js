"use client";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { ROLES_CHANGED_EVENT, ROLE_KEYS } from "../../lib/platform/userRoles";

// Ο τρέχων ρόλος του συνδεδεμένου χρήστη (users.active_role), ένα σημείο για κάθε οθόνη που εξαρτάται από αυτόν (avatar, μπάρα
// πλοήγησης). Διαβάζεται από τη γραμμή χρήστη που φορτώνει ήδη η σύνδεση· όταν αλλάζει από την οθόνη «Οι ρόλοι μου» ενημερώνεται αμέσως.
// Αν η βάση δεν έχει ακόμη τη στήλη, προκύπτει από τα υπάρχοντα (διαχειριστής / επαγγελματίας / πελάτης).
export function legacyRole({ isAdmin, role }) {
  if (isAdmin) return "admin";
  return role === "skipper" ? "professional" : "client";
}

export default function useActiveRole() {
  const { session, userRow, role, isAdmin } = useAuth();
  const [override, setOverride] = useState(null);
  const stored = userRow?.active_role;

  useEffect(() => {
    const onChange = (e) => ROLE_KEYS.includes(e.detail?.active) && setOverride(e.detail.active);
    window.addEventListener(ROLES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ROLES_CHANGED_EVENT, onChange);
  }, []);
  // Ό,τι διαβάστηκε νεότερο από τη βάση (π.χ. αλλαγή σε άλλη καρτέλα) υπερισχύει της τοπικής αλλαγής.
  useEffect(() => setOverride(null), [stored, session?.user?.id]);

  if (!session) return "guest";
  return override || (ROLE_KEYS.includes(stored) ? stored : legacyRole({ isAdmin, role }));
}
