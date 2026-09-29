// Server-side fixes from docs/AUDIT.md that only show up over HTTP: security
// headers, locked cron endpoints, the AI proxy, Ghost Mode on an already
// registered test phone, and the PIN asked before deleting an account.
import { BASE, check, finish, sql } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";
import crypto from "crypto";

const page = await fetch(`${BASE}/platform`);
check("#21 καμία σελίδα σε ξένο frame", page.headers.get("x-frame-options") === "DENY");
check("#21 nosniff και HSTS",
  page.headers.get("x-content-type-options") === "nosniff" && /max-age=/.test(page.headers.get("strict-transport-security") || ""));

for (const path of ["/api/platform/cron", "/api/cron/nightly"]) {
  const r = await fetch(BASE + path);
  check(`#17 ${path} χωρίς κλειδί: 401`, r.status === 401, `πήρε ${r.status}`);
}

const ai = await fetch(`${BASE}/api/ai`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
  body: JSON.stringify({ prompt: "hi", max_tokens: 100000 }),
});
check("#16 το /api/ai αρνείται άλλο site", ai.status === 403, `πήρε ${ai.status}`);

// A finished test-phone account keeps its own PIN.
const testPhone = "+306980000077";
sql(`insert into auth.users (id, phone) values ('e7000000-0000-0000-0000-000000000077', '306980000077')`);
sql(`insert into users (id, role, full_name, phone_number, status) values
     ('e7000000-0000-0000-0000-000000000077', 'client', 'Δοκιμαστικός Έτοιμος', '${testPhone}', 'active')`);
const ghost = await fetch(`${BASE}/api/platform/auth/test-signin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: testPhone }),
});
check("#30 Ghost Mode δεν ξαναβάζει τον κοινό κωδικό σε έτοιμο λογαριασμό", ghost.status === 409, `πήρε ${ghost.status}`);

// Deleting your own account needs the PIN.
const signin = await fetch(`${process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: testPhone, password: TEST_PIN }),
}).then((r) => r.json()).catch(() => null);
if (signin?.access_token) {
  const del = (body) =>
    fetch(`${BASE}/api/platform/account/delete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signin.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const noPin = await del({});
  check("#20 διαγραφή χωρίς PIN: όχι", noPin.status === 400);
  const wrong = await del({ pin: "999999" });
  check("#20 διαγραφή με λάθος PIN: όχι", wrong.status === 400);
  check("ο λογαριασμός είναι ακόμα ενεργός", sql(`select status from users where phone_number = '${testPhone}'`) === "active");
  const right = await del({ pin: TEST_PIN });
  check("#20 διαγραφή με σωστό PIN: ναι", right.ok, `πήρε ${right.status}`);
} else {
  check("σύνδεση του δοκιμαστικού λογαριασμού στο gateway", false, JSON.stringify(signin));
}

// Έλεγχος ασφαλείας #1: η διαδρομή διαγραφής σβήνει μόνο τον δικό σου
// λογαριασμό, ακόμα κι αν ο καλών είναι υπάλληλος.
{
  sql(`update users set is_staff_admin = true where id = 'a0000000-0000-0000-0000-000000000008'`);
  const staff = await fetch(`${process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "+306900002008", password: TEST_PIN }),
  }).then((r) => r.json()).catch(() => null);
  const other = await fetch(`${BASE}/api/platform/account/delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staff?.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "a0000000-0000-0000-0000-000000000002", pin: TEST_PIN }),
  });
  check("#1 ο υπάλληλος δεν σβήνει ξένο λογαριασμό από εδώ", other.status === 403, `πήρε ${other.status}`);
  check("ο ξένος λογαριασμός μένει ενεργός", sql(`select status from users where id = 'a0000000-0000-0000-0000-000000000002'`) === "active");
  sql(`update users set is_staff_admin = false where id = 'a0000000-0000-0000-0000-000000000008'`);
}

// Έλεγχος ασφαλείας #5: πολλές ταυτόχρονες δοκιμές κωδικού επαναφοράς
// μετρούν όλες· μετά τις 5 ο κωδικός καίγεται, ακόμα και ο σωστός.
{
  const phone = "+306900002002";
  const hash = crypto.createHash("sha256").update("482913").digest("hex");
  sql(`insert into email_reset_codes (user_id, code_hash, expires_at)
       values ('a0000000-0000-0000-0000-000000000002', '${hash}', now() + interval '15 minutes')`);
  const tryCode = (code) =>
    fetch(`${BASE}/api/platform/pin-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, newPin: "736251" }),
    });
  await Promise.all(Array.from({ length: 25 }, (_, i) => tryCode(String(100000 + i))));
  const used = Number(sql(`select failed_attempts from email_reset_codes where user_id = 'a0000000-0000-0000-0000-000000000002' and code_hash = '${hash}'`));
  check("#5 25 ταυτόχρονες δοκιμές: μετρήθηκαν το πολύ 5", used <= 5, `μετρήθηκαν ${used}`);
  const late = await tryCode("482913");
  if (used === 5) check("#5 μετά τις 5 δοκιμές ο σωστός κωδικός δεν περνά", late.status === 400, `πήρε ${late.status}`);
  sql(`delete from email_reset_codes where user_id = 'a0000000-0000-0000-0000-000000000002'`);
}

finish();
