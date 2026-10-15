"use client";
import { useEffect, useState } from "react";

// useState που ΘΥΜΑΤΑΙ ό,τι έχει συμπληρωθεί όσο η καρτέλα μένει ανοιχτή: αν ο
// χρήστης φύγει από την οθόνη και γυρίσει με «πίσω», η φόρμα τον βρίσκει όπως
// την άφησε. Κανόνας για κάθε φόρμα πολλών βημάτων (docs/DESIGN.md «Πίσω»).
// Διαβάζει μετά το mount (όχι στον server render), ώστε να μη διαφέρει η πρώτη
// εικόνα. Χωρίς sessionStorage (ιδιωτικό παράθυρο) λειτουργεί σαν απλό useState.
export function useSessionState(key, initial) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (value === undefined) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value, ready]);
  return [value, setValue];
}

// Νέα, καθαρή φόρμα: σβήνει ό,τι είχε θυμηθεί η φόρμα με αυτό το πρόθεμα.
export function clearSessionState(prefix) {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(prefix)) sessionStorage.removeItem(k);
  } catch {}
}
