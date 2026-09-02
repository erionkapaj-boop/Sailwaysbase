import { serviceClient } from "../../../../../lib/platform/serverDb";

// Ghost Mode — lets someone walk through the REAL registration page for a
// reserved test phone number without a real SMS provider configured. No
// caller-identity check on purpose: the safety boundary here is the phone
// number itself, not who's asking — same trust model the app already uses
// for admin/seed-demo's fixed PIN 123456 on numbers in the same range.
// Re-checked here independently of the client-side check in db.js
// (isReservedTestPhone) since a client-side check alone proves nothing.
const TEST_PHONE_RE = /^\+3069800000\d{2}$/;
// Must match TEST_PHONE_PASSWORD in lib/platform/db.js.
const TEST_PHONE_PASSWORD = "skipperfinder-ghost-test-phone";

export async function POST(req) {
  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const { phone } = await req.json().catch(() => ({}));
  if (!TEST_PHONE_RE.test(phone || "")) return Response.json({ error: "not_a_test_phone" }, { status: 403 });

  const { error: createErr } = await db.auth.admin.createUser({
    phone,
    password: TEST_PHONE_PASSWORD,
    phone_confirm: true,
  });

  if (createErr) {
    // Already exists — a previous test run, or a soft-deleted/revivable
    // account (0074). Same identity either way; just make sure the fixed
    // test password still applies (an earlier "Σύνδεση ως" click resets a
    // test account's password to something random, see admin/impersonate).
    const { data: row } = await db.from("users").select("id").eq("phone_number", phone).maybeSingle();
    if (row) {
      const { error: updErr } = await db.auth.admin.updateUserById(row.id, { password: TEST_PHONE_PASSWORD });
      if (updErr) return Response.json({ error: updErr.message }, { status: 400 });
    }
    // No row yet (e.g. a previous registration attempt never finished) —
    // proceed anyway; the client's signInWithPassword call right after this
    // will surface any real problem honestly instead of guessing here.
  }

  return Response.json({ ok: true });
}
