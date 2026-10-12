"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Toast from "./Toast";
import { onWriteResult } from "../../../lib/platform/supabaseClient";
import { WRITE_MESSAGES, FAILURE_MESSAGE } from "../../../lib/platform/feedbackMessages";
import { colors } from "../../../lib/platform/theme";

// «Κάτι έγινε»: όταν πετύχει μια αλλαγή, ο χρήστης το βλέπει αμέσως, όπου κι αν βρίσκεται η
// σελίδα του:
//  1. ένα σύντομο μήνυμα κάτω στην οθόνη («Αποθηκεύτηκε», «Το προφίλ εγκρίθηκε»)·
//  2. το κουμπί που πάτησε γίνεται πράσινο με ένα τικ για λίγο.
// Έρχεται από ένα σήμα στο σημείο που περνούν όλες οι αλλαγές προς τη βάση
// (supabaseClient.onWriteResult), άρα δουλεύει σε κάθε οθόνη χωρίς να χρειάζεται κάθε
// οθόνη να το γράφει. Τι λέει για κάθε ενέργεια: lib/platform/feedbackMessages.js.
// Αν μια αλλαγή αποτύχει απρόσμενα (δίκτυο, δικαιώματα, σφάλμα διακομιστή) το λέει επίσης.
// Αναμενόμενες αρνήσεις (π.χ. «δεν φτάνουν τα credits») τις δείχνει η ίδια η οθόνη.
//
// Για ενέργειες που δεν περνούν από εδώ: useFeedback().done("Κείμενο") ή .fail("Κείμενο").

const FeedbackContext = createContext({ done() {}, fail() {} });
export const useFeedback = () => useContext(FeedbackContext);

const CSS = `
.sf-ok { background: ${colors.success} !important; border-color: ${colors.success} !important; color: #fff !important;
  transition: background .2s ease, border-color .2s ease, color .2s ease; }
.sf-ok::before { content: ""; display: inline-block; width: 1em; height: 1em; margin-right: .45em; vertical-align: -.15em;
  background: no-repeat center / contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M3.5 8.5l3 3 6-7' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }
`;

// Πολλές αποθηκεύσεις γράφουν σε περισσότερους από έναν πίνακες (προφίλ, γλώσσες…): ένα μήνυμα
// ανά ενέργεια, όχι ένα ανά εγγραφή.
const GROUP_MS = 900;
// Πόσο πριν το σήμα μετράει ότι το πάτημα ενός κουμπιού ήταν η αιτία.
const CLICK_WINDOW_MS = 6000;

export default function FeedbackProvider({ children }) {
  const [toast, setToast] = useState(null);
  const lastDoneAt = useRef(0);
  const lastFailAt = useRef(0);
  const lastClick = useRef(null);

  const show = useCallback((text, tone) => setToast({ id: Date.now() + Math.random(), text, tone }), []);
  const done = useCallback((text) => show(text, "done"), [show]);
  const fail = useCallback((text) => show(text || FAILURE_MESSAGE, "fail"), [show]);

  useEffect(() => {
    const onClick = (e) => {
      const el = e.target?.closest?.("button, [role=button]");
      if (el && !el.disabled) lastClick.current = { el, t: Date.now() };
    };
    document.addEventListener("click", onClick, true);

    const off = onWriteResult((ev) => {
      const message = WRITE_MESSAGES[ev.key];
      if (!message) return;
      const now = Date.now();
      if (ev.ok) {
        if (now - lastDoneAt.current < GROUP_MS) return;
        lastDoneAt.current = now;
        done(message);
        const c = lastClick.current;
        if (c && now - c.t < CLICK_WINDOW_MS && c.el.isConnected) {
          const el = c.el;
          lastClick.current = null;
          el.classList.add("sf-ok");
          setTimeout(() => el.classList.remove("sf-ok"), 1600);
        }
        return;
      }
      // Απρόσμενη αποτυχία: δίκτυο, δικαιώματα, σφάλμα διακομιστή. Οι αναμενόμενες αρνήσεις
      // (400/409/422, π.χ. «δεν φτάνουν τα credits») φαίνονται ήδη στην οθόνη που τις προκάλεσε.
      const unexpected = ev.status === 0 || ev.status >= 500 || ev.status === 401 || ev.status === 403;
      if (unexpected && now - lastFailAt.current > GROUP_MS) {
        lastFailAt.current = now;
        fail();
      }
    });
    return () => {
      document.removeEventListener("click", onClick, true);
      off();
    };
  }, [done, fail]);

  const api = useMemo(() => ({ done, fail }), [done, fail]);

  return (
    <FeedbackContext.Provider value={api}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {children}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.text}
          tone={toast.tone}
          durationMs={toast.tone === "fail" ? 5200 : 2800}
          onDismiss={() => setToast((t) => (t && t.id === toast.id ? null : t))}
        />
      )}
    </FeedbackContext.Provider>
  );
}
