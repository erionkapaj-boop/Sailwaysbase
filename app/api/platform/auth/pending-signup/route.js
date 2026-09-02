import crypto from "crypto";
import { serviceClient } from "../../../../../lib/platform/serverDb";

// Registration without real SMS OTP (0075) — while no SMS provider is
// configured, this is the only way a real phone number can get a Supabase
// Auth identity at all: mints one with a random, one-time password and
// hands it back so the client can sign in immediately and continue into
// the normal register -> set-pin flow, where that random password gets
// overwritten by the one the person actually chooses. The account this
// leads to starts unverified (lib/platform/db.js's createUserDraft passes
// phoneVerified: false into complete_registration) — an admin has to
// confirm it's real before the app treats it as a live account.
//
// Deliberately separate from /api/platform/auth/test-signin: that one uses
// a single shared, well-known password because it only ever touches the
// reserved Ghost Mode test range. Mixing the two here would mean a fixed,
// guessable password reachable for a REAL phone number — refused outright.
const TEST_PHONE_RE = /^\+3069800000\d{2}$/;

export async function POST(req) {
  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const { phone } = await req.json().catch(() => ({}));
  if (!phone) return Response.json({ error: "bad_request" }, { status: 400 });
  if (TEST_PHONE_RE.test(phone)) return Response.json({ error: "use_test_signin_instead" }, { status: 403 });

  const { data: existing } = await db.from("users").select("id, status").eq("phone_number", phone).maybeSingle();
  if (existing && existing.status !== "deleted") {
    return Response.json({ error: "phone_already_registered" }, { status: 409 });
  }

  const password = crypto.randomBytes(24).toString("base64url");

  const { error: createErr } = await db.auth.admin.createUser({ phone, password, phone_confirm: true });
  if (createErr) {
    // Already exists at the Auth layer — the revival case (0074): same
    // phone, a previously soft-deleted row. Reuse that identity by
    // resetting its password to this fresh one instead of failing.
    if (!existing) return Response.json({ error: createErr.message }, { status: 400 });
    const { error: updErr } = await db.auth.admin.updateUserById(existing.id, { password });
    if (updErr) return Response.json({ error: updErr.message }, { status: 400 });
  }

  return Response.json({ ok: true, password });
}
