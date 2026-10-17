// Όταν μια λίστα δεν φορτώνει (σύνδεση, λήξη συνεδρίας, σφάλμα βάσης), η σελίδα
// το λέει και προσφέρει «Ξαναδοκίμασε» — δεν μένει άδεια σαν να μην υπάρχει
// τίποτα, και δεν αφήνει ανεπεξέργαστο σφάλμα (Υγεία: unhandled_promise@/platform/requests).
// Κάθε ρόλος βλέπει μόνο τα δικά του: ο επαγγελματίας τα εισερχόμενα, ο πελάτης όσα έστειλε.
import { as, go, text, check, finish, sql, resetRoles } from "./lib.mjs";

const NIKOS = "6900002003"; // επαγγελματίας (και πελάτης, όταν αλλάζει ρόλο)
const failing = (page, state) =>
  page.route(/\/rest\/v1\/(booking_requests|booking_request_pings)\b/, (route) =>
    state.fail ? route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"e2e: δοκιμαστική αποτυχία"}' }) : route.continue()
  );

// Ρόλος Επαγγελματίας: εισερχόμενα.
await as(NIKOS, async (page) => {
  const s = { fail: true };
  await failing(page, s);
  await go(page, "/platform/requests");
  const t = await text(page);
  check("εισερχόμενα: λέει ότι δεν φορτώθηκαν", t.includes("Δεν φορτώθηκαν τα εισερχόμενα αιτήματα"), t.slice(0, 400));
  check("επαγγελματίας: δεν βλέπει τη λίστα του πελάτη", !t.includes("Εδώ θα δεις τα αιτήματα που έχεις στείλει"));
  s.fail = false;
  for (const b of await page.getByRole("button", { name: "Ξαναδοκίμασε" }).all()) await b.click();
  await page.waitForTimeout(1500);
  const t2 = await text(page);
  check("εισερχόμενα: μετά το «Ξαναδοκίμασε» φορτώνει κανονικά", !t2.includes("Δεν φορτώθηκαν"), t2.slice(0, 400));
});

// Ρόλος Πελάτης: τα αιτήματα που έστειλε.
sql(`update users set active_role = 'client' where phone_number = '+30${NIKOS}'`);
await as(NIKOS, async (page) => {
  const s = { fail: true };
  await failing(page, s);
  await go(page, "/platform/requests");
  const t = await text(page);
  check("αιτήματα: λέει ότι δεν φορτώθηκαν", t.includes("Δεν φορτώθηκαν τα αιτήματα"), t.slice(0, 400));
  check("δεν δείχνει ψεύτικο «κανένα αίτημα»", !t.includes("Εδώ θα δεις τα αιτήματα που έχεις στείλει"));
  check("πελάτης: δεν βλέπει εισερχόμενα επαγγελματία", !t.includes("Δεν φορτώθηκαν τα εισερχόμενα αιτήματα"));
  s.fail = false;
  for (const b of await page.getByRole("button", { name: "Ξαναδοκίμασε" }).all()) await b.click();
  await page.waitForTimeout(1500);
  const t2 = await text(page);
  check("μετά το «Ξαναδοκίμασε» η σελίδα φορτώνει κανονικά", !t2.includes("Δεν φορτώθηκαν") && t2.includes("Εδώ θα δεις τα αιτήματα που έχεις στείλει"), t2.slice(0, 400));
});

resetRoles();
finish();
