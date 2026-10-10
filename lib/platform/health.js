"use client";
import { supabase, onRpcResult } from "./supabaseClient";

// Υγεία εφαρμογής (0116): ό,τι απρόβλεπτο είδε ένας χρήστης φτάνει στον
// ιδιοκτήτη μόνο του. Μόνο κωδικός, σελίδα και σύντομο τεχνικό μήνυμα· η
// βάση αφαιρεί ids, τηλέφωνα και email. Ποτέ δεν μπλοκάρει ούτε δείχνει
// τίποτα στον χρήστη — αν αποτύχει, απλώς χάνεται.
//
// 0120: κάθε αναφορά φέρνει και «πλαίσιο», ώστε να μπορεί να διορθωθεί:
// έκδοση της εφαρμογής, συσκευή/browser σε γενική μορφή, αν ο ιδιοκτήτης
// έβλεπε «ως χρήστης», και τα τελευταία βήματα (σελίδα, κουμπί, ενέργεια
// στη βάση). Ποτέ ό,τι γράφει ο χρήστης σε πεδία· η βάση ξαναφιλτράρει.

const recent = new Map();
let sentThisPage = 0;

// ---- Τελευταία βήματα -------------------------------------------------------

const TRAIL_MAX = 8;
let trail = [];
try {
  if (typeof window !== "undefined") trail = JSON.parse(sessionStorage.getItem("sf_steps") || "[]").slice(-TRAIL_MAX);
} catch {
  trail = [];
}

// Κείμενο για τα βήματα: χωρίς email, μακριούς αριθμούς και ids, κομμένο.
export function cleanStep(text, max = 60) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/[^\s@]+@[^\s@]+/g, "[email]")
    .replace(/\+?\d[\d\s.-]{5,}\d/g, "[αριθμός]")
    .trim()
    .slice(0, max);
}

export function addStep(text) {
  const step = cleanStep(text, 90);
  if (!step || trail[trail.length - 1] === step) return;
  trail = [...trail, step].slice(-TRAIL_MAX);
  try {
    sessionStorage.setItem("sf_steps", JSON.stringify(trail));
  } catch {
    // χωρίς sessionStorage: κρατιούνται μόνο στη μνήμη
  }
}

// «Android · Chrome», «iOS · Safari · εφαρμογή» κ.λπ. Ποτέ ολόκληρο το user agent.
export function deviceLabel(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "άλλο";
  const browser = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung" : /FxiOS|Firefox\//.test(ua) ? "Firefox"
    : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "άλλος";
  let installed = false;
  try {
    installed = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)")?.matches;
  } catch {
    installed = false;
  }
  return [os, browser, installed ? "εφαρμογή" : null].filter(Boolean).join(" · ");
}

export function issueContext() {
  let viewAs = false;
  try {
    viewAs = Boolean(sessionStorage.getItem("sf_view_as"));
  } catch {
    viewAs = false;
  }
  return {
    v: process.env.NEXT_PUBLIC_APP_VERSION || "local",
    d: deviceLabel(),
    va: viewAs,
    t: trail.slice(-TRAIL_MAX),
  };
}

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
  const args = {
    p_kind: kind,
    p_code: code || "unexpected",
    p_page: page,
    p_detail: detail ? String(detail).slice(0, 300) : null,
  };
  supabase.rpc("report_app_issue", { ...args, p_context: issueContext() }).then(
    ({ error }) => {
      // Βάση χωρίς το 0120 ακόμα: στέλνεται χωρίς πλαίσιο.
      if (error?.code === "PGRST202") supabase.rpc("report_app_issue", args).then(() => {}, () => {});
    },
    () => {}
  );
}

// ---- Ενέργειες στη βάση ------------------------------------------------------
// Κάθε κλήση γίνεται «βήμα». Αποτυχίες που ΔΕΝ είναι αναμενόμενη απάντηση της
// εφαρμογής (οι δικές μας απαντήσεις έρχονται ως P0001, π.χ. insufficient_wallet)
// αναφέρονται ως θέμα «Αποτυχία ενέργειας στη βάση»: δικαιώματα, συνάρτηση που
// λείπει, λάθος δεδομένα. Όχι οι αποτυχίες δικτύου και η λήξη συνεδρίας, που
// είναι θόρυβος (τις πιάνει το noteFailure αν επαναλαμβάνονται).
const OWN_CALLS = new Set(["report_app_issue", "track_flow", "log_place_miss"]);
// Αναγνώσεις και κλήσεις παρασκηνίου (μετρητές, «τελευταία δραστηριότητα»):
// όταν πετυχαίνουν δεν είναι «βήματα», αλλιώς γεμίζουν τη λίστα και σπρώχνουν
// έξω τις ενέργειες του χρήστη. Οι αποτυχίες τους καταγράφονται κανονικά.
const QUIET_WHEN_OK = /^(my_|touch_|list_|get_|search_|has_|is_|skipper_|phone_registration_status$|admin_(list|health|flow|place|overview|counts|account))/;
const NOT_A_BUG = (code) => !code || code === "P0001" || /^PGRST30/.test(code);

if (typeof window !== "undefined") {
  onRpcResult((fn, error) => {
    if (OWN_CALLS.has(fn)) return;
    if (!error) return QUIET_WHEN_OK.test(fn) ? undefined : addStep(fn);
    const code = error.code ? String(error.code) : error.message === "network" || error instanceof TypeError ? "network" : "x";
    addStep(`${fn} → ${code === "P0001" ? cleanStep(error.message, 40) : code}`);
    if (!NOT_A_BUG(code) && code !== "network") {
      reportAppIssue({ kind: "rpc", code: `${fn}.${code}`, detail: error.message || error.details || "" });
    }
  });
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

// Μέρος που δεν βρέθηκε στο λεξικό (0119): μόνο το κείμενο και η περιοχή
// που διάλεξε τελικά ο πελάτης.
const missSent = new Set();
export function logPlaceMiss(query, regionId) {
  if (typeof window === "undefined" || !supabase) return;
  const q = String(query || "").trim();
  if (q.length < 2 || missSent.has(q.toLowerCase())) return;
  missSent.add(q.toLowerCase());
  supabase
    .rpc("log_place_miss", { p_query: q, p_region_id: regionId || null, p_session: sessionId() })
    .then(() => {}, () => {});
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
