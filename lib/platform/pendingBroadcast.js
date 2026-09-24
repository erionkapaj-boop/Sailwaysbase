// A search + selection made while signed out has nowhere to live once the
// login/register redirect fires — plain component state, gone the instant
// the page navigates away. Without this, someone who searches, picks
// candidates across one or more roles, then hits the login wall on "send"
// comes back to a blank search and has to redo everything, with no sign
// their pick was never actually sent (createBookingRequest/payAndBroadcast
// never even ran).
//
// Shaped around ALL the roles on the results page at once (not just the one
// whose "send" was tapped) — a client browsing skipper AND hostess results
// together, picking people in both, must get both back after login. A single
// role's worth used to be all this stored, so picking two roles and sending
// from the checkout silently dropped whichever wasn't part of that one
// snapshot.
//
// localStorage rather than sessionStorage (or the URL): the values that
// matter (which candidates were ticked, per role) never round-trip through
// the URL, and a brand-new account can sit waiting for admin verification
// for hours — closing the tab in the meantime must not throw the whole
// search away. A search whose start date has already passed is discarded on
// read instead: there is nothing left in it worth restoring.
const KEY = "sf_pending_broadcast";

// roles: the full list of roles the results page had open (so it can
// re-render every section that had a pick, not only the one that triggered
// the redirect). filters: the shared search filters. selections: an object
// keyed by role, each { boatTypeId, selected } — boatTypeId only ever
// meaningful for skipper, carried anyway since it's harmless for the rest.
export function savePendingBroadcast({ roles, filters, selections }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ roles, filters, selections }));
  } catch {
    // Private-browsing or storage disabled: the redirect still happens, the
    // user just has to redo the pick. Not worth failing the send over.
  }
}

// Single-use by design: read once (on the search page's first mount after
// coming back), then gone, so a later ordinary visit never resurfaces a
// stale selection.
function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (!data?.filters?.startDate || data.filters.startDate < today) {
      localStorage.removeItem(KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function takePendingBroadcast() {
  const data = read();
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return data;
}

export function hasPendingBroadcast() {
  return Boolean(read());
}
