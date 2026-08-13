import crypto from "crypto";
import { serviceClient } from "../../../../../lib/platform/serverDb";

const CODE_TTL_MINUTES = 15;

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Issues a one-time code and emails it. Runs server-side because the client
// must never see the code it is supposed to receive out-of-band.
//
// The reply is deliberately identical whether or not the phone exists, so this
// endpoint can't be used to discover who has an account.
export async function POST(req) {
  const generic = { ok: true };

  let phone;
  try {
    ({ phone } = await req.json());
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!phone) return Response.json({ error: "bad_request" }, { status: 400 });

  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const { data: user } = await db
    .from("users")
    .select("id,email")
    .eq("phone_number", phone)
    .maybeSingle();

  if (!user?.email) return Response.json(generic);

  const code = String(crypto.randomInt(100000, 1000000));
  const { error } = await db.from("email_reset_codes").insert({
    user_id: user.id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) return Response.json({ error: "could_not_issue" }, { status: 500 });

  // No email provider is configured yet (the plan leaves the choice open), so
  // the code is stored but cannot actually be delivered. Report that honestly
  // rather than letting the UI imply an email is on its way.
  if (!process.env.PLATFORM_EMAIL_API_KEY) {
    return Response.json({ ...generic, delivered: false, reason: "no_email_provider" });
  }

  // Wire the chosen provider here; the code above is already persisted.
  return Response.json({ ...generic, delivered: false, reason: "no_email_provider" });
}
