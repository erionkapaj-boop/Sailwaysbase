// Όταν μια λίστα δεν φορτώνει (σύνδεση, λήξη συνεδρίας, σφάλμα βάσης), η σελίδα
// το λέει και προσφέρει «Ξαναδοκίμασε» — δεν μένει άδεια σαν να μην υπάρχει
// τίποτα, και δεν αφήνει ανεπεξέργαστο σφάλμα (Υγεία: unhandled_promise@/platform/requests).
import { as, go, text, check, finish } from "./lib.mjs";

const NIKOS = "6900002003"; // επαγγελματίας: βλέπει και εισερχόμενα και δικά του αιτήματα

await as(NIKOS, async (page) => {
  let fail = true;
  await page.route(/\/rest\/v1\/(booking_requests|booking_request_pings)\b/, (route) =>
    fail ? route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"e2e: δοκιμαστική αποτυχία"}' }) : route.continue()
  );
  await go(page, "/platform/requests");
  const t = await text(page);
  check("αιτήματα: λέει ότι δεν φορτώθηκαν", t.includes("Δεν φορτώθηκαν τα αιτήματα"), t.slice(0, 400));
  check("εισερχόμενα: λέει ότι δεν φορτώθηκαν", t.includes("Δεν φορτώθηκαν τα εισερχόμενα αιτήματα"));
  check("δεν δείχνει ψεύτικο «κανένα αίτημα»", !t.includes("Εδώ θα δεις τα αιτήματα που έχεις στείλει"));

  fail = false;
  for (const b of await page.getByRole("button", { name: "Ξαναδοκίμασε" }).all()) await b.click();
  await page.waitForTimeout(1500);
  const t2 = await text(page);
  check("μετά το «Ξαναδοκίμασε» η σελίδα φορτώνει κανονικά", !t2.includes("Δεν φορτώθηκαν") && t2.includes("Εδώ θα δεις τα αιτήματα που έχεις στείλει"), t2.slice(0, 400));
});

finish();
