import webpush from "web-push";
import { serviceClient } from "../../../../lib/platform/serverDb";
import { vapidKeys } from "../../../../lib/platform/pushKeys";
import { buildPushMessage } from "../../../../lib/platform/pushMessage";
import { reportServerIssue } from "../../../../lib/platform/serverHealth";
import { translatorFor } from "../../../../lib/platform/serverMessages";

// Στέλνει στα κινητά όσα περιμένουν στην ουρά (push_outbox, 0129). Το καλεί:
//   - η βάση, αμέσως μόλις μπει κάτι στην ουρά (pg_net, ρυθμίσεις push_config),
//   - ο cron κάθε λεπτό, για ό,τι χάθηκε ή δεν πρόλαβε.
// Απαιτεί το CRON_SECRET, όπως το notify-email. Δεν αλλάζει τίποτα όσο δεν υπάρχουν
// ειδοποιήσεις· ό,τι δεν στάλθηκε ξαναδοκιμάζεται (έως 3 φορές).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TIMEOUT_MS = 10000;

// Δίνει κάθε μήνυμα στον browser της συσκευής μέσω της υπηρεσίας push του
// (FCM / Mozilla / Apple). Επιστρέφει: "ok" | "gone" (η συσκευή δεν υπάρχει πια)
// | "retry" (προσωρινό πρόβλημα) | "failed".
async function deliver(sub, payload, vapid, subject) {
  let details;
  try {
    details = webpush.generateRequestDetails(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { vapidDetails: { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 60 * 60 * 24, urgency: "high" }
    );
  } catch {
    return "gone"; // κλειδιά άκυρα: η συσκευή δεν μπορεί να λάβει ποτέ
  }
  try {
    const res = await fetch(details.endpoint, { method: details.method, headers: details.headers, body: details.body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 200 && res.status < 300) return "ok";
    if (res.status === 404 || res.status === 410) return "gone";
    if (res.status === 429 || res.status >= 500) return "retry";
    return "failed";
  } catch {
    return "retry";
  }
}

async function run(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const vapid = vapidKeys();
  const db = serviceClient();
  if (!vapid || !db) return Response.json({ ok: false, error: "not_configured" }, { status: 500 });

  const { data: rows, error } = await db.rpc("claim_push_outbox", { p_limit: 200 });
  if (error) {
    await reportServerIssue("push.claim", "/api/platform/push", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!rows?.length) return Response.json({ ok: true, claimed: 0 });

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: subs, error: subsError } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
  if (subsError) {
    await reportServerIssue("push.subscriptions", "/api/platform/push", subsError);
    await db.rpc("finish_push_outbox", { p_ids: rows.map((r) => r.id), p_status: "retry" });
    return Response.json({ ok: false, error: subsError.message }, { status: 500 });
  }
  const byUser = new Map();
  for (const s of subs || []) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id).push(s);
  }

  const base = (process.env.PLATFORM_PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, "");
  const subject = process.env.PLATFORM_PUSH_SUBJECT || `mailto:support@${new URL(base).hostname}`;
  const translators = new Map();
  const translatorsFor = async (locale) => {
    const key = locale || "el";
    if (!translators.has(key)) {
      translators.set(key, {
        t: await translatorFor(key, "Push"),
        tNotification: await translatorFor(key, "Notification"),
        tRole: await translatorFor(key, "Roles"),
        locale: key,
      });
    }
    return translators.get(key);
  };

  const outcome = { sent: [], retry: [], no_device: [], failed: [] };
  const goneIds = new Set();
  const okIds = new Set();
  for (const row of rows) {
    const devices = byUser.get(row.user_id) || [];
    if (!devices.length) {
      outcome.no_device.push(row.id);
      continue;
    }
    const message = buildPushMessage(row, await translatorsFor(row.locale));
    const results = await Promise.all(devices.map((d) => deliver(d, message, vapid, subject)));
    results.forEach((r, i) => {
      if (r === "gone") goneIds.add(devices[i].id);
      if (r === "ok") okIds.add(devices[i].id);
    });
    if (results.includes("ok")) outcome.sent.push(row.id);
    else if (results.includes("retry")) outcome.retry.push(row.id);
    else if (results.every((r) => r === "gone")) outcome.no_device.push(row.id);
    else outcome.failed.push(row.id);
  }

  if (goneIds.size) await db.from("push_subscriptions").delete().in("id", [...goneIds]);
  if (okIds.size) await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).in("id", [...okIds]);
  for (const [status, ids] of Object.entries(outcome)) {
    if (ids.length) await db.rpc("finish_push_outbox", { p_ids: ids, p_status: status });
  }
  await db.rpc("purge_push_outbox");
  return Response.json({ ok: true, claimed: rows.length, sent: outcome.sent.length, retry: outcome.retry.length, no_device: outcome.no_device.length, failed: outcome.failed.length, removed_devices: goneIds.size });
}

export const POST = run;
export const GET = run;
