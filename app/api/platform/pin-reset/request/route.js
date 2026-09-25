import crypto from "crypto";
import { serviceClient } from "../../../../../lib/platform/serverDb";

const CODE_TTL_MINUTES = 15;
const MAX_CODES_PER_HOUR = 3;

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Email delivery goes through Resend's HTTP API — the only provider-specific
// part of the flow. Both variables unset (today's state) means the channel is
// off: the forgot-PIN page asks GET below and simply doesn't offer email.
function emailConfig() {
  const key = process.env.PLATFORM_EMAIL_API_KEY;
  const from = process.env.PLATFORM_EMAIL_FROM;
  return key && from ? { key, from } : null;
}

async function sendCodeEmail({ key, from }, to, code) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Κωδικός επαναφοράς",
      text:
        `Ο κωδικός επαναφοράς σου είναι: ${code}\n\n` +
        `Ισχύει για ${CODE_TTL_MINUTES} λεπτά. Αν δεν τον ζήτησες εσύ, αγνόησε αυτό το μήνυμα — ` +
        `ο κωδικός σου δεν αλλάζει χωρίς αυτόν.`,
    }),
  });
  return res.ok;
}

export async function GET() {
  return Response.json({ email: Boolean(emailConfig()) });
}

// Issues a one-time code and emails it. Runs server-side because the client
// must never see the code it is supposed to receive out-of-band.
//
// The reply is deliberately identical whether or not the phone exists (or
// has an email on file), so this endpoint can't be used to discover who has
// an account.
export async function POST(req) {
  const generic = { ok: true };

  let phone;
  try {
    ({ phone } = await req.json());
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!phone) return Response.json({ error: "bad_request" }, { status: 400 });

  const config = emailConfig();
  if (!config) return Response.json({ ...generic, delivered: false, reason: "no_email_provider" });

  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const { data: user } = await db
    .from("users")
    .select("id, email, status")
    .eq("phone_number", phone)
    .maybeSingle();

  if (!user?.email || user.status === "deleted") return Response.json(generic);

  // Otherwise anyone who knows a phone number could flood its owner's inbox.
  const { count } = await db
    .from("email_reset_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gt("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
  if ((count || 0) >= MAX_CODES_PER_HOUR) return Response.json(generic);

  const code = String(crypto.randomInt(100000, 1000000));
  const { error } = await db.from("email_reset_codes").insert({
    user_id: user.id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) return Response.json({ error: "could_not_issue" }, { status: 500 });

  if (!(await sendCodeEmail(config, user.email, code))) {
    console.error("pin-reset: email delivery failed");
  }
  return Response.json(generic);
}
