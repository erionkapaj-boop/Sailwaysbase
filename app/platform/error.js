"use client";
import { useEffect } from "react";
import { reportAppIssue } from "../../lib/platform/health";
import { container, h1, muted, button } from "../../lib/platform/theme";

// Όταν μια οθόνη σπάσει, ο χρήστης βλέπει αυτό αντί για λευκή σελίδα, και το
// σφάλμα φτάνει στην «Υγεία εφαρμογής» (0116).
export default function PlatformError({ error, reset }) {
  useEffect(() => {
    reportAppIssue({ kind: "crash", code: error?.name || "render_error", detail: error?.message });
  }, [error]);

  return (
    <div style={{ ...container, paddingTop: 48, paddingBottom: 48 }}>
      <h1 style={{ ...h1, fontSize: 24 }}>Η σελίδα δεν φόρτωσε σωστά</h1>
      <p style={{ ...muted, marginTop: 8 }}>Το πρόβλημα καταγράφηκε.</p>
      <button type="button" style={{ ...button("primary"), marginTop: 18 }} onClick={() => reset()}>
        Ξαναδοκίμασε
      </button>
    </div>
  );
}
