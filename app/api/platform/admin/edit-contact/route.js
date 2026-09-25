import { serviceClient } from "../../../../../lib/platform/serverDb";
import { normalizePhone, isValidPhone } from "../../../../../lib/platform/phone";

// An admin corrects someone's phone number (e.g. a typo at registration —
// signup has no SMS step while no provider is configured, 0075). Phone
// doubles as the Supabase Auth identity (signInWithPin signs in with
// { phone, password }), so both the Auth phone and users.phone_number move
// together, Auth first — a failure there leaves nothing half-changed. The
// old number stays in the account's history (user_phones, 0094) and can
// never be taken by another account.
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

  const { userId, phone } = await req.json();
  if (!userId || !phone) return Response.json({ error: "missing_fields" }, { status: 400 });

  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) return Response.json({ error: "invalid_phone" }, { status: 400 });

  const { data: target } = await db.from("users").select("id, role, phone_number").eq("id", userId).maybeSingle();
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });
  if (target.role === "admin") return Response.json({ error: "cannot_edit_admin" }, { status: 403 });
  if (normalized === target.phone_number) return Response.json({ ok: true, unchanged: true });

  const { data: owner } = await db.from("user_phones").select("user_id").eq("phone", normalized).maybeSingle();
  if (owner && owner.user_id !== userId) return Response.json({ error: "phone_taken" }, { status: 409 });

  // phone_confirm: an unconfirmed Auth phone can't be used with a password
  // sign-in, which would lock them out right after the "fix".
  const { error: authErr } = await db.auth.admin.updateUserById(userId, { phone: normalized, phone_confirm: true });
  if (authErr) {
    const taken = /already|registered|exists/i.test(authErr.message || "");
    return Response.json({ error: taken ? "phone_taken" : authErr.message }, { status: taken ? 409 : 500 });
  }

  const { error: rowErr } = await db.rpc("apply_phone_change", {
    p_user_id: userId,
    p_phone: normalized,
    p_source: "admin",
    p_actor: admin.id,
  });
  if (rowErr) {
    await db.auth.admin.updateUserById(userId, { phone: target.phone_number, phone_confirm: true });
    return Response.json({ error: rowErr.message }, { status: 400 });
  }

  await db.from("admin_actions").insert({
    admin_id: admin.id,
    action_type: "edit_contact",
    target_user_id: userId,
    notes: `τηλέφωνο: «${target.phone_number}» → «${normalized}»`,
  });

  return Response.json({ ok: true, phone: normalized });
}
