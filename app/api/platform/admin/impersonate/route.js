import { serviceClient } from "../../../../../lib/platform/serverDb";

// Resets a test account's PIN to a fresh random value and hands it back so
// the admin can sign in as that account for real (lib/platform/db.js's
// signInWithPin) — a genuine session swap, not the read-only "Προβολή ως".
//
// Guarded twice: the caller must be an admin (checked against their own
// access token, same pattern as seed-demo), AND the target row must already
// have is_test_account = true (set explicitly by an admin beforehand, via
// admin_set_test_account — never inferred from a phone pattern or anything
// else guessable). Resetting a real user's PIN without their knowledge would
// otherwise lock them out of their own account.
function randomPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function requireAdmin(req, db) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: row } = await db.from("users").select("role").eq("id", data.user.id).maybeSingle();
  return row?.role === "admin" ? data.user : null;
}

export async function POST(req) {
  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const admin = await requireAdmin(req, db);
  if (!admin) return Response.json({ error: "not_admin" }, { status: 403 });

  const { userId } = await req.json();
  if (!userId) return Response.json({ error: "missing_user_id" }, { status: 400 });

  const { data: target } = await db
    .from("users")
    .select("id, phone_number, is_test_account")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });
  if (!target.is_test_account) return Response.json({ error: "not_a_test_account" }, { status: 403 });

  const pin = randomPin();
  const { error: updErr } = await db.auth.admin.updateUserById(userId, { password: pin });
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  return Response.json({ phone: target.phone_number, pin });
}
