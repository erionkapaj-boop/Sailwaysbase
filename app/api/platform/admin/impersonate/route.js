import { serviceClient } from "../../../../../lib/platform/serverDb";

// A real session swap ("Σύνδεση ως"), not the read-only "Προβολή ως": resets
// the target's PIN to a fresh random value server-side and hands it back so
// the admin can sign in as that account for real (lib/platform/db.js's
// signInWithPin).
//
// Used to be restricted to rows explicitly marked is_test_account — real
// customers were only ever reachable through the read-only "Προβολή ως".
// That restriction is gone: an admin can now sign in as any qualifying
// account to actually resolve a problem for them (send the message they're
// stuck on, cancel the request that won't cancel, see exactly what's broken)
// without ever needing their PIN. The trade-off, spelled out to whoever
// clicks it (see the confirm text in db.js): this overwrites the person's
// real PIN, so their own next login needs a fresh one from the admin (or
// "forgot PIN") — there is no way to hand back a password nobody, including
// the admin, ever sees in the clear. Every use is logged to admin_actions
// with the reason typed in, for exactly this reason.
function randomPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function requireAdmin(req, db) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: row } = await db.from("users").select("role, is_staff_admin").eq("id", data.user.id).maybeSingle();
  return row?.role === "admin" || row?.is_staff_admin ? data.user : null;
}

export async function POST(req) {
  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const admin = await requireAdmin(req, db);
  if (!admin) return Response.json({ error: "not_admin" }, { status: 403 });

  const { userId, reason } = await req.json();
  if (!userId) return Response.json({ error: "missing_user_id" }, { status: 400 });

  const { data: target } = await db
    .from("users")
    .select("id, role, full_name, phone_number, status, is_staff_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });
  // Never on an admin row: this resets the target's PIN without asking them,
  // and doing that to a real admin — who could then, while "signed in as"
  // them, do anything in this very console — is a different order of risk
  // than doing it to a client or professional. The client-side buttons
  // already hide for role === "admin"; this is the actual boundary.
  if (target.role === "admin" || target.is_staff_admin) return Response.json({ error: "cannot_impersonate_admin" }, { status: 403 });
  if (target.status === "deleted") return Response.json({ error: "already_deleted" }, { status: 400 });
  if (userId === admin.id) return Response.json({ error: "cannot_impersonate_self" }, { status: 400 });

  const pin = randomPin();
  const { error: updErr } = await db.auth.admin.updateUserById(userId, { password: pin });
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  const reasonText = (reason || "").trim();
  await db.from("admin_actions").insert({
    admin_id: admin.id,
    action_type: "impersonate_start",
    target_user_id: userId,
    notes: reasonText,
  });

  return Response.json({ phone: target.phone_number, pin });
}
