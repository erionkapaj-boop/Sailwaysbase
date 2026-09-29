"use client";
import { supabase } from "./supabaseClient";

// Υγεία εφαρμογής (0116): ό,τι απρόβλεπτο είδε ένας χρήστης φτάνει στον
// ιδιοκτήτη μόνο του. Μόνο κωδικός, σελίδα και σύντομο τεχνικό μήνυμα· η
// βάση αφαιρεί ids, τηλέφωνα και email. Ποτέ δεν μπλοκάρει ούτε δείχνει
// τίποτα στον χρήστη — αν αποτύχει, απλώς χάνεται.

const recent = new Map();
let sentThisPage = 0;

export function reportAppIssue({ kind = "error", code, detail } = {}) {
  if (typeof window === "undefined" || !supabase) return;
  const page = window.location.pathname;
  const key = `${kind}:${code}@${page}`;
  const now = Date.now();
  // Ίδιο πρόβλημα στην ίδια σελίδα: μία φορά το λεπτό· έως 20 ανά φόρτωση.
  if (recent.has(key) && now - recent.get(key) < 60_000) return;
  if (sentThisPage >= 20) return;
  recent.set(key, now);
  sentThisPage += 1;
  supabase
    .rpc("report_app_issue", {
      p_kind: kind,
      p_code: code || "unexpected",
      p_page: page,
      p_detail: detail ? String(detail).slice(0, 300) : null,
    })
    .then(() => {}, () => {});
}

// Από ένα σφάλμα, ένας σταθερός κωδικός: ο κωδικός της βάσης αν μοιάζει με
// τέτοιον (π.χ. "request_not_open"), αλλιώς το είδος του σφάλματος.
export function issueCode(err) {
  const msg = err?.message || String(err || "");
  if (/^[a-z][a-z0-9_]{2,60}$/.test(msg)) return msg;
  if (err?.code && /^[A-Za-z0-9_.-]{2,40}$/.test(String(err.code))) return `db_${err.code}`;
  return err?.name && err.name !== "Error" ? err.name : "unexpected";
}
