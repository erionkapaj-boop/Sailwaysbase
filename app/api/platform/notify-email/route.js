import { serviceClient } from "../../../../lib/platform/serverDb";
import { emailConfig, sendEmail } from "../../../../lib/platform/email";
import { EMAIL_KINDS, buildNotificationEmail } from "../../../../lib/platform/emailNotifications";

// Sends the notifications waiting for an email (0103). Called every few
// minutes by the database itself (pg_cron + pg_net, see the SQL in
// docs/PENDING.md), with CRON_SECRET — required here, unlike the nightly
// cron: this route sends email to real people.
//
// The database decides what goes out (claim_notification_emails): not what
// the person already saw in the app, not to anyone who turned emails off.
// This only groups per person, writes the email and reports back.
export const dynamic = "force-dynamic";

async function run(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const config = emailConfig();
  // Nothing is claimed while email is off, so turning it on later doesn't
  // lose anything from the last two days.
  if (!config) return Response.json({ ok: true, skipped: "no_email_provider" });
  const db = serviceClient();
  if (!db) return Response.json({ ok: false, error: "not_configured" }, { status: 500 });

  const { data: rows, error } = await db.rpc("claim_notification_emails", { p_kinds: EMAIL_KINDS });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const baseUrl = (process.env.PLATFORM_PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, "");
  const byUser = new Map();
  for (const r of rows || []) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, { email: r.email, name: r.full_name, items: [] });
    byUser.get(r.user_id).items.push(r);
  }

  const sent = [];
  const failed = [];
  let retry = 0;
  for (const person of byUser.values()) {
    const ids = person.items.map((i) => i.id);
    const status = await sendEmail(config, { to: person.email, ...buildNotificationEmail({ ...person, baseUrl }) });
    if (status >= 200 && status < 300) sent.push(...ids);
    // A rejected address won't get better; an outage will — those stay
    // 'sending' and the database hands them out again in 30 minutes.
    else if (status >= 400 && status < 500 && status !== 429) failed.push(...ids);
    else retry += ids.length;
  }
  if (sent.length) await db.rpc("mark_notification_emails", { p_ids: sent, p_status: "sent" });
  if (failed.length) await db.rpc("mark_notification_emails", { p_ids: failed, p_status: "failed" });

  return Response.json({ ok: true, people: byUser.size, sent: sent.length, failed: failed.length, retry });
}

export const GET = run;
export const POST = run;
