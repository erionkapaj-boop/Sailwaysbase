import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "../../../../../lib/platform/serverDb";

// Self-service (and admin-on-behalf-of) account deletion.
//
// soft_delete_account() (0074) marks the row status='deleted' and hides the
// professional profile — it deliberately leaves phone_number, email and
// full_name untouched, and never calls auth.admin.updateUserById to clear
// the phone either. Both were tried in an earlier version and reverted: any
// clearing there broke the one behaviour that was explicitly asked for — a
// later registration with the *same* phone number recognizes the same
// Supabase Auth identity and revives this exact row (see
// complete_registration()), rating/reliability/booking history intact,
// instead of quietly starting a second, unrelated account with a clean
// slate. Never deletes the row outright either: users.id references
// auth.users(id) on delete cascade, so a real delete would ripple into
// every table that references it (bookings, reviews, wallet_transactions) —
// exactly the history the privacy policy promises to keep for 5 years / 12
// months, and also exactly what a returning account needs kept.
//
// Authorization lives entirely here, not in the RPC: soft_delete_account is
// never granted to "authenticated", only reachable via the service-role
// client below — same trust model as the other service-role routes (admin/reset-pin).
async function requireCaller(req, db) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function checkPin(db, userId, pin) {
  if (!pin) return { error: "missing_fields", status: 400 };
  const { data: me } = await db.from("users").select("phone_number").eq("id", userId).maybeSingle();
  if (!me?.phone_number) return { error: "not_found", status: 404 };
  const { data: allowed } = await db.rpc("check_login_rate_limit", { p_phone: me.phone_number });
  if (allowed === false) return { error: "locked_out", status: 429 };
  const anon = createClient(process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL, process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: check, error } = await anon.auth.signInWithPassword({ phone: me.phone_number, password: pin });
  if (error || check?.user?.id !== userId) {
    await db.from("login_attempts").insert({ phone: me.phone_number, success: false });
    return { error: "wrong_pin", status: 400 };
  }
  // That sign-in only proved the PIN.
  await db.auth.admin.signOut(check.session.access_token, "local").catch(() => {});
  return null;
}

export async function POST(req) {
  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const caller = await requireCaller(req, db);
  if (!caller) return Response.json({ error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let targetId = caller.id;

  // Admin deleting someone else's account, not their own.
  if (body.userId && body.userId !== caller.id) {
    const { data: callerRow } = await db.from("users").select("role, is_staff_admin").eq("id", caller.id).maybeSingle();
    if (callerRow?.role !== "admin" && !callerRow?.is_staff_admin) {
      return Response.json({ error: "not_admin" }, { status: 403 });
    }
    targetId = body.userId;
  }

  // Deleting your own account asks for your PIN, like changing your phone or
  // email: an unlocked phone left on a table must not be enough.
  if (targetId === caller.id) {
    const problem = await checkPin(db, caller.id, body.pin);
    if (problem) return Response.json({ error: problem.error }, { status: problem.status });
  }

  const { error: rpcErr } = await db.rpc("soft_delete_account", {
    p_user_id: targetId,
    p_notes: targetId === caller.id ? "Αυτοεξυπηρέτηση — ζήτησε ο ίδιος τη διαγραφή." : body.notes || null,
  });
  if (rpcErr) return Response.json({ error: rpcErr.message }, { status: 400 });

  return Response.json({ ok: true });
}
