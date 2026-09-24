// Unmapped errors used to reach the screen as-is — English/technical text
// ("Cannot read properties of null…", "request_not_open") in a Greek UI.
// Greek messages (ours) pass through; anything else becomes a plain
// sentence, with the original kept in the console for debugging.
const GENERIC = "Κάτι πήγε στραβά. Δοκίμασε ξανά σε λίγο — αν συνεχίσει, επικοινώνησε μαζί μας.";

export function friendlyError(err) {
  const msg = err?.message || String(err || "");
  if (/[Ͱ-Ͽ]/.test(msg)) return msg;
  console.error(err);
  return GENERIC;
}
