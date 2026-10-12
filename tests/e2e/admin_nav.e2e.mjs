// Ένα μενού: στον υπολογιστή το μόνιμο αριστερό μενού (ίδια λίστα με το συρτάρι του κινητού), σε ΚΑΘΕ
// σελίδα του διαχειριστή, με «Ο λογαριασμός μου» και «Αποσύνδεση». Μία ομάδα ανοιχτή τη φορά (αυτή
// της σελίδας που βλέπεις)· πατώντας άλλο τίτλο ανοίγει εκείνη και κλείνει η προηγούμενη. Στο κινητό:
// το συρτάρι με την ίδια λογική. Ποτέ δύο μενού το ένα πάνω στο άλλο.
import { as, go, check, finish, shoot, OUT } from "./lib.mjs";

const ADMIN = "6900002001";
const settle = (page) => page.waitForTimeout(600); // η κίνηση ανοίγματος/κλεισίματος διαρκεί ~0,3s

await as(ADMIN, async (page) => {
  // ---- Υπολογιστής ----
  await page.setViewportSize({ width: 1280, height: 900 });
  await go(page, "/platform/admin");
  const side = page.locator("aside.sf-sidenav");
  const nav = side.locator('nav[aria-label="Πλαϊνό μενού"]');
  const link = (name) => nav.getByRole("link", { name, exact: true });
  const heading = (name) => nav.getByRole("button", { name: new RegExp(name, "i") });
  const burger = page.getByRole("button", { name: "Μενού", exact: true });

  check("το αριστερό μενού υπάρχει", await side.isVisible());
  check("δεν υπάρχει δεύτερο μενού από πάνω: τα τρία γραμμάκια δεν φαίνονται σε πλατιά οθόνη", !(await burger.isVisible()));
  check("«Αποσύνδεση» κάτω-κάτω", await side.getByRole("button", { name: "Αποσύνδεση", exact: true }).isVisible());
  check("και υπάρχει η ομάδα «Ο λογαριασμός μου»", await heading("Ο λογαριασμός μου").isVisible());
  check("στην Επισκόπηση: ανοιχτή η ομάδα «Διαχείριση»", (await link("Επισκόπηση").isVisible()) && (await link("Εκκρεμότητες").isVisible()));
  check(
    "οι άλλες ομάδες δείχνουν μόνο τον τίτλο τους",
    !(await link("Αντικαταστάσεις").isVisible()) && !(await link("Χρήστες").isVisible()) && !(await link("Ρυθμίσεις").isVisible()) && !(await link("Credits").isVisible())
  );
  await shoot(page, "adminnav-home");

  // Πατάω άλλον τίτλο: ανοίγει εκείνος, κλείνει η «Διαχείριση».
  await heading("Κρατήσεις & πλήρωμα").click();
  await settle(page);
  check("ανοίγει η ομάδα που πάτησα", (await link("Αντικαταστάσεις").isVisible()) && (await link("Όλες οι κρατήσεις").isVisible()));
  check("κλείνει η προηγούμενη", !(await link("Επισκόπηση").isVisible()) && !(await link("Εκκρεμότητες").isVisible()));
  check("το κλειστό δεν υπάρχει για τον αναγνώστη οθόνης και το πληκτρολόγιο", (await link("Επισκόπηση").count()) === 0);
  await shoot(page, "adminnav-open-bookings");

  // Σελίδα της ομάδας: μένει εκείνη ανοιχτή και η ενεργή σελίδα τονίζεται.
  await link("Όλες οι κρατήσεις").click();
  await page.waitForURL(/\/platform\/admin\/bookings/);
  await settle(page);
  check(
    "σε σελίδα της ομάδας: μένει ανοιχτή και η ενεργή σελίδα τονίζεται",
    (await link("Όλες οι κρατήσεις").getAttribute("aria-current")) === "page" && (await link("Αντικαταστάσεις").isVisible())
  );

  // Προσωπική σελίδα του διαχειριστή: το μενού ΜΕΝΕΙ και ανοίγει «Ο λογαριασμός μου».
  await go(page, "/platform/bookings");
  await settle(page);
  check("σε προσωπική σελίδα (Οι κρατήσεις μου) το μενού μένει", await side.isVisible());
  check(
    "και είναι ανοιχτός ο «Ο λογαριασμός μου», κλειστά τα υπόλοιπα",
    (await link("Οι κρατήσεις μου").isVisible()) && (await link("Το προφίλ μου").isVisible()) && !(await link("Αντικαταστάσεις").isVisible()) && !(await link("Επισκόπηση").isVisible())
  );
  check("η ενεργή σελίδα τονίζεται", (await link("Οι κρατήσεις μου").getAttribute("aria-current")) === "page");
  await shoot(page, "adminnav-account");

  // Το περιεχόμενο και το υποσέλιδο δεν κρύβονται πίσω από το μενού.
  const pageBox = await page.locator("h1").first().boundingBox();
  check("το περιεχόμενο είναι δεξιά από το μενού", pageBox && pageBox.x >= 250, JSON.stringify(pageBox));
  const footerLink = page.locator("footer a, footer span").first();
  if (await footerLink.count()) {
    const fb = await footerLink.boundingBox();
    check("και το υποσέλιδο", !fb || fb.x >= 250, JSON.stringify(fb));
  }

  // Πατώντας τον τίτλο της ανοιχτής ομάδας κλείνει.
  await heading("Ο λογαριασμός μου").click();
  await settle(page);
  check("πατώντας τον τίτλο της ανοιχτής ομάδας κλείνει", !(await link("Οι κρατήσεις μου").isVisible()));

  // Καρτέλα χρήστη (εκτός μενού): το μενού μένει όπως ήταν.
  await go(page, "/platform/admin/users");
  await settle(page);
  check("σε σελίδα άλλης ομάδας: ανοίγει η δική της", (await link("Χρήστες").isVisible()) && !(await link("Αντικαταστάσεις").isVisible()));
  await shoot(page, "adminnav-users");

  // ---- Κινητό: συρτάρι με τα ίδια, ίδια λογική ----
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform/admin");
  check("κινητό: δεν υπάρχει μόνιμο αριστερό μενού", !(await side.isVisible()));
  check("κινητό: φαίνονται τα τρία γραμμάκια", await burger.isVisible());
  await burger.click();
  await settle(page);
  const dlg = page.getByRole("dialog");
  check("κινητό: ανοιχτή η ομάδα της σελίδας", await dlg.getByRole("link", { name: "Επισκόπηση", exact: true }).isVisible());
  check("κινητό: οι άλλες κλειστές", !(await dlg.getByRole("link", { name: "Χρήστες", exact: true }).isVisible()));
  check("κινητό: «Ο λογαριασμός μου» και «Αποσύνδεση» υπάρχουν και εδώ",
    (await dlg.getByRole("button", { name: /Ο λογαριασμός μου/i }).isVisible()) && (await dlg.getByRole("button", { name: "Αποσύνδεση", exact: true }).isVisible()));
  await dlg.getByRole("button", { name: /Χρήστες & χρήματα/i }).click();
  await settle(page);
  check(
    "κινητό: ανοίγει η νέα και κλείνει η προηγούμενη",
    (await dlg.getByRole("link", { name: "Χρήστες", exact: true }).isVisible()) && !(await dlg.getByRole("link", { name: "Επισκόπηση", exact: true }).isVisible())
  );
  await page.screenshot({ path: `${OUT}/design-adminnav-drawer-m.png` });
});

finish();
