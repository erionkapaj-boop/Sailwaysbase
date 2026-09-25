import { serviceClient } from "../../../../../lib/platform/serverDb";

// A temporary PIN for someone who forgot theirs. SMS reset isn't live in
// production (0075), so "Ξέχασα τον κωδικό" sends people to the contact form —
// and until now the admin had nothing to help them with once they wrote in.
//
// The admin reads the new PIN to the person over the phone; they sign in and
// change it from Το προφίλ μου → Αλλαγή κωδικού. Also clears any lockout from
// wrong attempts. Never on the main admin row itself.
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

  const { userId } = await req.json();
  if (!userId) return Response.json({ error: "missing_user_id" }, { status: 400 });

  const { data: target } = await db
    .from("users")
    .select("id, role, phone_number, status")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });
  if (target.role === "admin") return Response.json({ error: "cannot_reset_admin" }, { status: 403 });
  if (target.status === "deleted") return Response.json({ error: "already_deleted" }, { status: 400 });

  const pin = randomPin();
  const { error: updErr } = await db.auth.admin.updateUserById(userId, { password: pin });
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  // Same unlock the SMS reset performs (clear_login_attempts): a success row
  // resets the count of consecutive failures.
  if (target.phone_number) await db.from("login_attempts").insert({ phone: target.phone_number, success: true });

  await db.from("admin_actions").insert({
    admin_id: admin.id,
    action_type: "reset_pin",
    target_user_id: userId,
    notes: "",
  });

  return Response.json({ phone: target.phone_number, pin });
}
