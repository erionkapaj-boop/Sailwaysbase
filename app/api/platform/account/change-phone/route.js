import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "../../../../../lib/platform/serverDb";
import { normalizePhone, isValidPhone } from "../../../../../lib/platform/phone";

// The person changes their own phone number. The phone is also the sign-in
// identity (signInWithPin uses { phone, password }), so the Supabase Auth
// phone and users.phone_number must move together — which is why this is a
// service-role route and users.phone_number is locked against direct writes
// (0094). The old number stays in user_phones for good: nobody else can ever
// register with it.
//
// Asks for the current PIN first: an unlocked phone left on a table must not
// be enough to move someone's account to a different number.
async function requireCaller(req, db) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function POST(req) {
  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const caller = await requireCaller(req, db);
  if (!caller) return Response.json({ error: "not_authenticated" }, { status: 401 });

  const { newPhone, pin } = await req.json().catch(() => ({}));
  if (!newPhone || !pin) return Response.json({ error: "missing_fields" }, { status: 400 });

  const normalized = normalizePhone(newPhone);
  if (!isValidPhone(normalized)) return Response.json({ error: "invalid_phone" }, { status: 400 });

  const { data: me } = await db.from("users").select("id, phone_number, status").eq("id", caller.id).maybeSingle();
  if (!me) return Response.json({ error: "not_found" }, { status: 404 });
  if (me.status === "deleted" || me.status === "suspended") {
    return Response.json({ error: "account_not_active" }, { status: 403 });
  }
  if (normalized === me.phone_number) return Response.json({ error: "same_phone" }, { status: 400 });

  // One of this account's own old numbers is fine; anyone else's, ever, is not.
  const { data: owner } = await db.from("user_phones").select("user_id").eq("phone", normalized).maybeSingle();
  if (owner && owner.user_id !== me.id) return Response.json({ error: "phone_taken" }, { status: 409 });

  // Same lockout as signing in, so this can't be used to guess the PIN.
  const { data: allowed } = await db.rpc("check_login_rate_limit", { p_phone: me.phone_number });
  if (allowed === false) return Response.json({ error: "locked_out" }, { status: 429 });

  const anon = createClient(process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL, process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: check, error: pinErr } = await anon.auth.signInWithPassword({ phone: me.phone_number, password: pin });
  if (pinErr || check?.user?.id !== me.id) {
    await db.from("login_attempts").insert({ phone: me.phone_number, success: false });
    return Response.json({ error: "wrong_pin" }, { status: 400 });
  }
  // That sign-in only proved the PIN — revoke just this one session, not the
  // person's real one in their browser.
  await db.auth.admin.signOut(check.session.access_token, "local").catch(() => {});

  // Auth identity first: if this fails, nothing has changed anywhere.
  const { error: authErr } = await db.auth.admin.updateUserById(me.id, { phone: normalized, phone_confirm: true });
  if (authErr) {
    const taken = /already|registered|exists/i.test(authErr.message || "");
    return Response.json({ error: taken ? "phone_taken" : "could_not_change" }, { status: taken ? 409 : 500 });
  }

  const { error: rowErr } = await db.rpc("apply_phone_change", {
    p_user_id: me.id,
    p_phone: normalized,
    p_source: "self",
    p_actor: me.id,
  });
  if (rowErr) {
    // Put the sign-in identity back, or they'd be locked out with a number
    // the platform doesn't know.
    await db.auth.admin.updateUserById(me.id, { phone: me.phone_number, phone_confirm: true });
    return Response.json({ error: rowErr.message === "phone_taken" ? "phone_taken" : "could_not_change" }, { status: 400 });
  }

  return Response.json({ ok: true, phone: normalized });
}
