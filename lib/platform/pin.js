// PIN rules shared by the browser and the server routes. At least 6
// characters, and not one of the first codes anyone would try on a stolen
// phone: one repeated digit (000000, 111111…) or a straight run (123456,
// 654321, 234567…).
export const MIN_PIN_LENGTH = 6;

export function isWeakPin(pin) {
  const s = String(pin || "");
  if (!/^\d+$/.test(s)) return false;
  if (/^(\d)\1+$/.test(s)) return true;
  const up = "01234567890123456789";
  const down = "98765432109876543210";
  return up.includes(s) || down.includes(s);
}

// null when the PIN is fine, otherwise the error code.
export function pinProblem(pin) {
  if (!pin || String(pin).length < MIN_PIN_LENGTH) return "pin_too_short";
  if (isWeakPin(pin)) return "pin_too_weak";
  return null;
}
