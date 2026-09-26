// The admin credits a wallet by mistake (1.000€ instead of 100€), corrects it,
// and the user sees both movements, with the reason, in their own history.
import { as, go, text, click, check, finish, num } from "./lib.mjs";

const sofia = "Σοφία Σιωπηλή";
const balance = () => num(`select wallet_balance from users where full_name = '${sofia}'`);
const start = balance();

async function findSofia(page) {
  await page.getByPlaceholder("Τηλέφωνο χρήστη").fill("6900002008");
  await click(page, "Εύρεση");
  await page.waitForTimeout(800);
}

await as("6900002001", async (page) => {
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  await go(page, "/platform/admin/finance");

  await findSofia(page);
  await page.getByPlaceholder("Ποσό €").fill("1000");
  await page.getByPlaceholder("Αιτιολογία").fill("Τραπεζική κατάθεση");
  await click(page, "Καταχώριση πίστωσης");
  await page.waitForTimeout(1200);
  check("μεγάλο ποσό ζητά επιβεβαίωση", dialogs.some((m) => m.includes("1000€") && m.includes("Σίγουρα")));
  check("πιστώθηκαν 1000€", balance() === start + 1000);

  await click(page, "Διόρθωση (αφαίρεση)");
  await findSofia(page);
  check("φαίνεται το τρέχον υπόλοιπο", (await text(page)).includes(`υπόλοιπο ${start + 1000}€`));
  await page.getByPlaceholder("Ποσό προς αφαίρεση €").fill("900");
  await click(page, "Καταχώριση αφαίρεσης");
  await page.waitForTimeout(600);
  check("χωρίς λόγο δεν προχωρά", (await text(page)).includes("Γράψε τον λόγο της διόρθωσης") && balance() === start + 1000);

  await page.getByPlaceholder("Λόγος διόρθωσης (υποχρεωτικό)").fill("Λάθος ποσό: ήταν 100€");
  await click(page, "Καταχώριση αφαίρεσης");
  await page.waitForTimeout(1200);
  check("αφαιρέθηκαν 900€ και δείχνει το νέο υπόλοιπο",
    balance() === start + 100 && (await text(page)).includes(`Νέο υπόλοιπο ${start + 100}€`));

  await findSofia(page);
  await page.getByPlaceholder("Ποσό προς αφαίρεση €").fill(String(start + 500));
  await page.getByPlaceholder("Λόγος διόρθωσης (υποχρεωτικό)").fill("δοκιμή");
  await click(page, "Καταχώριση αφαίρεσης");
  await page.waitForTimeout(1200);
  check("δεν γίνεται αρνητικό υπόλοιπο", (await text(page)).includes("δεν μπορεί να το κάνει αρνητικό") && balance() === start + 100);
});

await as("6900002008", async (page) => {
  await go(page, "/platform/wallet");
  const body = await text(page);
  check("η χρήστρια βλέπει τη διόρθωση και τον λόγο", body.includes("Διόρθωση υπολοίπου") && body.includes("Λάθος ποσό: ήταν 100€"));
  check("και την κατάθεση με την αιτιολογία", body.includes("Τραπεζική κατάθεση"));
});

finish();
