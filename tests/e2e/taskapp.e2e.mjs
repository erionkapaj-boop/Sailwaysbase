// The team app at "/" (components/App.jsx): nothing is readable without a
// valid personal code, codes are checked by the server, and nobody but the
// owner sees or changes other people's codes and roles (docs/AUDIT.md #27, #28).
import { chromium } from "playwright";
import { BASE, check, finish, sql } from "./lib.mjs";

const OWNER = "OWN-TEST22";
const EMP = "EMP-TEST33";
const team = [
  { id: "u-owner", name: "Ιδιοκτήτης", role: "owner", profile: "", code: OWNER },
  { id: "u-emp", name: "Υπάλληλος", role: "employee", profile: "", code: EMP },
];
const q = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
sql(`insert into kv (key, value) values ('app-users', ${q(team)}), ('app-tasks', '[]')
     on conflict (key) do update set value = excluded.value`);

const kv = (body, code) =>
  fetch(`${BASE}/api/kv`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(code ? { "x-app-code": code } : {}) },
    body: JSON.stringify(body),
  });

// Straight to the database with the public key, as anyone could from the bundle.
const direct = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/kv?select=key,value`, {
  headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
});
check("#28 ο πίνακας δεν διαβάζεται με το δημόσιο κλειδί", direct.status === 401 || direct.status === 403, `πήρε ${direct.status}`);

check("#27 χωρίς κωδικό: τίποτα", (await kv({ op: "get", key: "app-users" })).status === 401);
check("#27 λάθος κωδικός: τίποτα", (await kv({ op: "get", key: "app-users" }, "EMP-WRONG1")).status === 401);

const seen = JSON.parse((await (await kv({ op: "get", key: "app-users" }, EMP)).json()).value);
check("ο υπάλληλος βλέπει τον δικό του κωδικό", seen.find((u) => u.id === "u-emp").code === EMP);
check("#27 αλλά όχι του ιδιοκτήτη", seen.find((u) => u.id === "u-owner").code !== OWNER);

// The employee writes the list back, trying to become owner and change the owner's code.
const forged = seen.map((u) => (u.id === "u-emp" ? { ...u, role: "owner" } : { ...u, code: "MINE-00000" }));
await kv({ op: "set", key: "app-users", value: JSON.stringify(forged) }, EMP);
const stored = JSON.parse(sql(`select value from kv where key = 'app-users'`));
check("ο υπάλληλος δεν γίνεται ιδιοκτήτης", stored.find((u) => u.id === "u-emp").role === "employee");
check("ούτε αλλάζει τον κωδικό του ιδιοκτήτη", stored.find((u) => u.id === "u-owner").code === OWNER);

const ownerView = JSON.parse((await (await kv({ op: "get", key: "app-users" }, OWNER)).json()).value);
check("ο ιδιοκτήτης βλέπει όλους τους κωδικούς", ownerView.find((u) => u.id === "u-emp").code === EMP);

const ai = await fetch(`${BASE}/api/ai`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: BASE },
  body: JSON.stringify({ prompt: "hi" }),
});
check("#16 το AI θέλει κωδικό ομάδας", ai.status === 401, `πήρε ${ai.status}`);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
try {
  await page.goto(BASE + "/");
  await page.getByText("Προσωπικός κωδικός").waitFor({ timeout: 15000 });
  const box = page.locator("input").first();
  await box.fill("EMP-WRONG1");
  await page.getByRole("button", { name: /Είσοδος/ }).click();
  await page.getByText(/δεν αναγνωρίστηκε/).waitFor({ timeout: 10000 });
  check("λάθος κωδικός στη φόρμα: απορρίπτεται", true);
  await box.fill(EMP.toLowerCase());
  await page.getByRole("button", { name: /Είσοδος/ }).click();
  await page.getByText("Υπάλληλος").first().waitFor({ timeout: 20000 });
  check("σωστός κωδικός: μπαίνει στην εφαρμογή", !(await page.getByText("Προσωπικός κωδικός").count()));
  await page.reload();
  await page.getByText("Υπάλληλος").first().waitFor({ timeout: 20000 });
  check("η συσκευή τον θυμάται μετά από ανανέωση", true);
} catch (e) {
  check("περιήγηση στην εφαρμογή εργασιών", false, e.message.split("\n")[0]);
} finally {
  await browser.close();
}
finish();
