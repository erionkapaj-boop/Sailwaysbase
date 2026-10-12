// Κέντρο εργασιών διαχείρισης: μία ομάδα ανοιχτή τη φορά (αυτή της σελίδας που βλέπεις),
// οι άλλες μόνο με τίτλο. Πατώντας άλλο τίτλο ανοίγει εκείνη και κλείνει η προηγούμενη.
// Ίδια λογική στο μενού με τις τρεις γραμμές στο κινητό.
import { as, go, check, finish, shoot, OUT } from "./lib.mjs";

const ADMIN = "6900002001";
const settle = (page) => page.waitForTimeout(600); // η κίνηση ανοίγματος/κλεισίματος διαρκεί ~0,3s

await as(ADMIN, async (page) => {
  // ---- Υπολογιστής ----
  await page.setViewportSize({ width: 1280, height: 900 });
  await go(page, "/platform/admin");
  const nav = page.locator('nav[aria-label="Διαχείριση"]');
  const link = (name) => nav.getByRole("link", { name, exact: true });
  const heading = (name) => nav.getByRole("button", { name: new RegExp(name, "i") });

  check("το αριστερό μενού υπάρχει", await nav.isVisible());
  check("στην Επισκόπηση: ανοιχτή η ομάδα «Διαχείριση»", (await link("Επισκόπηση").isVisible()) && (await link("Εκκρεμότητες").isVisible()));
  check(
    "οι άλλες ομάδες δείχνουν μόνο τον τίτλο τους",
    !(await link("Αντικαταστάσεις").isVisible()) && !(await link("Χρήστες").isVisible()) && !(await link("Ρυθμίσεις").isVisible())
  );
  check(
    "και οι τίτλοι τους φαίνονται",
    (await heading("Κρατήσεις & πλήρωμα").isVisible()) && (await heading("Χρήστες & χρήματα").isVisible()) && (await heading("Σύστημα").isVisible())
  );
  await shoot(page, "adminnav-home");

  // Πατάω άλλον τίτλο: ανοίγει εκείνος, κλείνει η «Διαχείριση».
  await heading("Κρατήσεις & πλήρωμα").click();
  await settle(page);
  check("ανοίγει η ομάδα που πάτησα", (await link("Αντικαταστάσεις").isVisible()) && (await link("Όλες οι κρατήσεις").isVisible()));
  check("κλείνει η προηγούμενη", !(await link("Επισκόπηση").isVisible()) && !(await link("Εκκρεμότητες").isVisible()));
  check("το κλειστό δεν υπάρχει για τον αναγνώστη οθόνης και το πληκτρολόγιο", (await link("Επισκόπηση").count()) === 0);
  await shoot(page, "adminnav-open-bookings");

  // Πηγαίνω σε σελίδα της ομάδας: μένει εκείνη ανοιχτή.
  await link("Όλες οι κρατήσεις").click();
  await page.waitForURL(/\/platform\/admin\/bookings/);
  await settle(page);
  check(
    "σε σελίδα της ομάδας: μένει ανοιχτή και η ενεργή σελίδα τονίζεται",
    (await link("Όλες οι κρατήσεις").getAttribute("aria-current")) === "page" && (await link("Αντικαταστάσεις").isVisible())
  );
  check("και οι άλλες μένουν κλειστές", !(await link("Επισκόπηση").isVisible()) && !(await link("Χρήστες").isVisible()));

  // Σελίδα άλλης ομάδας: ανοίγει η δική της.
  await go(page, "/platform/admin/users");
  await settle(page);
  check(
    "σε σελίδα άλλης ομάδας: ανοίγει η δική της, κλείνει η προηγούμενη",
    (await link("Χρήστες").isVisible()) && !(await link("Αντικαταστάσεις").isVisible())
  );
  await shoot(page, "adminnav-users");

  // Πατάω τον τίτλο της ανοιχτής ομάδας: κλείνει (όλα μόνο τίτλοι).
  await heading("Χρήστες & χρήματα").click();
  await settle(page);
  check("πατώντας τον τίτλο της ανοιχτής ομάδας κλείνει", !(await link("Χρήστες").isVisible()));

  // ---- Κινητό: μενού με τις τρεις γραμμές, ίδια λογική ----
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform/admin");
  await page.getByRole("button", { name: "Μενού", exact: true }).click();
  await settle(page);
  const dlg = page.getByRole("dialog");
  check("κινητό: ανοιχτή η ομάδα της σελίδας", await dlg.getByRole("link", { name: "Επισκόπηση", exact: true }).isVisible());
  check("κινητό: οι άλλες κλειστές", !(await dlg.getByRole("link", { name: "Χρήστες", exact: true }).isVisible()));
  await dlg.getByRole("button", { name: /Χρήστες & χρήματα/i }).click();
  await settle(page);
  check(
    "κινητό: ανοίγει η νέα και κλείνει η προηγούμενη",
    (await dlg.getByRole("link", { name: "Χρήστες", exact: true }).isVisible()) && !(await dlg.getByRole("link", { name: "Επισκόπηση", exact: true }).isVisible())
  );
  await page.screenshot({ path: `${OUT}/design-adminnav-drawer-m.png` });
});

finish();
