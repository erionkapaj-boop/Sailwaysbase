// Server-side fixes from docs/AUDIT.md that only show up over HTTP: security
// headers, locked cron endpoints, the AI proxy, Ghost Mode on an already
// registered test phone, and the PIN asked before deleting an account.
import { BASE, check, finish, sql } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";

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

finish();
