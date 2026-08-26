// A search + selection made while signed out has nowhere to live once the
// login/register redirect fires — plain component state, gone the instant
// the page navigates away. Without this, someone who searches, picks two
// candidates, then hits the login wall on "send" comes back to a blank
// search and has to redo everything, with no sign their pick was never
// actually sent (createBookingRequest/payAndBroadcast never even ran).
//
// sessionStorage rather than the URL: the values that matter (which
// candidates were ticked) never round-trip through the URL to begin with,
// and the same key survives the register → OTP → set-PIN hop just as well
// as the plain login hop, without either page needing to know about it.
const KEY = "sf_pending_broadcast";

export function savePendingBroadcast({ role, filters, boatTypeId, gender, selected }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ role, filters, boatTypeId, gender, selected }));
  } catch {
    // Private-browsing or storage disabled: the redirect still happens, the
    // user just has to redo the pick. Not worth failing the send over.
  }
}

// Single-use by design: read once (on the search page's first mount after
// coming back), then gone, so a later ordinary visit never resurfaces a
// stale selection.
export function takePendingBroadcast() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasPendingBroadcast() {
  try {
    return Boolean(sessionStorage.getItem(KEY));
  } catch {
    return false;
  }
}
