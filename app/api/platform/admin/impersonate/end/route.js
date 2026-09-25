import { serviceClient } from "../../../../../../lib/platform/serverDb";

// Logs the other half of "Σύνδεση ως": called by returnToAdminSession()
// right before it swaps the browser back to the admin's own session, using
// the admin's own access token — stashed client-side for exactly this, and
// still valid at this point since nothing has revoked it. Best-effort: if
// this fails (stashed token expired, network hiccup) the return-to-admin
// flow still proceeds, because an admin stuck inside someone else's account
// is a worse outcome than one missing log line.
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

  await db.from("admin_actions").insert({
    admin_id: admin.id,
    action_type: "impersonate_end",
    target_user_id: userId,
    notes: "",
  });

  return Response.json({ ok: true });
}
