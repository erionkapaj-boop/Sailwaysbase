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

// ---- Φάση 2 (0117) --------------------------------------------------------

// Μία «επίσκεψη» = μία καρτέλα. Τυχαίος κωδικός, χωρίς σχέση με τον χρήστη.
export function sessionId() {
  if (typeof window === "undefined") return null;
  try {
    let id = sessionStorage.getItem("sf_hs");
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 36);
      sessionStorage.setItem("sf_hs", id);
    }
    return id;
  } catch {
    return null;
  }
}

// Ένα βήμα μιας ροής (βλ. flow_steps() στη βάση). Μόνο όνομα ροής και βήματος.
const flowSent = new Set();
export function trackFlow(flow, step) {
  if (typeof window === "undefined" || !supabase) return;
  const sid = sessionId();
  const key = `${flow}:${step}`;
  if (!sid || flowSent.has(key)) return;
  flowSent.add(key);
  supabase.rpc("track_flow", { p_flow: flow, p_step: step, p_session: sid }).then(() => {}, () => {});
}

// Η ίδια αποτυχία στην ίδια σελίδα 3 φορές μέσα σε 10 λεπτά = ο χρήστης κολλάει.
const failures = new Map();
export function noteFailure(code) {
  if (typeof window === "undefined" || !code) return;
  const key = `${code}@${window.location.pathname}`;
  const now = Date.now();
  const recentTimes = (failures.get(key) || []).filter((t) => now - t < 10 * 60_000);
  recentTimes.push(now);
  if (recentTimes.length >= 3) {
    const minutes = Math.max(1, Math.round((now - recentTimes[0]) / 60_000));
    reportAppIssue({ kind: "stuck", code, detail: `${recentTimes.length} αποτυχίες σε ${minutes} λεπτά` });
    failures.delete(key);
  } else {
    failures.set(key, recentTimes);
  }
}

// Από ένα σφάλμα, ένας σταθερός κωδικός: ο κωδικός της βάσης αν μοιάζει με
// τέτοιον (π.χ. "request_not_open"), αλλιώς το είδος του σφάλματος.
export function issueCode(err) {
  const msg = err?.message || String(err || "");
  if (/^[a-z][a-z0-9_]{2,60}$/.test(msg)) return msg;
  if (err?.code && /^[A-Za-z0-9_.-]{2,40}$/.test(String(err.code))) return `db_${err.code}`;
  return err?.name && err.name !== "Error" ? err.name : "unexpected";
}
