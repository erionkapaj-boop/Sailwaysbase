// Credits (0110): the admin records a package purchase, gives credits by
// mistake (100 instead of 10), corrects it, and the user sees every movement,
// with the reason, in their own history. Package prices on the Credits page.
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

  // Αγορά πακέτου: credits και τιμή από τις Ρυθμίσεις.
  await findSofia(page);
  await page.getByLabel("Πακέτο").selectOption("professional");
  await click(page, "Καταχώριση αγοράς");
  await page.waitForTimeout(1200);
  check("αγορά Professional: +5 credits", balance() === start + 5);
  check("με το ποσό σε € στην κίνηση",
    num(`select count(*) from wallet_transactions t join users u on u.id = t.user_id
         where u.full_name = '${sofia}' and t.type = 'purchase' and t.amount = 5 and t.price_eur = 200`) === 1);
  check("και στις πωλήσεις", (await text(page)).includes("200€"));

  // Δώρο κατά λάθος 100 αντί για 10.
  await click(page, "Δώρο");
  await findSofia(page);
  await page.getByPlaceholder("Credits", { exact: true }).fill("100");
  await page.getByPlaceholder("Σημείωση").fill("Αποζημίωση");
  await click(page, "Καταχώριση δώρου");
  await page.waitForTimeout(1200);
  check("μεγάλος αριθμός ζητά επιβεβαίωση", dialogs.some((m) => m.includes("100 credits") && m.includes("Σίγουρα")));
  check("πιστώθηκαν 100 credits", balance() === start + 105);

  await click(page, "Διόρθωση (αφαίρεση)");
  await findSofia(page);
  check("φαίνεται το τρέχον υπόλοιπο", (await text(page)).includes(`υπόλοιπο ${start + 105} credits`));
  await page.getByPlaceholder("Credits προς αφαίρεση").fill("90");
  await click(page, "Καταχώριση αφαίρεσης");
  await page.waitForTimeout(600);
  check("χωρίς λόγο δεν προχωρά", (await text(page)).includes("Γράψε τον λόγο της διόρθωσης") && balance() === start + 105);

  await page.getByPlaceholder("Λόγος διόρθωσης (υποχρεωτικό)").fill("Λάθος: ήταν 10 credits");
  await click(page, "Καταχώριση αφαίρεσης");
  await page.waitForTimeout(1200);
  check("αφαιρέθηκαν 90 και δείχνει το νέο υπόλοιπο",
    balance() === start + 15 && (await text(page)).includes(`Νέο υπόλοιπο ${start + 15} credits`));

  await findSofia(page);
  await page.getByPlaceholder("Credits προς αφαίρεση").fill(String(start + 500));
  await page.getByPlaceholder("Λόγος διόρθωσης (υποχρεωτικό)").fill("δοκιμή");
  await click(page, "Καταχώριση αφαίρεσης");
  await page.waitForTimeout(1200);
  check("δεν γίνεται αρνητικό υπόλοιπο", (await text(page)).includes("δεν μπορεί να το κάνει αρνητικό") && balance() === start + 15);
});

await as("6900002008", async (page) => {
  await go(page, "/platform/wallet");
  const body = await text(page);
  check("η χρήστρια βλέπει την αγορά", body.includes("Αγορά credits"));
  check("τη διόρθωση και τον λόγο", body.includes("Διόρθωση credits") && body.includes("Λάθος: ήταν 10 credits"));
  check("και το δώρο με τη σημείωση", body.includes("Αποζημίωση"));
  check("η σελίδα Credits χωρίς κουτάκια πακέτων", !body.includes("Starter") && body.includes("Αγορά credits"));
  check("το υπόλοιπο σε credits", body.includes(`${start + 15} credits`));
});

finish();
