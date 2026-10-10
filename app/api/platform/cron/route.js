import { createClient } from "@supabase/supabase-js";
import { reportServerIssue } from "../../../../lib/platform/serverHealth";

// Isolated from /api/cron/nightly (the base task-management app's cron) —
// separate path, separate schedule, touches only the skipper-platform tables.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  // No secret configured means nobody may run it — not "everybody may".
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = createClient(
    process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL,
    process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY
  );

  const results = {};
  try {
    const { data, error } = await db.rpc("mark_bookings_completed");
    if (error) throw error;
    results.bookingsCompleted = data;
  } catch (e) {
    results.markCompletedError = String(e);
    await reportServerIssue("cron.mark_bookings_completed", "/api/platform/cron", e, ["cron νυχτερινή εργασία"]);
  }

  try {
    const { data, error } = await db.rpc("expire_stale_booking_requests");
    if (error) throw error;
    results.requestsExpired = data;
  } catch (e) {
    results.expireError = String(e);
    await reportServerIssue("cron.expire_stale_booking_requests", "/api/platform/cron", e, ["cron νυχτερινή εργασία"]);
  }

  // Υγεία εφαρμογής (0116): τρέχει κάθε ώρα μέσα στη βάση· εδώ ως εφεδρεία.
  try {
    const { data, error } = await db.rpc("run_health_checks");
    if (error) throw error;
    results.health = data;
  } catch (e) {
    results.healthError = String(e);
    await reportServerIssue("cron.run_health_checks", "/api/platform/cron", e, ["cron νυχτερινή εργασία"]);
  }

  return Response.json({ ok: true, ...results });
}
