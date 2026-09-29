import crypto from "crypto";
import { serviceClient } from "../../../../../lib/platform/serverDb";
import { pinProblem } from "../../../../../lib/platform/pin";

// A 6-digit code has a million values; without a cap, 15 minutes is plenty
// of time to try them all. After this many wrong tries the code is burnt and
// a new one has to be requested (itself capped per hour).
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Verifies a one-time code and sets the new PIN through the admin API. The
// user has no session at this point — that's the whole reason they're here.
export async function POST(req) {
  let phone, code, newPin;
  try {
    ({ phone, code, newPin } = await req.json());
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!phone || !code || !newPin) return Response.json({ error: "bad_request" }, { status: 400 });
  const problem = pinProblem(newPin);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const { data: user } = await db.from("users").select("id").eq("phone_number", phone).maybeSingle();
  if (!user) return Response.json({ error: "invalid_code" }, { status: 400 });

  const { data: row } = await db
    .from("email_reset_codes")
    .select("id,code_hash,failed_attempts")
    .eq("user_id", user.id)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .lt("failed_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return Response.json({ error: "invalid_code" }, { status: 400 });

  // Every try uses up one attempt BEFORE the code is compared, and only if
  // nobody else took that same attempt in the meantime. Otherwise many
  // requests sent at once would all read "0 attempts" and all get to guess.
  const { data: taken } = await db
    .from("email_reset_codes")
    .update({ failed_attempts: row.failed_attempts + 1 })
    .eq("id", row.id)
    .eq("failed_attempts", row.failed_attempts)
    .is("used_at", null)
    .select("id");
  if (!taken?.length) return Response.json({ error: "invalid_code" }, { status: 400 });

  // Constant-time compare so a wrong code can't be narrowed down by timing.
  const provided = Buffer.from(hashCode(String(code)));
  const stored = Buffer.from(row.code_hash);
  const match = provided.length === stored.length && crypto.timingSafeEqual(provided, stored);
  if (!match) return Response.json({ error: "invalid_code" }, { status: 400 });

  const { error: updErr } = await db.auth.admin.updateUserById(user.id, { password: newPin });
  if (updErr) return Response.json({ error: "could_not_set_pin" }, { status: 500 });

  await db.from("email_reset_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  // Clear the lockout, otherwise the user resets their PIN and still can't in.
  await db.from("login_attempts").insert({ phone, success: true });
  // Their own PIN now — a pending temporary one from the admin no longer applies.
  await db.from("users").update({ pin_change_required: false }).eq("id", user.id);
  // Whoever was signed in with the old PIN (a lost phone, someone who guessed
  // it) is signed out everywhere.
  await db.rpc("revoke_user_sessions", { p_user_id: user.id });

  return Response.json({ ok: true });
}
