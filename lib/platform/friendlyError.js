// Unmapped errors used to reach the screen as-is — English/technical text
// ("Cannot read properties of null…", "request_not_open") in a Greek UI.
// Greek messages (ours) pass through; anything else becomes a plain
// sentence, with the original kept in the console for debugging.
import { reportAppIssue, issueCode, noteFailure } from "./health";
import { tNow, hasNow } from "./tNow";

// Τα κείμενα ζουν στα messages (namespace «Errors», messages/*/system.json) και
// διαβάζονται στη γλώσσα της σελίδας. Κάθε κωδικός της βάσης έχει εκεί κείμενο
// και στις δύο γλώσσες.

export function friendlyError(err) {
  const msg = err?.message || String(err || "");
  // Κάθε αποτυχία μετρά για το «κολλάει» (0117), και οι γνωστές.
  noteFailure(/[\u0370-\u03ff]/.test(msg) ? "validation" : issueCode(err));
  if (/[\u0370-\u03ff]/.test(msg)) return msg;
  if (/^\w+$/.test(msg) && hasNow("Errors", msg)) return tNow("Errors", msg);
  if (/violates check constraint "\w+_len"/.test(msg)) return tNow("Errors", "textTooLong");
  console.error(err);
  // Χωρίς γνωστό μήνυμα = απρόβλεπτο: φτάνει στην «Υγεία εφαρμογής» (0116).
  reportAppIssue({ code: issueCode(err), detail: msg });
  return tNow("Errors", "generic");
}
