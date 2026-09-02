import { serviceClient } from "../../../../../lib/platform/serverDb";

// Self-service (and admin-on-behalf-of) account deletion. Two steps, in this
// order and only this order:
//
// 1. soft_delete_account() — anonymizes the public.users row and scrambles
//    phone_number so it stops colliding with the unique constraint. Never
//    deletes the row: users.id references auth.users(id) on delete cascade,
//    so an actual row delete here would ripple into every table that
//    references it (bookings, reviews, wallet_transactions) — exactly the
//    history the privacy policy promises to keep for 5 years / 12 months.
// 2. auth.admin.updateUserById(id, { phone: null }) — Supabase Auth keeps
//    its own unique phone index on auth.users, separate from our table.
//    Clearing it there is what actually frees the number for a brand new
//    signInWithOtp() cycle later. This does NOT delete the auth user (that
//    would trigger the same cascade as above) — just clears one field.
//
// Authorization lives entirely here, not in the RPC: soft_delete_account is
// never granted to "authenticated", only reachable via the service-role
// client below — same trust model as admin/impersonate.
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

  const { error: rpcErr } = await db.rpc("soft_delete_account", {
    p_user_id: targetId,
    p_notes: targetId === caller.id ? "Αυτοεξυπηρέτηση — ζήτησε ο ίδιος τη διαγραφή." : body.notes || null,
  });
  if (rpcErr) return Response.json({ error: rpcErr.message }, { status: 400 });

  // Best-effort: the account is already anonymized either way, so a failure
  // here (e.g. transient network hiccup) shouldn't block the response — it
  // just means the phone stays reserved at the Supabase Auth layer until
  // retried, which isn't a data problem, only a "can't reuse the number yet"
  // inconvenience.
  await db.auth.admin.updateUserById(targetId, { phone: null }).catch(() => {});

  return Response.json({ ok: true });
}
