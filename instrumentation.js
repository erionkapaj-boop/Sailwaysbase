// Κάθε σφάλμα διακομιστή που δεν το χειρίστηκε κανείς (API route, σελίδα που
// αποδίδεται στον server) πηγαίνει στην «Υγεία εφαρμογής» (0120), με τη
// διαδρομή και το μήνυμα. Μόνο για το SkipperFinder: το Base Manager έχει
// δική του βάση.
export async function onRequestError(err, request, context) {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const path = String(request?.path || "").split("?")[0];
  const route = context?.routePath || path;
  if (!/^\/(platform|api\/platform)(\/|$)/.test(route) && !/^\/(platform|api\/platform)(\/|$)/.test(path)) return;
  const { reportServerIssue } = await import("./lib/platform/serverHealth");
  const code = err?.name && err.name !== "Error" ? err.name : "unhandled";
  await reportServerIssue(code, route, err, [`αίτημα ${request?.method || ""}`.trim()]);
}
