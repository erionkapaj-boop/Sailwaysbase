// When the database can't be reached, a list must say so — not look empty.
// An empty wallet history or inbox reads as "nothing happened", which is the
// wrong thing to tell someone when the truth is "we couldn't check".
// Each case: the request fails, the page says so and offers a retry, the
// connection comes back, the retry shows the real data.
import { as, go, text, check, finish } from "./lib.mjs";

const hits = [];
const failing = (page, fragment) =>
  page.route("**/rest/v1/**", (route) => {
    const u = new URL(route.request().url());
    if (!u.pathname.includes(fragment)) return route.continue();
    hits.push(u.pathname);
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "simulated failure" }) });
  });
const retry = (page) => page.getByRole("button", { name: "Ξαναδοκίμασε" }).first().click();

await as("6900002002", async (page) => {
  // Wallet
  await failing(page, "wallet_transactions");
  await go(page, "/platform/wallet");
  let body = await text(page);
  check("πορτοφόλι: λέει ότι δεν φόρτωσε", body.includes("Δεν φορτώθηκαν οι κινήσεις σου"), body.slice(0, 600) + " | hits=" + hits.join(","));
  check("πορτοφόλι: δεν λέει «Καμία κίνηση»", !body.includes("Καμία κίνηση ακόμα"));
  await page.unroute("**/rest/v1/**");
  await retry(page);
  await page.waitForTimeout(1200);
  body = await text(page);
  check("πορτοφόλι: μετά το «Ξαναδοκίμασε» εμφανίζονται οι κινήσεις",
    !body.includes("Δεν φορτώθηκαν") && body.includes("Κατάθεση"));

  // Bookings
  await failing(page, "/bookings");
  await go(page, "/platform/bookings");
  body = await text(page);
  check("κρατήσεις: λέει ότι δεν φόρτωσαν", body.includes("Δεν φορτώθηκαν οι κρατήσεις σου"));
  await page.unroute("**/rest/v1/**");

  // Search: regions and boat types
  await failing(page, "boat_types");
  await go(page, "/platform/search?roles=skipper");
  body = await text(page);
  check("αναζήτηση: λέει ότι δεν φόρτωσαν οι περιοχές", body.includes("Δεν φορτώθηκαν οι περιοχές"));
  await page.unroute("**/rest/v1/**");
  await retry(page);
  await page.waitForTimeout(1200);
  check("αναζήτηση: μετά το «Ξαναδοκίμασε» το μήνυμα φεύγει", !(await text(page)).includes("Δεν φορτώθηκαν"));

  // Notifications panel
  await failing(page, "notifications");
  await go(page, "/platform");
  await page.getByRole("button", { name: /^Ειδοποιήσεις/ }).first().click();
  await page.waitForTimeout(1000);
  body = await text(page);
  check("ειδοποιήσεις: λέει ότι δεν φόρτωσαν", body.includes("Δεν φορτώθηκαν οι ειδοποιήσεις")
    && !body.includes("Καμία ειδοποίηση ακόμα"));
  await page.unroute("**/rest/v1/**");
});

finish();
