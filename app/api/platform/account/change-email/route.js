import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "../../../../../lib/platform/serverDb";

// The person changes their own email. It is also a way back into the account
// (forgot-PIN codes go there), so like the phone it needs the current PIN and
// only changes here, never by writing users.email directly (0103).
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

  const { email, pin } = await req.json().catch(() => ({}));
  if (!pin) return Response.json({ error: "missing_fields" }, { status: 400 });

  const { data: me } = await db.from("users").select("id, phone_number, status").eq("id", caller.id).maybeSingle();
  if (!me) return Response.json({ error: "not_found" }, { status: 404 });
  if (me.status === "deleted" || me.status === "suspended") {
    return Response.json({ error: "account_not_active" }, { status: 403 });
  }

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
  await db.auth.admin.signOut(check.session.access_token, "local").catch(() => {});

  const { error } = await db.rpc("apply_email_change", { p_user_id: me.id, p_email: email || "" });
  if (error) return Response.json({ error: error.message === "invalid_email" ? "invalid_email" : "could_not_change" }, { status: 400 });
  return Response.json({ ok: true });
}
