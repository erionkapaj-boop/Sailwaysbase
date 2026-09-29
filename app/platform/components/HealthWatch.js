"use client";
import { useEffect } from "react";
import { reportAppIssue } from "../../../lib/platform/health";

// Ό,τι σπάει στη σελίδα χωρίς να το πιάσει κανείς (σφάλμα κώδικα, αίτημα
// που απέτυχε και δεν το χειρίστηκε η οθόνη) πηγαίνει στην «Υγεία
// εφαρμογής». Δεν δείχνει τίποτα στον χρήστη.
const NOISE = /ResizeObserver loop|Script error\.?$|AbortError|The user aborted/i;

function codeFor(message) {
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(message)) return "network";
  if (/ChunkLoadError|Loading chunk/i.test(message)) return "chunk_load";
  return null;
}

export default function HealthWatch() {
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
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
