import { serviceClient } from "../../../../../lib/platform/serverDb";

// Corrects a phone number, the one field admin_update_profile (a plain RPC)
// can't safely touch: phone doubles as the Supabase Auth identity
// (signInWithPin signs in with { phone, password }), so changing
// public.users.phone_number alone would desync it from auth.users.phone and
// lock the person out with their own, unchanged PIN. This route updates
// both, via service role, in that order — auth identity first, so a failure
// there never leaves the public row pointing at a phone Auth doesn't
// recognise.
//
// Exists because signup here has no SMS verification step (0075) — a typo'd
// digit at registration is a real, and until now unfixable, support
// scenario: the person types their number correctly at login and it doesn't
// match what the platform captured.
function normalizePhone(raw) {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+30" + digits.slice(1);
  if (digits.startsWith("30")) return "+" + digits;
  return "+30" + digits;
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

  const { userId, phone } = await req.json();
  if (!userId || !phone) return Response.json({ error: "missing_fields" }, { status: 400 });

  const normalized = normalizePhone(phone);
  if (!/^\+\d{10,15}$/.test(normalized)) return Response.json({ error: "invalid_phone" }, { status: 400 });

  const { data: target } = await db.from("users").select("id, role, phone_number").eq("id", userId).maybeSingle();
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });
  if (target.role === "admin") return Response.json({ error: "cannot_edit_admin" }, { status: 403 });
  if (normalized === target.phone_number) return Response.json({ ok: true, unchanged: true });

  const { data: clash } = await db.from("users").select("id").eq("phone_number", normalized).maybeSingle();
  if (clash) return Response.json({ error: "phone_taken" }, { status: 409 });

  const { error: authErr } = await db.auth.admin.updateUserById(userId, { phone: normalized });
  if (authErr) return Response.json({ error: authErr.message }, { status: 500 });

  const { error: rowErr } = await db.from("users").update({ phone_number: normalized }).eq("id", userId);
  if (rowErr) return Response.json({ error: rowErr.message }, { status: 500 });

  await db.from("admin_actions").insert({
    admin_id: admin.id,
    action_type: "edit_contact",
    target_user_id: userId,
    notes: `τηλέφωνο: «${target.phone_number}» → «${normalized}»`,
  });

  return Response.json({ ok: true, phone: normalized });
}
