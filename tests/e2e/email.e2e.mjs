// Email notifications end to end: the client adds an email in her profile
// (with her PIN), a notification she hasn't seen goes out by email through
// /api/platform/notify-email, and once she turns emails off nothing does.
// "Resend" here is a local server that records what it was sent.
import http from "node:http";
import { BASE, as, go, text, click, check, finish, sql } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";

const received = [];
const capture = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ auth: req.headers.authorization, ...JSON.parse(body || "{}") });
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"id":"test"}');
  });
});
await new Promise((r) => capture.listen(Number(process.env.EMAIL_CAPTURE_PORT || 54392), r));

const maria = sql("select id from users where full_name = 'Μαρία Πελάτη'");
const runQueue = (secret = process.env.CRON_SECRET) =>
  fetch(`${BASE}/api/platform/notify-email`, { method: "POST", headers: secret ? { authorization: `Bearer ${secret}` } : {} });
const notify = (kind, data) => {
  sql(`select notify_user('${maria}', '${kind}', '${JSON.stringify(data)}'::jsonb, '/platform/bookings')`);
  sql(`update notifications set created_at = now() - interval '5 minutes' where user_id = '${maria}' and email_status is null`);
};

await as("6900002002", async (page) => {
  await go(page, "/platform/profile");
  check("χωρίς email: οι ειδοποιήσεις email είναι ανενεργές", (await text(page)).includes("Πρόσθεσε email"));
  await click(page, "Προσθήκη");
  await page.locator("#new-email").fill("maria@example.com");
  await page.locator("#email-pin").fill("000000");
  await click(page, "Αποθήκευση email");
  await page.waitForTimeout(1200);
  const afterWrong = await text(page);
  check("λάθος κωδικός: δεν αλλάζει", afterWrong.includes("Ο κωδικός δεν είναι σωστός")
    && !sql(`select email from users where id = '${maria}'`), afterWrong.slice(afterWrong.indexOf("Email &"), afterWrong.indexOf("Email &") + 300));
  await page.locator("#email-pin").fill(TEST_PIN);
  await click(page, "Αποθήκευση email");
  await page.waitForTimeout(1500);
  check("με τον κωδικό: το email αποθηκεύτηκε", sql(`select email from users where id = '${maria}'`) === "maria@example.com");
  check("και οι ειδοποιήσεις email είναι ανοιχτές", await page.getByRole("checkbox", { name: /Ειδοποιήσεις με email/ }).isChecked());
});

check("χωρίς το μυστικό: η αποστολή αρνείται", (await runQueue(null)).status === 401);

notify("booking_confirmed", { port: "Σύρος", start: "2026-10-10", end: "2026-10-12" });
const r1 = await (await runQueue()).json();
const mail = received.find((m) => m.to?.[0] === "maria@example.com");
check("στάλθηκε email στη Μαρία", r1.ok && Boolean(mail), JSON.stringify(r1));
check("με το ίδιο κείμενο με την εφαρμογή και σύνδεσμο", mail && mail.text.includes("Νέα επιβεβαιωμένη κράτηση")
  && mail.text.includes("Σύρος") && mail.html.includes(`${BASE}/platform/bookings`));
check("και σύνδεσμο για να τα κλείσει", mail && mail.text.includes(`${BASE}/platform/profile`));
check("σημειώθηκε ως σταλμένη", sql(`select count(*) from notifications where user_id = '${maria}' and email_status = 'sent'`) !== "0");

const before = received.length;
await runQueue();
check("δεύτερη εκτέλεση: κανένα διπλό email", received.length === before);

await as("6900002002", async (page) => {
  await go(page, "/platform/profile");
  await page.getByRole("checkbox", { name: /Ειδοποιήσεις με email/ }).click();
  await page.waitForTimeout(1200);
  check("τα έκλεισε από το προφίλ", sql(`select email_notifications from users where id = '${maria}'`) === "f");
});
notify("booking_cancelled", { by: "client" });
await runQueue();
check("κλειστά: δεν στάλθηκε τίποτα", received.length === before
  && sql(`select email_status from notifications where user_id = '${maria}' and kind = 'booking_cancelled' order by created_at desc limit 1`) === "opted_out");

capture.close();
finish();
