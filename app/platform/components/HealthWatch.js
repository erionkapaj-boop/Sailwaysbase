"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { reportAppIssue } from "../../../lib/platform/health";

// Ό,τι σπάει στη σελίδα χωρίς να το πιάσει κανείς (σφάλμα κώδικα, αίτημα
// που απέτυχε και δεν το χειρίστηκε η οθόνη) πηγαίνει στην «Υγεία
// εφαρμογής». Επίσης (0117) το πήγαινε-έλα ανάμεσα σε δύο σελίδες και το
// συνεχές ξαναφόρτωμα. Δεν δείχνει τίποτα στον χρήστη.
const NOISE = /ResizeObserver loop|Script error\.?$|AbortError|The user aborted/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const clean = (path) => path.replace(UUID, ":id");

function codeFor(message) {
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(message)) return "network";
  if (/ChunkLoadError|Loading chunk/i.test(message)) return "chunk_load";
  return null;
}

export default function HealthWatch() {
  const pathname = usePathname();
  const trail = useRef([]);

  useEffect(() => {
    function onError(e) {
      const message = e?.message || String(e?.error || "");
      // Σφάλματα από επεκτάσεις του browser ή ξένα scripts δεν μας αφορούν.
      if (e?.filename && !e.filename.startsWith(window.location.origin)) return;
      if (!message || NOISE.test(message)) return;
      reportAppIssue({ kind: "crash", code: codeFor(message) || e?.error?.name || "script_error", detail: message });
    }
    function onRejection(e) {
      const reason = e?.reason;
      const message = reason?.message || String(reason || "");
      if (!message || NOISE.test(message)) return;
      reportAppIssue({ kind: "error", code: codeFor(message) || "unhandled_promise", detail: message });
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // Ξαναφόρτωμα της ίδιας σελίδας 4 φορές μέσα σε 2 λεπτά.
    try {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      if (nav?.type === "reload") {
        const key = `sf_rl:${clean(window.location.pathname)}`;
        const now = Date.now();
        const times = JSON.parse(sessionStorage.getItem(key) || "[]").filter((t) => now - t < 120_000);
        times.push(now);
        if (times.length >= 4) {
          reportAppIssue({ kind: "stuck", code: "reload_loop", detail: `${times.length} φορές σε 2 λεπτά` });
          sessionStorage.removeItem(key);
        } else {
          sessionStorage.setItem(key, JSON.stringify(times));
        }
      }
    } catch {
      // χωρίς sessionStorage: απλώς δεν μετράμε
    }

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Πήγαινε-έλα: οι τελευταίες 6 σελίδες εναλλάσσονται ανάμεσα σε δύο,
  // μέσα σε 3 λεπτά (Α → Β → Α → Β → Α → Β).
  // Κρατιέται και στο sessionStorage, ώστε να μετρά και με πλήρη φόρτωση σελίδας.
  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    // Με τα ids: λίστα → κράτηση 1 → λίστα → κράτηση 2 είναι κανονική
    // περιήγηση, όχι πήγαινε-έλα. Τα ids φεύγουν μόνο στην αναφορά.
    const path = pathname;
    let saved = trail.current;
    try {
      saved = JSON.parse(sessionStorage.getItem("sf_trail") || "[]");
    } catch {
      // χωρίς sessionStorage: μόνο στη μνήμη
    }
    const t = saved.filter((s) => now - s.at < 180_000);
    if (t[t.length - 1]?.path !== path) t.push({ path, at: now });
    let last = t.slice(-6);
    if (last.length === 6) {
      const [a, b] = [last[0].path, last[1].path];
      const alternates = a !== b && last.every((s, i) => s.path === (i % 2 === 0 ? a : b));
      if (alternates) {
        reportAppIssue({ kind: "stuck", code: "pingpong", detail: `${clean(a)} ↔ ${clean(b)}` });
        last = [];
      }
    }
    trail.current = last;
    try {
      sessionStorage.setItem("sf_trail", JSON.stringify(last));
    } catch {
      // όπως πάνω
    }
  }, [pathname]);

  return null;
}
